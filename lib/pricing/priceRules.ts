// ==========================================
// YOMICO Marketplace
// lib/pricing/priceRules.ts
// ==========================================
//
// The pricing rules every order path shares. Dependency-free (no Firebase, no
// server imports), so the web pricing pass (lib/orderPricing.ts) and both
// mobile order routes (app/api/mobile/place-order,
// app/api/mobile/create-payment-order) charge the same product the same way.
//
// BASE PRICE — productBasePrice()
//   `sellingPrice` is the price every seller listing stores (ProductForm,
//   create-product, update-product all require it > 0). `price` is a legacy
//   field a few products still carry, and it is never updated when the seller
//   edits `sellingPrice`, so it can be stale. Therefore:
//     sellingPrice, when it is a finite number > 0
//     else price,   when it is a finite number > 0
//     else 0        (the fallback every path already used for a product
//                    with no usable price)
//   A per-variant price is layered on top by effectiveVariantPrice()
//   (lib/products/variantSelection.ts): a variant's own price > 0 wins,
//   otherwise it falls back to this base price.
//
// GST — prices are GST-INCLUSIVE
//   The listed price already contains GST. No order path adds GST on top of
//   it; the GST component is extracted from the gross line amount when the
//   order is confirmed (lib/sellerTax.ts#computeLineTaxSnapshot), which is
//   what the invoice shows. Seller settlement is computed on the same
//   GST-inclusive line prices (lib/vendorEarnings.ts).
//
// PAYABLE TOTAL — payableTotal()
//   What the customer is charged / asked to pay: rounded to the whole rupee,
//   never below ₹1. The same rule the web pricing pass and the Razorpay
//   order already apply. Only the payable amount is rounded — items subtotal
//   and discount stay exact, so seller settlement is unaffected.

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** The product's base unit price: sellingPrice, else legacy price, else 0. */
export function productBasePrice(
  product: { sellingPrice?: unknown; price?: unknown } | null | undefined
): number {
  return positiveNumber(product?.sellingPrice) ?? positiveNumber(product?.price) ?? 0;
}

/** The customer-payable amount for a raw total: whole rupees, minimum ₹1. */
export function payableTotal(rawTotal: number): number {
  return Math.max(1, Math.round(rawTotal));
}
