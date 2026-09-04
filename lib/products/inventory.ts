// ==========================================
// YOMICO Marketplace
// lib/products/inventory.ts
// ==========================================

export interface Inventory {

  stock: number;

  reservedStock: number;

  availableStock: number;

  lowStockThreshold: number;

  trackInventory: boolean;

  allowBackorder: boolean;

  stockStatus:
    | "IN_STOCK"
    | "LOW_STOCK"
    | "OUT_OF_STOCK";

}

// ------------------------------------------
// Available Stock
// ------------------------------------------

export function getAvailableStock(

  stock: number,

  reservedStock: number = 0

): number {

  return Math.max(

    stock - reservedStock,

    0

  );

}

// ------------------------------------------
// Stock Status
// ------------------------------------------

export function getStockStatus(

  availableStock: number,

  lowStockThreshold: number = 5

): "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" {

  if (availableStock <= 0)

    return "OUT_OF_STOCK";

  if (availableStock <= lowStockThreshold)

    return "LOW_STOCK";

  return "IN_STOCK";

}

// ------------------------------------------
// Increase Stock
// ------------------------------------------

export function increaseStock(

  currentStock: number,

  quantity: number

): number {

  return currentStock + quantity;

}

// ------------------------------------------
// Decrease Stock
// ------------------------------------------

export function decreaseStock(

  currentStock: number,

  quantity: number

): number {

  return Math.max(

    currentStock - quantity,

    0

  );

}

// ------------------------------------------
// Reserve Stock
// ------------------------------------------

export function reserveStock(

  reservedStock: number,

  quantity: number

): number {

  return reservedStock + quantity;

}

// ------------------------------------------
// Release Reserved Stock
// ------------------------------------------

export function releaseReservedStock(

  reservedStock: number,

  quantity: number

): number {

  return Math.max(

    reservedStock - quantity,

    0

  );

}

// ------------------------------------------
// Can Purchase
// ------------------------------------------

export function canPurchase(

  availableStock: number,

  quantity: number

): boolean {

  return availableStock >= quantity;

}

// ------------------------------------------
// Per-variant stock — Strategy 1
// ------------------------------------------
//
// Under Strategy 1 the per-variant `stock` on a product's `variants[]` array is
// the authoritative available quantity, and the top-level product.stock is
// DERIVED from the variant totals. These helpers are pure (no Firestore, no
// side effects) so the exact same logic runs in every server order/restock
// transaction — one definition rather than several inline copies that drift.

export type VariantStockEntry = {
  id?: string;
  stock?: unknown;
  [key: string]: unknown;
};

/**
 * Whether this product carries STOCK-BEARING variants — the Strategy 1 model,
 * where each entry has its own `id` and `stock`, and planVariantDecrements()
 * matches on that id.
 *
 * The test is deliberately "at least one entry with a non-empty string id",
 * not "variants is non-empty": the mobile catalogue stores a DIFFERENT,
 * non-stock-bearing shape on the same field ({label, options[]}, no per-entry
 * id — see app/api/mobile/place-order). Treating those as variant stock would
 * refuse every mobile order for such a product.
 *
 * This is the guard for the Strategy 1 invariant: a product whose stock lives
 * on its variants may only be ordered through the variant path. Mixing paths
 * silently loses units, because the variant path SETS product.stock to the
 * variant sum while the product-level path DECREMENTS it — so a later variant
 * purchase overwrites (and thereby restores) an earlier product-level
 * decrement.
 */
export function hasStockBearingVariants(variants: unknown): boolean {
  return (
    Array.isArray(variants) &&
    variants.some((v) => {
      const id = (v as VariantStockEntry | null)?.id;
      return typeof id === "string" && id.length > 0;
    })
  );
}

/** The derived product.stock: the sum of every variant's (numeric, >=0) stock. */
export function sumVariantStock(variants: VariantStockEntry[]): number {
  if (!Array.isArray(variants)) return 0;
  return variants.reduce((sum, v) => {
    const n = Number(v?.stock);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/**
 * Plan per-variant decrements for a set of demands against the current variants.
 *
 * Returns a NEW variants array with each demanded variant reduced by up to its
 * own available stock (never below 0), the shortfalls, the total actually taken,
 * and whether every demand was fully satisfiable. Pure — computes only, writes
 * nothing.
 *
 *   - Callers that MUST reject on shortage (COD /api/place-order) check
 *     `allSatisfied` and refuse when false, discarding `newVariants`.
 *   - Callers that must NEVER reject because money is already captured
 *     (Razorpay finalize) use `newVariants` + `shortfalls` as-is, taking what
 *     exists and flagging the rest for review.
 *
 * A variantId absent from the array is a shortfall with available 0 (a stale or
 * deleted variant) — never invented.
 */
export function planVariantDecrements(
  variants: VariantStockEntry[],
  demand: Map<string, number>
): {
  newVariants: VariantStockEntry[];
  shortfalls: { variantId: string; wanted: number; available: number }[];
  totalTaken: number;
  allSatisfied: boolean;
} {
  const working = (Array.isArray(variants) ? variants : []).map((v) => ({ ...v }));
  const shortfalls: { variantId: string; wanted: number; available: number }[] = [];
  let totalTaken = 0;
  let allSatisfied = true;

  for (const [variantId, wantedRaw] of demand) {
    const wanted = Number(wantedRaw) > 0 ? Number(wantedRaw) : 0;
    const idx = working.findIndex((v) => v?.id === variantId);
    if (idx < 0) {
      allSatisfied = false;
      shortfalls.push({ variantId, wanted, available: 0 });
      continue;
    }
    const cur = Number(working[idx].stock);
    const available = Number.isFinite(cur) && cur > 0 ? cur : 0;
    const take = Math.min(available, wanted);
    if (take < wanted) {
      allSatisfied = false;
      shortfalls.push({ variantId, wanted, available });
    }
    working[idx] = { ...working[idx], stock: available - take };
    totalTaken += take;
  }

  return { newVariants: working, shortfalls, totalTaken, allSatisfied };
}

/**
 * Add stock back to variants (order cancellation / restock). Returns a NEW
 * variants array and how much was actually restored to variants. A variantId no
 * longer present in the array is ignored (the variant was deleted since
 * purchase) rather than invented — the caller decides what to do with the
 * un-restorable remainder. Pure.
 */
export function applyVariantRestores(
  variants: VariantStockEntry[],
  restore: Map<string, number>
): { newVariants: VariantStockEntry[]; restoredToVariants: number } {
  const working = (Array.isArray(variants) ? variants : []).map((v) => ({ ...v }));
  let restoredToVariants = 0;
  for (const [variantId, qtyRaw] of restore) {
    const qty = Number(qtyRaw) > 0 ? Number(qtyRaw) : 0;
    if (qty === 0) continue;
    const idx = working.findIndex((v) => v?.id === variantId);
    if (idx < 0) continue; // deleted variant — do not invent stock
    const cur = Number(working[idx].stock);
    const base = Number.isFinite(cur) && cur > 0 ? cur : 0;
    working[idx] = { ...working[idx], stock: base + qty };
    restoredToVariants += qty;
  }
  return { newVariants: working, restoredToVariants };
}