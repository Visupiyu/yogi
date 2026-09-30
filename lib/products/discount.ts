// ==========================================
// YOMICO Marketplace
// lib/products/discount.ts
// ==========================================
//
// Display-only discount maths for product cards: the whole-percent saving of
// a selling price against its MRP. Never used for pricing or money — order
// totals are always computed on the server.
//
// Dependency-free: safe for any client component.

/** Whole-percent discount of `price` against `mrp`, or null when there is none. */
export function discountPercent(price: unknown, mrp: unknown): number | null {
  const p = Number(price);
  const m = Number(mrp);
  if (!Number.isFinite(p) || !Number.isFinite(m) || p <= 0 || m <= p) return null;
  const pct = Math.round(((m - p) / m) * 100);
  return pct >= 1 ? pct : null;
}
