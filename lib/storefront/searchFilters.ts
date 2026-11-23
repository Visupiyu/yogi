// Search page filters that are worth testing on their own. Pure and
// dependency-free.

/**
 * The "minimum discount" filter (/search?minDiscount=N): the product's
 * discount off MRP, (mrp - price) / mrp, is at least `minimumDiscount` percent.
 * A product with no MRP has no discount to show, so it never matches.
 * Rounded exactly as the "% OFF" badge rounds it (lib/products/helpers.ts
 * getDiscountPercentage, the server-stored discount), so a product badged
 * "40% OFF" is never missing from the 40%+ deals list (F-10).
 */
export function meetsMinimumDiscount(
  item: { mrp?: unknown; price?: unknown },
  minimumDiscount: number
): boolean {
  const mrp = Number(item.mrp || 0);
  const price = Number(item.price || 0);
  if (mrp <= 0) return false;
  const discount = Math.round(((mrp - price) / mrp) * 100);
  return discount >= minimumDiscount;
}
