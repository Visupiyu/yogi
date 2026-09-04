// The single, dependency-free home for SELLER-borne delivery-cost accounting.
//
// Deliberately imports nothing (no Firebase, client or admin) so it can run in
// the browser, in a server route, and inside lib/vendorPayable.ts alike — the
// same way lib/shippingRules.ts is shared for the customer-facing charge.
//
// Keep these concepts DISTINCT — they must never collapse into one field:
//
//   A. Customer-facing delivery charge   -> order.shippingCharge
//                                           (lib/shippingRules.calculateShippingCharge)
//   B. Actual delivery-company cost       -> order.deliveryCost  (snapshot of the
//                                           config value below, per order)
//   C. Seller delivery responsibility     -> DERIVED here, never stored: a seller
//                                           bears B (allocated by product value)
//                                           only when the order shipped free.
//   D. Delivery-company payable           -> future (courier wallet/settlement)
//   E. YOMICO revenue / commission        -> order.commission / commissionRate
//
// ₹49 is only the INITIAL configurable value. The live figure lives in
// settings/global.deliveryCost; this constant is the fallback used when that
// field is missing or malformed — mirroring how shippingRules treats 499/49.
//
// This file is also the seam for rule 12: when the real delivery-company
// pricing model arrives (per-parcel, weight, zone, bulk, …), it replaces the
// body of these functions WITHOUT any change to seller-earnings math, because
// callers only ask "what delivery cost does this seller bear?" and never how it
// was derived.
export const DEFAULT_DELIVERY_COST = 49;

function toFiniteNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Whether this order's forward delivery cost is borne by the SELLER.
 *
 * Business rule: the seller bears the forward delivery cost only when the order
 * qualified for FREE delivery (subtotal >= threshold). Below the threshold the
 * customer paid the delivery charge, so the seller bears nothing.
 *
 * Reads the per-order snapshot (`freeDeliveryApplied`) rather than re-deriving
 * from the current threshold, so a later admin change to ₹499/₹49 never alters
 * what a historical order charged its sellers. Orders placed before the feature
 * existed carry neither field and correctly yield `false`.
 */
export function sellerBearsForwardDelivery(order: {
  freeDeliveryApplied?: unknown;
  deliveryCost?: unknown;
}): boolean {
  return order?.freeDeliveryApplied === true && toFiniteNumber(order?.deliveryCost) > 0;
}

/**
 * One seller's share of a delivery cost, allocated PROPORTIONALLY by the value
 * of that seller's products in the order (rule 8), rounded to whole rupees.
 *
 *   share = deliveryCost * (vendorProductValue / orderProductValue)
 *
 * Example: A=₹300, B=₹200, total=₹500, cost=₹49 -> A=₹29, B=₹20 (sum ₹49).
 *
 * Guards a zero/absent order base so a malformed order never divides by zero or
 * over-charges a seller. Per-seller rounding can leave a ±₹1 residual against
 * the full cost on 3+ seller orders; that residual belongs to the
 * delivery-company-payable reconciliation (D), not to any seller.
 */
export function allocateSellerDeliveryCost(
  deliveryCost: unknown,
  vendorProductValue: unknown,
  orderProductValue: unknown
): number {
  const cost = toFiniteNumber(deliveryCost);
  const vendorValue = toFiniteNumber(vendorProductValue);
  const orderValue = toFiniteNumber(orderProductValue);

  if (cost <= 0 || vendorValue <= 0 || orderValue <= 0) return 0;

  return Math.round(cost * (vendorValue / orderValue));
}

/**
 * The forward delivery cost ONE seller bears for ONE order — the composition of
 * the two rules above. Zero unless the order shipped free.
 */
export function sellerForwardDeliveryForOrder(
  order: { freeDeliveryApplied?: unknown; deliveryCost?: unknown },
  vendorProductValue: number,
  orderProductValue: number
): number {
  if (!sellerBearsForwardDelivery(order)) return 0;
  return allocateSellerDeliveryCost(
    order.deliveryCost,
    vendorProductValue,
    orderProductValue
  );
}
