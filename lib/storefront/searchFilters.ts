// Search page filters that are worth testing on their own. Pure and
// dependency-free.

/**
 * The "minimum discount" filter (/search?minDiscount=N): the product's
 * discount off MRP, (mrp - price) / mrp, is at least `minimumDiscount` percent.
 * A product with no MRP has no discount to show, so it never matches.
 */
export function meetsMinimumDiscount(
  item: { mrp?: unknown; price?: unknown },
  minimumDiscount: number
): boolean {
  const mrp = Number(item.mrp || 0);
  const price = Number(item.price || 0);
  if (mrp <= 0) return false;
  const discount = ((mrp - price) / mrp) * 100;
  return discount >= minimumDiscount;
}
