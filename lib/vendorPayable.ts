import { computeVendorShare, orderItemsSubtotalBasis } from "@/lib/vendorEarnings";
import { sellerForwardDeliveryForOrder } from "@/lib/deliveryRules";

// ---------------------------------------------------------------------------
// The SINGLE authoritative "how much may this vendor be paid right now" calc.
//
// Used by the seller withdrawal request route, the admin Mark-Paid settlement
// route, the admin payouts screen and the seller wallet display, so there is
// one formula rather than several hand-kept copies that drift.
//
//   payable = adjustedEarnings - commitments
//
//   adjustedEarnings = Σ over the vendor's Delivered + Paid + !needsReview
//                      orders of (vendorEarning - returnDeduction)
//                      - sellerDeliveryDeduction
//   commitments      = admin direct settlements (vendor_payouts)
//                      + every Paid/Pending/Approved withdrawal
//
// SELLER DELIVERY COST reduces payable alongside returns (see lib/deliveryRules
// for the A–E concept split). Two distinct legs, never double-counted:
//   - FORWARD: on an order that shipped FREE (order.freeDeliveryApplied), the
//     seller bears order.deliveryCost, allocated by the value of that seller's
//     products in the order (rule 8). Below the free-delivery threshold the
//     CUSTOMER paid delivery, so the seller bears nothing. Read from the per-
//     order snapshot, so a later ₹499/₹49 change never rewrites history; orders
//     placed before the feature carry no snapshot and deduct 0 (no migration).
//   - RETURN / REPLACEMENT: the seller bears the return/replacement logistics
//     cost recorded on the itemRequest (itemRequest.deliveryCost). This is the
//     accounting seam only — until a real courier cost is recorded the field is
//     absent and deducts 0 (no invented rate). Rejected/cancelled requests are
//     excluded (no shipment happened). A forward leg and a return leg are
//     different shipments, so summing both is correct, not double-counting.
//
// RETURNS reduce a seller's earning for the merchandise that came back, even
// when the customer was refunded in reward points rather than cash — a seller
// must not keep earnings for goods that were returned. Deductions are per item
// wherever the data allows it:
//
//   - itemRequests (the per-item Return/Replace system): each active (non
//     rejected/cancelled) RETURN removes exactly that item's proportional share
//     of the vendor's earning for its order. Replacements are NOT deducted — the
//     seller reships goods, they are not refunded.
//   - legacy order-level `returns`: a FULL refund (refundAmount >= the order
//     grand total) removes the whole vendor earning for that order. A PARTIAL
//     legacy refund is only attributable on a SINGLE-vendor order (the refund is
//     unambiguously that vendor's) — there it is deducted proportionally. On a
//     MULTI-vendor order a partial legacy refund carries no item/vendor
//     breakdown, so it is left un-deducted rather than clawing back from a
//     vendor whose goods were never returned (see the audit note / residual
//     risk). Migrating remaining legacy returns to itemRequests, or adding an
//     item breakdown to legacy returns, would close that gap.
//
// DOUBLE-COUNTING is prevented per order: if an order has any item-level return
// (itemRequests), ONLY the item-level deductions apply for that order and the
// legacy return doc is ignored — the same return is never counted from both
// sources — and every order's total deduction is capped at its own
// vendorEarning.
//
// POST-PAYOUT RECOVERY: the result may be NEGATIVE. That negative is the
// recoverable adjustment — a return that landed after the seller was already
// paid. It is never turned into an immediate clawback; it simply means nothing
// is withdrawable until future eligible earnings first cover it. Callers show
// max(0, payable) as the withdrawable figure and gate requests on it.
//
// Firestore rules cannot express any of this (it sums across four collections),
// which is why the amount is settled by a server route, not by a rule.
// ---------------------------------------------------------------------------

export type PayableOrder = {
  id?: string;
  status?: unknown;
  paymentStatus?: unknown;
  needsReview?: unknown;
  items?: unknown;
  total?: unknown;
  finalTotal?: unknown;
  // Delivery-cost snapshot written at order creation (absent on pre-feature
  // orders -> 0 seller delivery deduction).
  deliveryCost?: unknown;
  freeDeliveryApplied?: unknown;
  [key: string]: unknown;
};

export type PayableWithdrawal = {
  id?: string;
  vendorId?: unknown;
  amount?: unknown;
  status?: unknown;
};

export type PayablePayout = {
  vendorId?: unknown;
  amount?: unknown;
};

// One per-item Return/Replace request (the itemRequests collection).
export type PayableItemRequest = {
  orderId?: unknown;
  vendorId?: unknown;
  type?: unknown; // "return" | "replace"
  status?: unknown;
  item?: { unitPrice?: unknown; qty?: unknown };
  // Seller-borne return/replacement logistics cost, recorded when a real
  // courier cost becomes known. Absent today -> deducts 0 (no invented rate).
  deliveryCost?: unknown;
};

// One legacy order-level return (the returns collection).
export type PayableLegacyReturn = {
  orderId?: unknown;
  status?: unknown; // "Refunded" etc.
  refundAmount?: unknown;
};

/** Withdrawal states that have already reserved or spent money. */
const COMMITTED_STATUSES = ["Paid", "Pending", "Approved"];

/** Return states that DON'T reduce earnings — the goods stayed with the buyer. */
const INACTIVE_RETURN_STATUSES = new Set(["REJECTED", "CANCELLED"]);

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function orderGrandTotal(order: PayableOrder): number {
  const ft = toNum(order?.finalTotal);
  return ft > 0 ? ft : toNum(order?.total);
}

/**
 * The vendor-earning deduction for ONE order, given the returns that concern
 * it. Item-level returns take precedence over the legacy order-level return so
 * the same return is never counted twice; the result is capped at the order's
 * own vendorEarning.
 */
function returnDeductionForOrder(params: {
  order: PayableOrder;
  vendorUid: string;
  vendorEarning: number;
  vendorRawSubtotal: number;
  itemReqs: PayableItemRequest[];
  legacyReturn: PayableLegacyReturn | null;
}): number {
  const { order, vendorUid, vendorEarning, vendorRawSubtotal, itemReqs, legacyReturn } =
    params;
  if (vendorEarning <= 0) return 0;

  // --- Item-level returns win for this order (dedup vs legacy). ---
  if (itemReqs.length > 0) {
    let deduction = 0;
    for (const ir of itemReqs) {
      const line = toNum(ir?.item?.unitPrice) * toNum(ir?.item?.qty);
      deduction +=
        vendorRawSubtotal > 0 ? vendorEarning * (line / vendorRawSubtotal) : 0;
    }
    return Math.min(vendorEarning, Math.round(deduction));
  }

  // --- Legacy order-level return (only when no item-level return exists). ---
  if (legacyReturn && String(legacyReturn.status) === "Refunded") {
    const refundAmount = toNum(legacyReturn.refundAmount);
    const grand = orderGrandTotal(order);
    if (refundAmount > 0 && grand > 0) {
      if (refundAmount >= grand) {
        // Whole order refunded -> the vendor keeps nothing for it.
        return vendorEarning;
      }
      // Partial refund. Attributable only when this vendor is the ONLY vendor
      // on the order; otherwise the legacy doc can't tell us whose item came
      // back, so we do not deduct (documented residual risk).
      const items = Array.isArray(order?.items)
        ? (order.items as { vendorId?: unknown }[])
        : [];
      const singleVendor =
        items.length > 0 && items.every((it) => it?.vendorId === vendorUid);
      if (singleVendor) {
        return Math.min(
          vendorEarning,
          Math.round(vendorEarning * (refundAmount / grand))
        );
      }
      return 0;
    }
  }

  return 0;
}

/** A seller's per-order record (sellerOrders/{orderId}_{vendorId}), as far as payouts need it. */
export type PayableSellerOrder = {
  orderId?: unknown;
  vendorId?: unknown;
  // Written by the server at confirmation (lib/sellerOrderRecord.ts): this
  // seller's share of the ONE order-level delivery cost. Absent on records
  // confirmed before the snapshot existed -> recalculated from the order,
  // exactly as before (legacy fallback).
  sellerDeliveryCharge?: unknown;
};

/**
 * Every figure behind a seller's payable, from the ONE calculation below — the
 * seller API (wallet, payout report, dashboard, analytics), the withdrawal
 * request, admin settlement and the admin payouts screen all read these.
 */
export type VendorEarningsBreakdown = {
  /** Delivered + Paid + !needsReview orders carrying this seller's items. */
  eligibleOrders: number;
  /** Σ this seller's line price × qty on eligible orders. */
  grossSales: number;
  /** This seller's proportional share of coupon/reward discounts (existing rule). */
  discountShare: number;
  /** Always 0 — YOMICO charges no commission (lib/commissionPolicy.ts). */
  commission: number;
  /** Forward delivery: this seller's share of each free-delivery order's ONE delivery cost. */
  sellerDeliveryCharges: number;
  /** Merchandise earning removed for returned items (existing rule). */
  returnDeductions: number;
  /** Return/replacement logistics recorded on item requests (existing rule; 0 today). */
  returnLogisticsCharges: number;
  /** grossSales − discountShare − commission − returnDeductions − delivery − logistics. May be negative. */
  adjustedEarnings: number;
};

export type VendorPayableBreakdown = VendorEarningsBreakdown & {
  /** Admin direct settlements + Paid withdrawals. */
  paidOut: number;
  /** Pending + Approved withdrawals (reserved, not yet paid). */
  reserved: number;
  committed: number;
  /** adjustedEarnings − committed. May be NEGATIVE (recoverable adjustment). */
  payable: number;
  /** max(0, payable) — what may be withdrawn now. */
  available: number;
};

/** This seller's stored delivery-charge snapshots, keyed by orderId. */
function deliverySnapshots(
  vendorUid: string,
  sellerOrders: PayableSellerOrder[]
): Map<string, number> {
  const byOrder = new Map<string, number>();
  for (const so of sellerOrders || []) {
    if (so?.vendorId !== vendorUid) continue;
    const oid = String(so?.orderId || "");
    const charge = so?.sellerDeliveryCharge;
    if (!oid || typeof charge !== "number" || !Number.isFinite(charge) || charge < 0) continue;
    byOrder.set(oid, charge);
  }
  return byOrder;
}

/**
 * The vendor's refund-adjusted earnings, itemised — the earnings half of
 * `payable`, before commitments.
 */
export function computeVendorEarningsBreakdown(params: {
  vendorUid: string;
  orders: PayableOrder[];
  itemRequests?: PayableItemRequest[];
  legacyReturns?: PayableLegacyReturn[];
  sellerOrders?: PayableSellerOrder[];
}): VendorEarningsBreakdown {
  const { vendorUid, orders, itemRequests = [], legacyReturns = [], sellerOrders = [] } = params;
  const empty: VendorEarningsBreakdown = {
    eligibleOrders: 0,
    grossSales: 0,
    discountShare: 0,
    commission: 0,
    sellerDeliveryCharges: 0,
    returnDeductions: 0,
    returnLogisticsCharges: 0,
    adjustedEarnings: 0,
  };
  if (!vendorUid) return empty;

  // Index active RETURN item-requests for this vendor by orderId.
  const irByOrder = new Map<string, PayableItemRequest[]>();
  for (const ir of itemRequests) {
    if (ir?.vendorId !== vendorUid) continue;
    if (String(ir?.type) !== "return") continue;
    if (INACTIVE_RETURN_STATUSES.has(String(ir?.status))) continue;
    const oid = String(ir?.orderId || "");
    if (!oid) continue;
    const list = irByOrder.get(oid) || [];
    list.push(ir);
    irByOrder.set(oid, list);
  }

  // Index legacy Refunded returns by orderId (deterministic id => one per order).
  const legacyByOrder = new Map<string, PayableLegacyReturn>();
  for (const lr of legacyReturns) {
    if (String(lr?.status) !== "Refunded") continue;
    const oid = String(lr?.orderId || "");
    if (oid) legacyByOrder.set(oid, lr);
  }

  const snapshots = deliverySnapshots(vendorUid, sellerOrders);
  const b = { ...empty };
  let merchandise = 0;

  for (const order of orders || []) {
    if (
      order?.status !== "Delivered" ||
      order?.paymentStatus !== "Paid" ||
      order?.needsReview === true
    ) {
      continue;
    }

    const share = computeVendorShare(order as never, vendorUid);
    if (!share) continue;

    b.eligibleOrders += 1;
    b.grossSales += share.vendorRawSubtotal;
    b.discountShare += share.vendorRawSubtotal - share.vendorNetSubtotal;
    b.commission += share.vendorCommission;

    const oid = String(order?.id || "");

    // FORWARD delivery — the stored server snapshot (this seller's share of the
    // ONE order-level cost) when the record has one; otherwise the previous
    // recalculation from the order's own delivery snapshot (legacy records).
    // Charged whenever the seller is on an eligible order (the goods shipped),
    // independent of the per-order merchandise earning below.
    const snapshot = oid ? snapshots.get(oid) : undefined;
    b.sellerDeliveryCharges +=
      snapshot !== undefined
        ? snapshot
        : sellerForwardDeliveryForOrder(
            order,
            share.vendorRawSubtotal,
            // The order's merchandise subtotal — `total` on web and historical
            // orders (unchanged), the explicit itemsSubtotal on new mobile orders
            // whose `total` is the grand total.
            orderItemsSubtotalBasis(order)
          );

    const vendorEarning = share.vendorEarning;
    if (vendorEarning <= 0) continue;

    const deduction = returnDeductionForOrder({
      order,
      vendorUid,
      vendorEarning,
      vendorRawSubtotal: share.vendorRawSubtotal,
      itemReqs: irByOrder.get(oid) || [],
      legacyReturn: legacyByOrder.get(oid) || null,
    });

    const kept = Math.max(0, vendorEarning - deduction);
    merchandise += kept;
    b.returnDeductions += vendorEarning - kept;
  }

  // RETURN / REPLACEMENT logistics recorded on item requests (both types). An
  // active (non rejected/cancelled) request whose deliveryCost has been set
  // adds that seller cost; absent cost -> 0. This is a different shipment leg
  // from the forward cost above, so the two never double-count.
  for (const ir of itemRequests) {
    if (ir?.vendorId !== vendorUid) continue;
    if (INACTIVE_RETURN_STATUSES.has(String(ir?.status))) continue;
    b.returnLogisticsCharges += toNum(ir?.deliveryCost);
  }

  // May go slightly negative when delivery costs outrun net merchandise
  // earnings; computeVendorPayable already documents and handles a negative
  // (recoverable-adjustment) result, and display callers clamp with max(0, …).
  b.adjustedEarnings = merchandise - b.sellerDeliveryCharges - b.returnLogisticsCharges;
  return b;
}

/**
 * The vendor's refund-adjusted earnings — the earnings half of `payable`,
 * before commitments. Exported so display screens can show a consistent
 * "earned" figure without re-deriving the deduction logic.
 */
export function computeVendorAdjustedEarnings(params: {
  vendorUid: string;
  orders: PayableOrder[];
  itemRequests?: PayableItemRequest[];
  legacyReturns?: PayableLegacyReturn[];
  sellerOrders?: PayableSellerOrder[];
}): number {
  return computeVendorEarningsBreakdown(params).adjustedEarnings;
}

/**
 * earnings − commitments for one vendor, itemised. `payable` may be NEGATIVE
 * — the negative part is the recoverable post-payout adjustment (see file
 * header).
 *
 * `excludeWithdrawalId` omits the request being settled or re-priced, so it is
 * not subtracted from the balance it is being checked against.
 */
export function computeVendorPayableBreakdown(params: {
  vendorUid: string;
  orders: PayableOrder[];
  payouts: PayablePayout[];
  withdrawals: PayableWithdrawal[];
  itemRequests?: PayableItemRequest[];
  legacyReturns?: PayableLegacyReturn[];
  sellerOrders?: PayableSellerOrder[];
  excludeWithdrawalId?: string | null;
}): VendorPayableBreakdown {
  const { vendorUid, payouts, withdrawals, excludeWithdrawalId } = params;
  const earnings = computeVendorEarningsBreakdown(params);
  let paidOut = 0;
  let reserved = 0;

  if (vendorUid) {
    // Direct admin settlements.
    for (const payout of payouts || []) {
      if (payout?.vendorId === vendorUid) {
        paidOut += toNum(payout?.amount);
      }
    }

    // Every other withdrawal already settled or reserved.
    for (const withdrawal of withdrawals || []) {
      if (excludeWithdrawalId && withdrawal?.id === excludeWithdrawalId) continue;
      if (!COMMITTED_STATUSES.includes(String(withdrawal?.status))) continue;
      if (withdrawal?.vendorId !== vendorUid) continue;
      if (String(withdrawal?.status) === "Paid") paidOut += toNum(withdrawal?.amount);
      else reserved += toNum(withdrawal?.amount);
    }
  }

  const committed = paidOut + reserved;
  const payable = earnings.adjustedEarnings - committed;
  return { ...earnings, paidOut, reserved, committed, payable, available: Math.max(0, payable) };
}

/**
 * earnings − commitments, for one vendor. May be NEGATIVE — the negative part
 * is the recoverable post-payout adjustment (see file header).
 */
export function computeVendorPayable(params: {
  vendorUid: string;
  orders: PayableOrder[];
  payouts: PayablePayout[];
  withdrawals: PayableWithdrawal[];
  itemRequests?: PayableItemRequest[];
  legacyReturns?: PayableLegacyReturn[];
  sellerOrders?: PayableSellerOrder[];
  excludeWithdrawalId?: string | null;
}): number {
  return computeVendorPayableBreakdown(params).payable;
}

/** Whether a requested amount fits in what is left, with the reason if not. */
export function evaluateWithdrawalRequest(params: {
  amount: unknown;
  payable: number;
}):
  | { ok: true; amount: number }
  | { ok: false; reason: "invalid-amount" | "exceeds-payable"; payable: number } {
  // Strictly a number, not something that coerces to one. The Firestore rule
  // this replaces required `amount is number`, and silently accepting "500"
  // would quietly widen what the API takes compared with what it guaranteed
  // before.
  if (typeof params.amount !== "number") {
    return { ok: false, reason: "invalid-amount", payable: params.payable };
  }

  const amount = params.amount;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "invalid-amount", payable: params.payable };
  }

  // Whole rupees only — a fractional request cannot be paid out cleanly and is
  // a common way to probe rounding behaviour.
  if (Math.floor(amount) !== amount) {
    return { ok: false, reason: "invalid-amount", payable: params.payable };
  }

  if (amount > params.payable) {
    return { ok: false, reason: "exceeds-payable", payable: params.payable };
  }

  return { ok: true, amount };
}


/**
 * computeVendorEarningsBreakdown for every seller that appears on `orders`
 * (by vendorIds or line items) — a convenience loop over the ONE shared
 * calculation above, not a second formula. For marketplace-wide admin views.
 */
export function computeEarningsBreakdownByVendor(params: {
  orders: PayableOrder[];
  itemRequests?: PayableItemRequest[];
  legacyReturns?: PayableLegacyReturn[];
  sellerOrders?: PayableSellerOrder[];
}): Record<string, VendorEarningsBreakdown> {
  const vendorIds = new Set<string>();
  for (const order of params.orders || []) {
    const declared = Array.isArray(order?.vendorIds) ? (order.vendorIds as unknown[]) : [];
    const items = Array.isArray(order?.items) ? (order.items as { vendorId?: unknown }[]) : [];
    for (const v of [...declared, ...items.map((i) => i?.vendorId)]) {
      if (typeof v === "string" && v) vendorIds.add(v);
    }
  }
  const out: Record<string, VendorEarningsBreakdown> = {};
  for (const vendorUid of [...vendorIds].sort()) {
    out[vendorUid] = computeVendorEarningsBreakdown({ ...params, vendorUid });
  }
  return out;
}
