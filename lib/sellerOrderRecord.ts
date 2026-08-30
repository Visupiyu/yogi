import { computeVendorShare } from "@/lib/vendorEarnings";
import {
  deriveFulfilmentStage,
  itemKeyFor,
  type ItemFulfilmentMap,
} from "@/lib/itemFulfilment";

// Per-seller fulfilment records — the `sellerOrders` collection.
//
// One record per (order, vendor), created by app/api/confirm-order INSIDE the
// confirmation transaction. A customer placing an order creates nothing here:
// the record only exists once an admin has confirmed, which is what makes
// "seller order management appears on confirmation" true by construction
// rather than by a UI filter.
//
// Each record carries ONLY its own vendor's line items and only that vendor's
// share of the money. Another seller's items, subtotal, commission or earnings
// never enter it, so there is nothing to filter out at read time.
//
// FULFILMENT lives per ITEM, not per record. Each line carries its own
// itemKey and its own entry in itemFulfilment, and every line progresses
// independently — packing one product says nothing about the others. The
// record-level stage is DERIVED from that map on read
// (sellerOrderStage below); it is a summary for dashboards and is never
// stored, so it cannot drift from the item state it describes.
//
// TIMING: these records do NOT introduce a second clock. confirmedAt and
// deliveryDeadlineAt are copied verbatim from the same confirmation instant
// the parent order was stamped with, and every timing question about them is
// answered by lib/orderTiming.ts — the same functions the admin SLA table
// uses. deliveredAt is stamped when this seller completes their part, and
// remains the authoritative input for "did the 72h target hold?".

// The seller chain IS the item chain — one definition, in
// lib/itemFulfilment.ts, so a rule, a UI control and a test can never
// disagree about what "next" means.
export {
  ITEM_FULFILMENT_STAGES as SELLER_ORDER_STATUSES,
  isLegalItemTransition as isLegalSellerTransition,
} from "@/lib/itemFulfilment";

export type SellerOrderStatus =
  (typeof import("@/lib/itemFulfilment").ITEM_FULFILMENT_STAGES)[number];

/**
 * Deterministic id — this is the idempotency guarantee. A retried or repeated
 * confirmation addresses the same document, so it can never produce a second
 * record for the same (order, vendor).
 */
export function sellerOrderRecordId(
  orderId: string,
  vendorId: string
): string {
  return `${orderId}_${vendorId}`;
}

export type SellerOrderItem = {
  /** Assigned at record creation; the key into itemFulfilment. */
  itemKey?: string;
  id?: unknown;
  name?: unknown;
  qty?: unknown;
  price?: unknown;
  image?: unknown;
  size?: unknown;
  color?: unknown;
  vendorId?: unknown;
};

export type SellerOrderRecordSeed = {
  orderId: string;
  /** The parent order's human-readable number, for display; null on legacy. */
  orderNumber: string | null;
  vendorId: string;
  items: SellerOrderItem[];
  /** Keyed by itemKey. Every line starts at Confirmed, independently. */
  itemFulfilment: ItemFulfilmentMap;
  itemCount: number;
  vendorSubtotal: number;
  vendorCommission: number;
  vendorEarning: number;
  customerName: string;
  deliveryDate: string | null;
};

type ParentOrder = {
  vendorIds?: unknown;
  items?: unknown;
  orderNumber?: unknown;
  customerName?: unknown;
  deliveryDate?: unknown;
  total?: number;
  finalTotal?: number;
  discount?: number;
  rewardValue?: number;
  commissionRate?: number;
};

/** Every vendor that actually has a line on this order. */
export function vendorsOnOrder(order: ParentOrder | null | undefined): string[] {
  const declared = Array.isArray(order?.vendorIds)
    ? (order!.vendorIds as unknown[])
    : [];

  const fromItems = Array.isArray(order?.items)
    ? (order!.items as SellerOrderItem[]).map((i) => i?.vendorId)
    : [];

  // vendorIds is the authoritative list the rules key off, but an item whose
  // vendor is somehow missing from it would otherwise get no record and no
  // seller — so the union is taken and de-duplicated.
  return [...new Set([...declared, ...fromItems])].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
}

/**
 * The seed for one vendor's record. Returns null when the vendor has no line
 * items on this order — there is nothing for them to fulfil.
 *
 * Monetary figures come from computeVendorShare(), the same function the
 * seller wallet, payouts and invoice already use, so a record can never
 * disagree with those screens.
 */
export function buildSellerOrderSeed(
  orderId: string,
  order: ParentOrder | null | undefined,
  vendorId: string
): SellerOrderRecordSeed | null {
  const allItems = Array.isArray(order?.items)
    ? (order!.items as SellerOrderItem[])
    : [];

  // Keys are assigned over THIS seller's own lines, so they are stable for
  // the record even though the parent order interleaves several vendors.
  const items = allItems
    .filter((item) => item?.vendorId === vendorId)
    .map((item, index) => ({ ...item, itemKey: itemKeyFor(index, item?.id) }));

  if (items.length === 0) return null;

  const itemFulfilment: ItemFulfilmentMap = {};
  for (const item of items) {
    itemFulfilment[item.itemKey] = { status: "Confirmed" };
  }

  const share = computeVendorShare(
    order as Parameters<typeof computeVendorShare>[0],
    vendorId
  );

  const itemCount = items.reduce((sum, item) => {
    const qty = Number(item?.qty);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);

  return {
    orderId,
    orderNumber:
      typeof order?.orderNumber === "string" ? order.orderNumber : null,
    vendorId,
    items,
    itemFulfilment,
    itemCount,
    vendorSubtotal: share?.vendorRawSubtotal ?? 0,
    vendorCommission: share?.vendorCommission ?? 0,
    vendorEarning: share?.vendorEarning ?? 0,

    // Deliberately minimal customer reference. The seller can already read
    // the parent order for address and phone; duplicating that PII into a
    // second collection would widen its exposure for no benefit.
    customerName:
      typeof order?.customerName === "string" ? order.customerName : "",
    deliveryDate:
      typeof order?.deliveryDate === "string" ? order.deliveryDate : null,
  };
}

/** One seed per vendor on the order, in a stable order. */
export function buildSellerOrderSeeds(
  orderId: string,
  order: ParentOrder | null | undefined
): SellerOrderRecordSeed[] {
  return vendorsOnOrder(order)
    .map((vendorId) => buildSellerOrderSeed(orderId, order, vendorId))
    .filter((seed): seed is SellerOrderRecordSeed => seed !== null)
    .sort((a, b) => a.vendorId.localeCompare(b.vendorId));
}

/**
 * The seller-level summary: the least advanced item in the record.
 *
 * Derived, never stored — see the note at the top of this file.
 */
export function sellerOrderStage(
  record: { itemFulfilment?: unknown } | null | undefined
): string | null {
  return deriveFulfilmentStage(
    (record?.itemFulfilment as ItemFulfilmentMap) || null
  );
}
