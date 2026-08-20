// The single shipping rule, shared by every surface that shows or charges
// it. Deliberately dependency-free — no Firebase import of any kind — so the
// same function can run in the browser (cart, checkout) and on the server
// (lib/orderPricing.ts, which may only touch the Admin SDK). lib/shipping.ts
// re-exports it for client callers; do not import lib/shipping.ts from
// server code, it pulls the client SDK.
//
// Three implementations had drifted apart before this:
//
//   app/cart/page.tsx        total >= threshold || total === 0
//   app/checkout/page.tsx    finalAmount >= threshold      (post-coupon base)
//   lib/orderPricing.ts      subtotal > threshold          (strict, 999/99)
//
// So a ₹499 cart was shown FREE delivery and charged ₹49, and applying a
// coupon could add shipping back at checkout after the cart had already
// promised it free.

// Fallbacks for when settings/global is missing or has a malformed field.
// These match what settings/global actually holds in production
// (freeShippingThreshold 499, standardShippingCharge 49), so the fallback
// path and the configured path agree instead of silently charging double.
export const FREE_SHIPPING_THRESHOLD = 499;

export const STANDARD_SHIPPING_CHARGE = 49;

export interface ShippingSettings {
  freeShippingThreshold: number;
  standardShippingCharge: number;
}

/**
 * Shipping for an order, from its **pre-discount** item subtotal.
 *
 * `>=` because that is what both customer-facing surfaces already used, and
 * what "free delivery over ₹499" means to someone reading it.
 *
 * The base is the raw item subtotal, not the post-coupon amount: the cart
 * has already told the customer delivery is free at that subtotal, and a
 * coupon taking it back is a worse surprise than the marginal revenue is
 * worth. It also matches what the server has always charged.
 */
export function calculateShippingCharge(
  subtotal: number,
  settings: ShippingSettings
): number {
  if (!(subtotal > 0)) return 0;

  return subtotal >= settings.freeShippingThreshold
    ? 0
    : settings.standardShippingCharge;
}
