// Checkout's displayed payable total (client-safe, pure).
//
// Mirrors how lib/orderPricing.ts derives what is actually charged, so the page
// never shows a figure the server will not charge:
//   rawTotal    = subtotal + shipping
//   discount    = min(couponDiscount, rawTotal)
//   finalTotal  = max(1, round(rawTotal - discount))
// A percentage coupon can produce a fractional rupee amount; the server rounds
// the final charge, so the display must too. The server stays authoritative —
// this is presentation only and is never sent to it.
export function payableTotal(
  subtotal: number,
  couponDiscount: number,
  shipping: number
): number {
  const rawTotal = (Number(subtotal) || 0) + (Number(shipping) || 0);
  const discount = Math.min(Math.max(0, Number(couponDiscount) || 0), rawTotal);
  return Math.max(1, Math.round(rawTotal - discount));
}
