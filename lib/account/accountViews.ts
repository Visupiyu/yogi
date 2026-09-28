// Customer account views — the ONLY shapes the account dashboard, Returns &
// Refunds, Reward Wallet and Referral History pages receive
// (app/api/account/*). Built on the server from documents already scoped to
// the verified customer, cut down to explicit fields. Never a whole document,
// never another customer's name, email or uid, never vendor / admin / rider /
// review-hold data.
//
// No new money or points maths lives here. Balances are the stored
// users.rewardPoints; pending points and their holds come from
// lib/rewardCredit (the one crediting rule); refund amounts are the stored,
// server-computed figures; statuses and labels come from lib/itemRequests and
// lib/itemFulfilment. Server-only (node:crypto for opaque ids).
import { createHash } from "node:crypto";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";
import {
  REFUND_DESTINATION_LABEL,
  isTerminal,
  stagesFor,
  statusLabel,
  statusTone,
  type ItemRequestType,
} from "@/lib/itemRequests";
import {
  earnedPointsFor,
  evaluateRewardCredit,
  summariseItemReturns,
  type RewardCreditOrder,
} from "@/lib/rewardCredit";
import { returnWindowEndsAt } from "@/lib/returnEligibility";
import {
  REFERRER_BONUS,
  WELCOME_BONUS,
  isWellFormedReferralCode,
  referrerLedgerId,
  welcomeLedgerId,
} from "@/lib/referrals";

export type Doc = Record<string, unknown>;
export type Row = { id: string; data: Doc };

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

export function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "string" && v && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
}
function ms(v: unknown): number {
  const s = iso(v);
  return s ? Date.parse(s) : 0;
}
function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function strOrNull(v: unknown, max = 200): string | null {
  const s = str(v, max);
  return s ? s : null;
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: unknown): number {
  return Math.max(0, Math.round(num(v) * 100) / 100);
}

/** A stable id that does not reveal the underlying document id. */
export function opaqueId(docId: string): string {
  return createHash("sha256").update(`account:${docId}`).digest("hex").slice(0, 20);
}

/** Only the last 6 characters of a provider reference, or null. */
export function lastSix(ref: unknown): string | null {
  const s = typeof ref === "string" ? ref.trim() : "";
  return s ? s.slice(-6) : null;
}

export type OrderNumbers = Map<string, string | null>;
export function orderNumbersOf(orders: Row[]): OrderNumbers {
  return new Map(orders.map((o) => [o.id, strOrNull(o.data.orderNumber, 60)]));
}

const CLOSED_ORDER = new Set(["Delivered", "Cancelled", "Returned"]);

// ---------------------------------------------------------------------------
// Orders (dashboard cards)
// ---------------------------------------------------------------------------

export type AccountOrderCard = {
  orderId: string;
  orderNumber: string | null;
  placedAt: string | null;
  status: string;
  statusLabel: string;
  itemCount: number;
  total: number;
  firstItem: { name: string; image: string } | null;
};
export const ACCOUNT_ORDER_CARD_KEYS = [
  "orderId", "orderNumber", "placedAt", "status", "statusLabel", "itemCount", "total", "firstItem",
] as const;

export function buildOrderCard(o: Row): AccountOrderCard {
  const items = Array.isArray(o.data.items) ? (o.data.items as Doc[]) : [];
  const status = str(o.data.status, 60) || "Pending";
  const first = items[0];
  return {
    // The customer's OWN order id, needed for the /orders/[id] link.
    orderId: o.id,
    orderNumber: strOrNull(o.data.orderNumber, 60),
    placedAt: iso(o.data.createdAt),
    status,
    statusLabel: fulfilmentStageLabel(status),
    itemCount: items.reduce((s, it) => s + Math.max(0, Math.floor(num(it?.qty ?? it?.quantity))), 0),
    total: money(o.data.finalTotal ?? o.data.total),
    firstItem: first ? { name: str(first.name ?? first.title, 200) || "Product", image: str(first.image, 1000) } : null,
  };
}

export function orderCounts(orders: Row[]) {
  let active = 0;
  let delivered = 0;
  let cancelled = 0;
  for (const o of orders) {
    const s = str(o.data.status);
    if (s === "Delivered") delivered++;
    else if (s === "Cancelled") cancelled++;
    if (!CLOSED_ORDER.has(s)) active++;
  }
  return { total: orders.length, active, delivered, cancelled };
}

export function newestOrders(orders: Row[], n: number): Row[] {
  return [...orders].sort((a, b) => ms(b.data.createdAt) - ms(a.data.createdAt)).slice(0, n);
}

// ---------------------------------------------------------------------------
// Returns & refunds
// ---------------------------------------------------------------------------

/** The customer may counter a proposed pickup slot at most this often —
 *  the same limit app/api/item-request/respond enforces. */
export const MAX_PICKUP_COUNTERS = 2;

const BY_LABEL: Record<string, "you" | "YOMICO" | "seller" | "delivery"> = {
  customer: "you",
  admin: "YOMICO",
  seller: "seller",
  delivery: "delivery",
};

export type ReturnRequestView = {
  id: string;
  requestNumber: string | null;
  type: "return" | "replace";
  orderId: string;
  orderNumber: string | null;
  item: { name: string; image: string; qty: number; unitPrice: number; size: string; color: string };
  reason: string;
  comments: string;
  status: string;
  statusLabel: string;
  tone: "ok" | "bad" | "running" | "idle";
  step: { index: number; total: number } | null;
  terminal: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  pickup: {
    proposedAt: string | null;
    counterAt: string | null;
    scheduledAt: string | null;
    customerResponse: "pending" | "accepted" | "countered" | null;
    canRespond: boolean;
    countersLeft: number;
    partner: string | null;
    pickedUpAt: string | null;
    receivedAt: string | null;
  } | null;
  refund: {
    amount: number;
    destination: "REWARD_POINTS";
    destinationLabel: string;
    status: "pending" | "credited" | "not-refunded";
    refundNumber: string | null;
    creditedAt: string | null;
  } | null;
  timeline: { status: string; label: string; at: string | null; by: "you" | "YOMICO" | "seller" | "delivery" }[];
};
export const RETURN_REQUEST_KEYS = [
  "id", "requestNumber", "type", "orderId", "orderNumber", "item", "reason", "comments", "status",
  "statusLabel", "tone", "step", "terminal", "createdAt", "updatedAt", "pickup", "refund", "timeline",
] as const;

export function buildReturnRequestView(r: Row, orderNumbers: OrderNumbers): ReturnRequestView {
  const d = r.data;
  const type: ItemRequestType = d.type === "replace" ? "replace" : "return";
  const status = str(d.status, 60) || "REQUESTED";
  const stages = stagesFor(type);
  const idx = stages.indexOf(status);
  const terminal = isTerminal(status);
  const item = (d.item || {}) as Doc;
  const pickup = (d.pickup || {}) as Doc;
  const refund = (d.refund || {}) as Doc;
  const orderId = str(d.orderId, 200);
  const response = pickup.customerResponse;
  const counters = Math.max(0, Math.floor(num(pickup.counterCount)));
  const refundAmount = money(refund.amount);
  const history = Array.isArray(d.history) ? (d.history as Doc[]) : [];

  return {
    // The request's own id — the customer's pickup response route takes it.
    // It is {orderId}_{itemKey}: the customer's own order, nothing of anyone else's.
    id: r.id,
    requestNumber: strOrNull(d.requestNumber, 60),
    type,
    orderId,
    orderNumber: orderNumbers.get(orderId) ?? null,
    item: {
      name: str(item.name, 200) || "Product",
      image: str(item.image, 1000),
      qty: Math.max(1, Math.floor(num(item.qty)) || 1),
      unitPrice: money(item.unitPrice),
      size: str(item.size, 60),
      color: str(item.color, 60),
    },
    reason: str(d.reason, 300),
    comments: str(d.comments, 1000),
    status,
    statusLabel: statusLabel(type, status),
    tone: statusTone(status),
    step: !terminal && idx >= 0 ? { index: idx, total: stages.length } : null,
    terminal,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    pickup:
      type === "return"
        ? {
            proposedAt: iso(pickup.proposedAt),
            counterAt: iso(pickup.counterAt),
            scheduledAt: iso(pickup.scheduledAt),
            customerResponse:
              response === "pending" || response === "accepted" || response === "countered" ? response : null,
            // YOMICO proposes the slot; the customer may confirm it or ask for
            // another time — only while a proposal is awaiting them.
            canRespond: status === "PICKUP_PROPOSED",
            countersLeft: Math.max(0, MAX_PICKUP_COUNTERS - counters),
            partner: strOrNull(pickup.partner, 120),
            pickedUpAt: iso(pickup.pickedUpAt),
            receivedAt: iso(pickup.receivedAt),
          }
        : null,
    refund:
      type === "return"
        ? {
            amount: refundAmount,
            destination: "REWARD_POINTS",
            destinationLabel: REFUND_DESTINATION_LABEL,
            status:
              status === "REFUNDED" ? "credited" : status === "REJECTED" || status === "CANCELLED" ? "not-refunded" : "pending",
            refundNumber: strOrNull(refund.refundNumber, 60),
            creditedAt: iso(refund.creditedAt),
          }
        : null,
    timeline: history.map((h) => {
      const s = str(h?.status, 60);
      return { status: s, label: statusLabel(type, s), at: iso(h?.at), by: BY_LABEL[str(h?.by)] ?? "YOMICO" };
    }),
  };
}

export type LegacyReturnView = {
  id: string;
  orderNumber: string | null;
  status: string;
  reason: string;
  refundAmount: number;
  refundMethod: string;
  createdAt: string | null;
};
export const LEGACY_RETURN_KEYS = ["id", "orderNumber", "status", "reason", "refundAmount", "refundMethod", "createdAt"] as const;

export function buildLegacyReturnView(r: Row, orderNumbers: OrderNumbers): LegacyReturnView {
  const orderId = str(r.data.orderId, 200);
  return {
    // Legacy return ids are {uid}_{orderId} — never exposed.
    id: opaqueId(r.id),
    orderNumber: orderNumbers.get(orderId) ?? null,
    status: str(r.data.status, 40) || "Pending",
    reason: str(r.data.reason, 300),
    refundAmount: money(r.data.refundAmount),
    refundMethod: REFUND_DESTINATION_LABEL,
    createdAt: iso(r.data.createdAt),
  };
}

export type RefundView = {
  source: "item-return" | "order-cancellation" | "legacy-return";
  reference: string;
  orderNumber: string | null;
  amount: number;
  destination: "REWARD_POINTS" | "ORIGINAL_PAYMENT";
  destinationLabel: string;
  status: "due" | "processing" | "completed" | "not-refunded";
  statusLabel: string;
  requestedAt: string | null;
  completedAt: string | null;
  providerReference: string | null;
};
export const REFUND_VIEW_KEYS = [
  "source", "reference", "orderNumber", "amount", "destination", "destinationLabel", "status",
  "statusLabel", "requestedAt", "completedAt", "providerReference",
] as const;

const REFUND_STATUS_LABEL: Record<RefundView["status"], string> = {
  due: "Refund due",
  processing: "Refund in progress",
  completed: "Refunded",
  "not-refunded": "Not refunded",
};

/**
 * Every refund the customer has, from its three stored sources, as one list:
 *   - item-level returns (itemRequests; credited as reward points);
 *   - cancelled ONLINE orders (orders.refundStatus Required/Processing/Refunded;
 *     returned to the original payment method by YOMICO);
 *   - legacy whole-order returns (returns; credited as reward points by
 *     lib/returns on "Refunded").
 */
export function buildRefundViews(itemRequests: Row[], orders: Row[], legacyReturns: Row[], orderNumbers: OrderNumbers): RefundView[] {
  const out: RefundView[] = [];

  for (const r of itemRequests) {
    if (r.data.type !== "return") continue;
    const refund = (r.data.refund || {}) as Doc;
    const amount = money(refund.amount);
    if (amount <= 0) continue;
    const s = str(r.data.status);
    const status: RefundView["status"] =
      s === "REFUNDED" ? "completed" : s === "REJECTED" || s === "CANCELLED" ? "not-refunded" : s === "REFUND_PENDING" ? "due" : "processing";
    const orderId = str(r.data.orderId, 200);
    out.push({
      source: "item-return",
      reference: strOrNull(refund.refundNumber, 60) || strOrNull(r.data.requestNumber, 60) || "Return",
      orderNumber: orderNumbers.get(orderId) ?? null,
      amount,
      destination: "REWARD_POINTS",
      destinationLabel: REFUND_DESTINATION_LABEL,
      status,
      statusLabel: REFUND_STATUS_LABEL[status],
      requestedAt: iso(r.data.createdAt),
      completedAt: status === "completed" ? iso(refund.creditedAt) : null,
      providerReference: null,
    });
  }

  for (const o of orders) {
    const rs = str(o.data.refundStatus);
    if (rs !== "Required" && rs !== "Processing" && rs !== "Refunded") continue;
    const status: RefundView["status"] = rs === "Refunded" ? "completed" : rs === "Processing" ? "processing" : "due";
    out.push({
      source: "order-cancellation",
      reference: strOrNull(o.data.orderNumber, 60) || "Cancelled order",
      orderNumber: strOrNull(o.data.orderNumber, 60),
      amount: money(rs === "Refunded" && o.data.refundedAmount !== undefined ? o.data.refundedAmount : o.data.refundAmountDue),
      destination: "ORIGINAL_PAYMENT",
      destinationLabel: "Original payment method",
      status,
      statusLabel: REFUND_STATUS_LABEL[status],
      requestedAt: iso(o.data.refundRequestedAt),
      completedAt: status === "completed" ? iso(o.data.refundedAt) : null,
      providerReference: status === "completed" ? lastSix(o.data.refundTransactionId) : null,
    });
  }

  for (const r of legacyReturns) {
    const s = str(r.data.status);
    const status: RefundView["status"] =
      s === "Refunded" ? "completed" : s === "Rejected" ? "not-refunded" : "processing";
    const orderId = str(r.data.orderId, 200);
    out.push({
      source: "legacy-return",
      reference: orderNumbers.get(orderId) || "Return",
      orderNumber: orderNumbers.get(orderId) ?? null,
      amount: money(r.data.refundAmount),
      destination: "REWARD_POINTS",
      destinationLabel: REFUND_DESTINATION_LABEL,
      status,
      statusLabel: REFUND_STATUS_LABEL[status],
      requestedAt: iso(r.data.createdAt),
      completedAt: null,
      providerReference: status === "completed" ? lastSix(r.data.refundTransactionId) : null,
    });
  }

  return out.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
}

// ---------------------------------------------------------------------------
// Reward wallet
// ---------------------------------------------------------------------------

export type PendingOrderPoints = {
  orderNumber: string | null;
  points: number;
  creditsAfter: string | null;
  heldBy: "not-delivered" | "awaiting-payment" | "return-window" | "open-return" | "processing";
};

/**
 * Points each order will earn but has not yet credited, and why it is held —
 * straight from lib/rewardCredit.evaluateRewardCredit, the rule the credit job
 * itself applies (legacy returns and item-level returns included). An order
 * that will earn nothing (cancelled, refunded, already credited, legacy) is
 * not pending.
 */
export function pendingPoints(
  orders: Row[],
  itemRequests: Row[],
  legacyReturns: Row[],
  now: Date = new Date()
): { points: number; orders: PendingOrderPoints[] } {
  const list: PendingOrderPoints[] = [];
  for (const o of orders) {
    const order = o.data as RewardCreditOrder & Doc;
    if (order.rewardPointsStatus !== "pending" || order.status === "Cancelled") continue;
    const requests = itemRequests.filter((r) => r.data.orderId === o.id).map((r) => r.data);
    const itemReturns = summariseItemReturns(requests as never);
    const legacy = legacyReturns.find((r) => r.data.orderId === o.id);
    const verdict = evaluateRewardCredit(order, legacy ? { status: legacy.data.status } : null, now, itemReturns);

    let heldBy: PendingOrderPoints["heldBy"];
    let points: number;
    if (verdict.eligible) {
      heldBy = "processing";
      points = verdict.points;
    } else {
      const map: Partial<Record<string, PendingOrderPoints["heldBy"]>> = {
        "not-delivered": "not-delivered",
        "payment-not-completed": "awaiting-payment",
        "return-unresolved": "open-return",
        "return-window-open": "return-window",
        "return-window-unknown": "return-window",
      };
      const held = map[verdict.reason];
      if (!held) continue; // legacy-order / already-credited / return-refunded / no-points
      heldBy = held;
      const total = num(order.finalTotal);
      points = earnedPointsFor(Math.max(0, total - itemReturns.refundedAmount));
    }
    if (points <= 0) continue;
    const endsAt = order.status === "Delivered" ? returnWindowEndsAt(order) : null;
    list.push({
      orderNumber: strOrNull(order.orderNumber, 60),
      points,
      creditsAfter: endsAt ? endsAt.toISOString() : null,
      heldBy,
    });
  }
  return { points: list.reduce((s, p) => s + p.points, 0), orders: list };
}

export type LedgerKind =
  | "earned" | "redeemed" | "refund" | "referral" | "cancellation-restored" | "cancellation-reversed" | "other";

const LEDGER_TYPES: Record<string, { kind: LedgerKind; sign: 1 | -1; label: string }> = {
  Earned: { kind: "earned", sign: 1, label: "Points earned on an order" },
  Redeemed: { kind: "redeemed", sign: -1, label: "Points used at checkout" },
  Refund: { kind: "refund", sign: 1, label: "Refund credited as points" },
  "Referral Bonus": { kind: "referral", sign: 1, label: "Referral bonus" },
  "Cancelled - Points Restored": { kind: "cancellation-restored", sign: 1, label: "Points returned (order cancelled)" },
  "Cancelled - Points Reversed": { kind: "cancellation-reversed", sign: -1, label: "Earned points reversed (order cancelled)" },
};

// v2 rows (lib/points: v === 2) carry a signed `delta` — what actually moved
// the balance — and a `kind`, mapped onto the SAME view kinds and labels.
const V2_KINDS: Record<string, { kind: LedgerKind; label: string }> = {
  purchase_earned: { kind: "earned", label: LEDGER_TYPES.Earned.label },
  checkout_redeem: { kind: "redeemed", label: LEDGER_TYPES.Redeemed.label },
  refund_item: { kind: "refund", label: LEDGER_TYPES.Refund.label },
  refund_return: { kind: "refund", label: LEDGER_TYPES.Refund.label },
  referral_welcome: { kind: "referral", label: LEDGER_TYPES["Referral Bonus"].label },
  referral_referrer: { kind: "referral", label: LEDGER_TYPES["Referral Bonus"].label },
  cancel_restore: { kind: "cancellation-restored", label: LEDGER_TYPES["Cancelled - Points Restored"].label },
  cancel_reverse: { kind: "cancellation-reversed", label: LEDGER_TYPES["Cancelled - Points Reversed"].label },
  adjustment: { kind: "other", label: "Adjustment" },
  opening_balance: { kind: "other", label: "Opening balance" },
};

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  label: string;
  points: number;
  orderNumber: string | null;
  createdAt: string | null;
};
export const LEDGER_ENTRY_KEYS = ["id", "kind", "label", "points", "orderNumber", "createdAt"] as const;

export function buildLedger(rows: Row[], orderNumbers: OrderNumbers): LedgerEntry[] {
  return [...rows]
    .sort((a, b) => ms(b.data.createdAt) - ms(a.data.createdAt))
    .map((r) => {
      const orderId = str(r.data.orderId, 200);
      const v2 = r.data.v === 2 && typeof r.data.kind === "string" ? V2_KINDS[r.data.kind] : undefined;
      if (v2) {
        return {
          id: opaqueId(r.id),
          kind: v2.kind,
          label: v2.label,
          points: Math.round(num(r.data.delta)),
          orderNumber: orderId ? orderNumbers.get(orderId) ?? null : null,
          createdAt: iso(r.data.createdAt),
        };
      }
      // Legacy rows: sign from the type label, as before.
      const type = str(r.data.type, 60);
      const t = LEDGER_TYPES[type];
      const points = Math.abs(Math.round(num(r.data.points)));
      return {
        // Ledger ids can embed another customer's uid (referrer_{friendUid}).
        id: opaqueId(r.id),
        kind: t ? t.kind : "other",
        label: t ? t.label : type || "Adjustment",
        points: t ? t.sign * points : points,
        orderNumber: orderId ? orderNumbers.get(orderId) ?? null : null,
        createdAt: iso(r.data.createdAt),
      };
    });
}

export const WALLET_RULES = {
  pointValueRupees: 1 as const,
  earn: "Earn 1 point for every ₹100 you pay. Points are credited once the order is delivered, paid and its 7-day return window has closed. Items you return and get refunded don't earn points.",
  redeem: "1 point = ₹1. Use points at checkout for up to your order subtotal after coupons (not shipping).",
};

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export type ReferralHistoryEntry = {
  id: string;
  friend: string;
  status: "paid" | "pending";
  points: number;
  date: string | null;
};
export const REFERRAL_HISTORY_KEYS = ["id", "friend", "status", "points", "date"] as const;

export type AccountReferrals = {
  code: string | null;
  bonuses: { referrer: number; welcome: number };
  totals: { paidReferrals: number; pointsEarned: number };
  history: ReferralHistoryEntry[];
  yourSignup: { referred: boolean; status: "paid" | "pending" | "not-paid" | "none" };
};
export const ACCOUNT_REFERRALS_KEYS = ["code", "bonuses", "totals", "history", "yourSignup"] as const;

/**
 * The customer's referral page. Friends are ANONYMOUS — "A friend", their
 * join date and whether the bonus has been paid; never a name, email or uid
 * (the entry id is opaque). "pending" covers every unpaid referral (awaiting
 * email verification, blocked, or held for review). Direct referrals are
 * unlimited — there is no monthly cap.
 */
export function buildReferrals(params: {
  uid: string;
  user: Doc;
  ownLedger: Row[];
  friends: Row[];
  now?: number;
}): AccountReferrals {
  const { uid, user, ownLedger, friends } = params;
  const code = isWellFormedReferralCode(user.referralCode) ? (user.referralCode as string) : null;
  const ledgerIds = new Set(ownLedger.map((r) => r.id));

  const history: ReferralHistoryEntry[] = friends
    .filter((f) => f.id !== uid)
    .map((f) => {
      const paid = ledgerIds.has(referrerLedgerId(f.id)) || Boolean(f.data.signupRewardsGrantedAt);
      return {
        id: opaqueId(`friend:${f.id}`),
        friend: "A friend",
        status: paid ? "paid" : "pending",
        points: paid ? REFERRER_BONUS : 0,
        date: iso(f.data.createdAt),
      } as ReferralHistoryEntry;
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const paidReferrals = Math.max(0, Math.floor(num(user.totalReferrals)));

  const referredBy = typeof user.referredBy === "string" ? user.referredBy.trim() : "";
  const welcomePaid =
    ledgerIds.has(welcomeLedgerId(uid)) ||
    ownLedger.some(
      (r) => r.data.type === "Referral Bonus" && !r.id.startsWith("referrer_") && Boolean(r.data.userEmail)
    );
  const yourSignup: AccountReferrals["yourSignup"] = !referredBy
    ? { referred: false, status: "none" }
    : welcomePaid
    ? { referred: true, status: "paid" }
    : user.signupRewardsGrantedAt
    ? { referred: true, status: "not-paid" }
    : { referred: true, status: "pending" };

  return {
    code,
    bonuses: { referrer: REFERRER_BONUS, welcome: WELCOME_BONUS },
    totals: { paidReferrals, pointsEarned: paidReferrals * REFERRER_BONUS },
    history,
    yourSignup,
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type AccountSummary = {
  profile: {
    displayName: string;
    email: string;
    emailVerified: boolean;
    phone: string | null;
    address: string | null;
    memberSince: string | null;
  };
  actions: { pickupSlotsToConfirm: number; verifyEmail: boolean; refundsDue: number };
  orders: { total: number; active: number; delivered: number; cancelled: number; recent: AccountOrderCard[] };
  returns: { open: number };
  rewards: { balance: number; pendingPoints: number };
  referrals: { code: string | null; paidReferrals: number };
  notifications: { unread: number };
  addresses: { saved: number };
};
export const ACCOUNT_SUMMARY_KEYS = [
  "profile", "actions", "orders", "returns", "rewards", "referrals", "notifications", "addresses",
] as const;

export function rewardBalanceOf(user: Doc): number {
  const n = num(user.rewardPoints);
  return n > 0 ? Math.floor(n) : 0;
}
