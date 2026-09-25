// Dependency-free, so every checkout entry point — web COD and ONLINE (via
// lib/orderPricing.ts#computeOrderPricing) and both mobile routes
// (app/api/mobile/place-order, app/api/mobile/create-payment-order) — shares
// ONE quantity rule, and a plain unit test can import it without Firebase.
//
// A retail order line is a whole number of units. The rule is strict: the
// value must already BE a number (no "2" string coercion), a safe integer,
// and at least 1. 0, negatives, NaN, Infinity and fractions such as 0.01 or
// 1.5 are REJECTED — never rounded. Rounding would silently change what the
// customer asked for; accepting a fraction let the customer choose the charged
// amount (0.01 x ₹599 = ₹5.99) and left fractional stock and seller earnings
// behind.
//
// The upper bound is available stock, which every caller already checks
// against the aggregate per-product / per-variant demand.
export function isValidOrderQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export const INVALID_QUANTITY_MESSAGE =
  "Invalid quantity in cart. Quantities must be whole numbers of at least 1.";
