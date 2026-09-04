// Item-level Return / Replace requests — the single shared definition.
//
// This is the backbone of the per-item return/replace/refund system. It is
// deliberately dependency-light (only lib/itemFulfilment and the return-window
// policy) so the exact same rules run in the browser (to show/hide controls),
// on the server route (where they are ENFORCED) and in tests, exactly like
// lib/returnEligibility, lib/orderTracking and lib/itemFulfilment.
//
// Design decisions this encodes (all confirmed, not invented):
//
//   - Requests are PER ITEM, not per order. A request identifies one order
//     line by its vendor-scoped itemKey — the SAME key sellerOrders already
//     uses (lib/sellerOrderRecord builds it as itemKeyFor(vendorIndex, id)) —
//     so a request, the seller's fulfilment entry and any replacement all name
//     the same line.
//
//   - Eligibility is judged on the ITEM's delivered state from
//     sellerOrders.itemFulfilment, not the order-level roll-up. A delivered
//     item in a partially-delivered order is therefore returnable.
//
//   - Refund destination is REWARD POINTS. That is the only refund mechanism
//     the codebase actually has (lib/returns.ts credits user.rewardPoints;
//     there is no Razorpay/original-payment refund anywhere). The UI must say
//     so — see REFUND_DESTINATION_LABEL.
//
//   - Refund amount is the item's PROPORTIONAL share of what was actually
//     paid (finalTotal), never more than the item's own list value, computed
//     on the server — never taken from the client.
//
//   - The legacy order-level `returns` collection is untouched and keeps
//     working; this is a new `itemRequests` collection alongside it.

import { RETURN_WINDOW_DAYS } from "@/lib/returnEligibility";
import { itemKeyFor } from "@/lib/itemFulfilment";

export const ITEM_REQUEST_TYPES = ["return", "replace"] as const;
export type ItemRequestType = (typeof ITEM_REQUEST_TYPES)[number];

// --- state machines ---------------------------------------------------------
//
// Forward-only lifecycles. A request never shows a stage that has not actually
// happened. Terminal states are reachable from the early review stages only.

/** Return lifecycle, in order. */
export const RETURN_STAGES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PICKUP_PROPOSED",
  "PICKUP_CONFIRMED",
  "PICKUP_ASSIGNED",
  "PICKED_UP",
  "RECEIVED_BY_YOMICO",
  "SELLER_INSPECTION",
  "REFUND_PENDING",
  "REFUNDED",
] as const;
export type ReturnStage = (typeof RETURN_STAGES)[number];

/** Replace lifecycle, in order. Mirrors the fulfilment vocabulary. */
export const REPLACE_STAGES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "SELLER_PREPARING",
  "READY_FOR_DELIVERY",
  "HANDED_OVER_TO_COURIER",
  "DELIVERED",
] as const;
export type ReplaceStage = (typeof REPLACE_STAGES)[number];

/** Terminal outcomes shared by both flows. */
export const TERMINAL_STAGES = ["REJECTED", "CANCELLED"] as const;
export type TerminalStage = (typeof TERMINAL_STAGES)[number];

export type RequestStatus = ReturnStage | ReplaceStage | TerminalStage;

/** The initial status every request is created with. */
export const INITIAL_STATUS: RequestStatus = "REQUESTED";

// A request may still be REJECTED (by admin) or CANCELLED (by the customer)
// only while it is early enough that no physical/monetary step has happened.
// After the goods move or money is committed, neither is offered.
const REJECTABLE_FROM = new Set<string>(["REQUESTED", "UNDER_REVIEW", "APPROVED"]);
const CANCELLABLE_FROM = new Set<string>(["REQUESTED", "UNDER_REVIEW"]);

function forwardMap(stages: readonly string[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (let i = 0; i < stages.length - 1; i++) next[stages[i]] = stages[i + 1];
  return next;
}

const RETURN_NEXT = forwardMap(RETURN_STAGES);
const REPLACE_NEXT = forwardMap(REPLACE_STAGES);

export function isTerminal(status: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(status);
}

// The replace stages a SELLER (not just admin) may drive — the fulfilment
// portion of the replacement lifecycle. Single-sourced so the transition
// route's authorization and the seller UI's available actions cannot drift.
export const SELLER_REPLACE_TARGETS: readonly string[] = [
  "SELLER_PREPARING",
  "READY_FOR_DELIVERY",
  "HANDED_OVER_TO_COURIER",
  "DELIVERED",
];

// The return stages a SELLER may drive. Once the item is physically back with
// the seller, THEY carry it through inspection: entering SELLER_INSPECTION and
// then completing it into REFUND_PENDING (which hands the refund decision to
// admin). The refund itself (REFUNDED, where reward points are credited) and
// all pickup scheduling stay admin-only — REFUNDED is deliberately absent here.
export const SELLER_RETURN_TARGETS: readonly string[] = [
  "SELLER_INSPECTION",
  "REFUND_PENDING",
];

/** Every stage the owning seller may drive, by request type. */
export function sellerTargetsFor(type: ItemRequestType): readonly string[] {
  return type === "replace" ? SELLER_REPLACE_TARGETS : SELLER_RETURN_TARGETS;
}

/**
 * The next stage a SELLER may move a request to, or null when the next step
 * isn't the seller's to make (still awaiting admin action, done, or terminal).
 * Covers BOTH flows: replacement fulfilment and the return's seller-inspection.
 */
export function sellerNextStage(
  type: ItemRequestType,
  from: string
): string | null {
  const next = nextStage(type, from);
  return next && sellerTargetsFor(type).includes(next) ? next : null;
}

/**
 * Back-compat shim for callers that only handled replacements. Prefer
 * sellerNextStage, which also covers the return seller-inspection step.
 */
export function sellerNextReplaceStage(
  type: ItemRequestType,
  from: string
): string | null {
  return type === "replace" ? sellerNextStage(type, from) : null;
}

/**
 * A request is waiting on the CUSTOMER to accept or counter a proposed pickup
 * slot. The customer respond route (the only customer-driven mutation) is
 * limited to exactly this state.
 */
export function isAwaitingCustomerPickup(status: string): boolean {
  return status === "PICKUP_PROPOSED";
}

export function stagesFor(type: ItemRequestType): readonly string[] {
  return type === "replace" ? REPLACE_STAGES : RETURN_STAGES;
}

/** The next forward stage, or null at the end / from a terminal state. */
export function nextStage(
  type: ItemRequestType,
  from: string
): string | null {
  if (isTerminal(from)) return null;
  const map = type === "replace" ? REPLACE_NEXT : RETURN_NEXT;
  return map[from] ?? null;
}

/**
 * Whether `to` is a legal move from `from` for this request type.
 *
 * Legal moves are: exactly one step forward along the lifecycle, or a jump to
 * REJECTED/CANCELLED from an early stage. Nothing else — no skipping, no
 * rewinding, no leaving a terminal state.
 */
export function isLegalTransition(
  type: ItemRequestType,
  from: string,
  to: string
): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;

  if (to === "REJECTED") return REJECTABLE_FROM.has(from);
  if (to === "CANCELLED") return CANCELLABLE_FROM.has(from);

  return nextStage(type, from) === to;
}

// --- customer-facing wording ------------------------------------------------
//
// Plain language for a normal shopper — no internal state names on screen.

const RETURN_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  PICKUP_PROPOSED: "Pickup time proposed",
  PICKUP_CONFIRMED: "Pickup confirmed",
  PICKUP_ASSIGNED: "Partner assigned",
  PICKED_UP: "Picked up",
  RECEIVED_BY_YOMICO: "Received at YOMICO",
  SELLER_INSPECTION: "Seller inspection",
  REFUND_PENDING: "Refund processing",
  REFUNDED: "Refunded",
  REJECTED: "Not approved",
  CANCELLED: "Cancelled",
  // Legacy label kept so any request created before the negotiation flow still
  // renders a name instead of a raw status enum.
  PICKUP_SCHEDULED: "Pickup scheduled",
};

const REPLACE_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  SELLER_PREPARING: "Seller preparing",
  READY_FOR_DELIVERY: "Ready for delivery",
  HANDED_OVER_TO_COURIER: "Handed over to courier",
  DELIVERED: "Delivered",
  REJECTED: "Not approved",
  CANCELLED: "Cancelled",
};

export function statusLabel(type: ItemRequestType, status: string): string {
  const map = type === "replace" ? REPLACE_LABELS : RETURN_LABELS;
  return map[status] ?? status;
}

/** Tone for a status badge: green ok, red bad, blue in-progress, grey idle. */
export function statusTone(status: string): "ok" | "bad" | "running" | "idle" {
  if (status === "REFUNDED" || status === "DELIVERED") return "ok";
  if (status === "REJECTED" || status === "CANCELLED") return "bad";
  if (status === "REQUESTED") return "idle";
  return "running";
}

// The single true statement about where a refund goes. Used everywhere money
// is described, so the customer is never told "original payment method".
export const REFUND_DESTINATION = "REWARD_POINTS" as const;
export const REFUND_DESTINATION_LABEL = "YOMICO reward points";

// --- item identity ----------------------------------------------------------

export type OrderLike = {
  items?: unknown;
  finalTotal?: unknown;
  total?: unknown;
  userId?: unknown;
};

export type OrderItemLike = {
  id?: unknown;
  name?: unknown;
  image?: unknown;
  qty?: unknown;
  price?: unknown;
  size?: unknown;
  color?: unknown;
  vendorId?: unknown;
};

function asItems(order: OrderLike | null | undefined): OrderItemLike[] {
  return Array.isArray(order?.items) ? (order!.items as OrderItemLike[]) : [];
}

/**
 * The vendor-scoped itemKey for the order line at `parentIndex`.
 *
 * MUST match how lib/sellerOrderRecord assigns keys: filter the order to the
 * item's vendor, then index within that filtered list. Computing it the same
 * way here is what lets a request point at the seller's fulfilment entry.
 *
 * Returns null if the index is out of range or the item has no vendor — the
 * caller (the server route) then rejects the request rather than guessing.
 */
export function itemKeyForOrderIndex(
  order: OrderLike | null | undefined,
  parentIndex: number
): { itemKey: string; vendorId: string; productId: string } | null {
  const items = asItems(order);
  const item = items[parentIndex];
  if (!item) return null;

  const vendorId = typeof item.vendorId === "string" ? item.vendorId : "";
  if (!vendorId) return null;

  const vendorItems = items.filter((i) => i?.vendorId === vendorId);
  const vendorIndex = vendorItems.indexOf(item);
  if (vendorIndex < 0) return null;

  const productId =
    item.id === undefined || item.id === null ? "" : String(item.id);

  return {
    itemKey: itemKeyFor(vendorIndex, item.id),
    vendorId,
    productId,
  };
}

/** A snapshot of the line, stored on the request so it survives later edits. */
export function itemSnapshot(item: OrderItemLike) {
  const qtyNum = Number(item?.qty);
  const priceNum = Number(item?.price);
  return {
    productId:
      item?.id === undefined || item?.id === null ? "" : String(item.id),
    name: typeof item?.name === "string" ? item.name : "Product",
    image: typeof item?.image === "string" ? item.image : "",
    qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1,
    unitPrice: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : 0,
    size: typeof item?.size === "string" ? item.size : "",
    color: typeof item?.color === "string" ? item.color : "",
    vendorId: typeof item?.vendorId === "string" ? item.vendorId : "",
  };
}

// --- refund maths -----------------------------------------------------------

function lineValue(item: OrderItemLike): number {
  const qty = Number(item?.qty);
  const price = Number(item?.price);
  const q = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const p = Number.isFinite(price) && price >= 0 ? price : 0;
  return q * p;
}

/** Sum of every line's list value. */
export function orderItemsValue(order: OrderLike | null | undefined): number {
  return asItems(order).reduce((sum, it) => sum + lineValue(it), 0);
}

/**
 * The server-authoritative refund for ONE line, in whole rupees.
 *
 * The item's proportional share of what was actually paid:
 *
 *     finalTotal x (lineValue / orderItemsValue)
 *
 * so an order-level coupon/reward discount is shared fairly. Bounded to
 * [0, lineValue] — a refund can never be negative, and never exceed the item's
 * own list value even if finalTotal somehow exceeds the items' sum. The
 * document write is separately capped at the order total by firestore.rules.
 */
export function refundableForOrderIndex(
  order: OrderLike | null | undefined,
  parentIndex: number
): number {
  const items = asItems(order);
  const item = items[parentIndex];
  if (!item) return 0;

  const line = lineValue(item);
  if (line <= 0) return 0;

  const itemsValue = orderItemsValue(order);
  if (itemsValue <= 0) return 0;

  const finalTotalNum = Number(order?.finalTotal);
  const totalNum = Number(order?.total);
  const paid = Number.isFinite(finalTotalNum) && finalTotalNum > 0
    ? finalTotalNum
    : Number.isFinite(totalNum) && totalNum > 0
    ? totalNum
    : itemsValue;

  const share = paid * (line / itemsValue);
  const rounded = Math.round(share);

  if (rounded < 0) return 0;
  if (rounded > line) return line;
  return rounded;
}

// --- per-item eligibility ---------------------------------------------------

export type ItemFulfilmentEntryLike = {
  status?: unknown;
  deliveredAt?: unknown;
};

export type SellerRecordLike = {
  itemFulfilment?: Record<string, ItemFulfilmentEntryLike> | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const c = value as { toDate?: () => Date; seconds?: number };
  if (typeof c.toDate === "function") {
    try {
      const d = c.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof c.seconds === "number") return new Date(c.seconds * 1000);
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Whether this specific line has been delivered, per its fulfilment entry. */
export function isItemDelivered(
  sellerRecord: SellerRecordLike | null | undefined,
  itemKey: string
): boolean {
  const entry = sellerRecord?.itemFulfilment?.[itemKey];
  return entry?.status === "Delivered";
}

/**
 * When the return window closes for this line, from its own delivered date.
 * Null when no delivered date is recorded — the caller then allows the request
 * but flags it for review, exactly as the order-level flow does.
 */
export function itemReturnWindowEndsAt(
  sellerRecord: SellerRecordLike | null | undefined,
  itemKey: string
): Date | null {
  const entry = sellerRecord?.itemFulfilment?.[itemKey];
  const delivered = toDate(entry?.deliveredAt);
  if (!delivered) return null;
  const end = new Date(delivered.getTime());
  end.setDate(end.getDate() + RETURN_WINDOW_DAYS);
  return end;
}

export function isItemWithinReturnWindow(
  sellerRecord: SellerRecordLike | null | undefined,
  itemKey: string,
  now: Date = new Date()
): boolean {
  const end = itemReturnWindowEndsAt(sellerRecord, itemKey);
  if (!end) return true; // fail open, flag for review
  return now.getTime() <= end.getTime();
}

export type EligibilityResult = {
  eligible: boolean;
  /** True when eligible but no delivered date was found — needs admin review. */
  needsReview: boolean;
  reason:
    | "ok"
    | "needs-review"
    | "not-delivered"
    | "window-closed";
};

/**
 * The one place that decides whether a line may be returned/replaced. Both the
 * client (to show controls) and app/api/item-request (to enforce) call this.
 */
export function itemRequestEligibility(
  sellerRecord: SellerRecordLike | null | undefined,
  itemKey: string,
  now: Date = new Date()
): EligibilityResult {
  if (!isItemDelivered(sellerRecord, itemKey)) {
    return { eligible: false, needsReview: false, reason: "not-delivered" };
  }
  const end = itemReturnWindowEndsAt(sellerRecord, itemKey);
  if (!end) {
    return { eligible: true, needsReview: true, reason: "needs-review" };
  }
  if (now.getTime() > end.getTime()) {
    return { eligible: false, needsReview: false, reason: "window-closed" };
  }
  return { eligible: true, needsReview: false, reason: "ok" };
}

// --- identity / dedupe ------------------------------------------------------

/**
 * Deterministic request id: one request per (order, item). Race-safe dedupe
 * without a query, the same trick returns/orders already use. A new request
 * for the same line is only allowed to replace one in a TERMINAL state
 * (rejected/cancelled) — enforced in the route, which reads this doc first.
 */
export function itemRequestId(orderId: string, itemKey: string): string {
  return `${orderId}__${itemKey}`;
}
