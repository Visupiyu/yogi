// ==========================================
// YOMICO Marketplace
// lib/products/sellerProductFields.ts
// ==========================================
//
// The ONE list of product fields a seller's browser may send, and which of
// them change what an admin approved.
//
// app/api/seller/create-product and app/api/seller/update-product accept ONLY
// these keys and refuse a request carrying any other (identity, product
// number, counters, moderation, lifecycle and timestamps are server-owned).
// ProductForm sends exactly this set. firestore.rules keeps a matching
// allow-list for the few fields a seller may still write directly.
//
// Dependency-free: safe for client components, server routes and tests.

export const SELLER_PRODUCT_FIELDS = [
  // Identity of the listing (not the seller)
  "sku",
  "slug",
  // Category (locked once approved — lib/products/categoryLock.ts)
  "categoryId",
  "subCategoryId",
  "leafCategoryId",
  // Content
  "title",
  "shortTitle",
  "description",
  "brand",
  "model",
  // Pricing (validated by lib/products/sellerProductValidation.ts)
  "mrp",
  "sellingPrice",
  "price", // legacy field some products carry; validated when present
  "costPrice",
  "discount",
  "currency",
  // Tax
  "hsn",
  "gstRate",
  "gstPercent", // legacy mobile field; validated when present
  // Inventory
  "stock",
  "minStock",
  "maxStock",
  // Media
  "thumbnail",
  "images",
  "video",
  // Details
  "specifications",
  "variants",
  "weight",
  "length",
  "width",
  "height",
  "warranty",
  "returnDays",
  // SEO
  "metaTitle",
  "metaDescription",
  "keywords",
] as const;

export type SellerProductField = (typeof SELLER_PRODUCT_FIELDS)[number];

const ALLOWED = new Set<string>(SELLER_PRODUCT_FIELDS);

/** Keys in `input` a seller may not send. */
export function unknownSellerProductFields(input: Record<string, unknown>): string[] {
  return Object.keys(input).filter((key) => !ALLOWED.has(key));
}

/** Only the seller-sendable fields of `input` (used by ProductForm). */
export function pickSellerProductFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SELLER_PRODUCT_FIELDS) {
    if (key in input && input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

/**
 * Fields whose change alters what an admin approved: the listing's content
 * and media. Editing any of them on an approved (or pre-approval legacy)
 * product sends it back to "pending" review. Price, stock, tax, dimensions,
 * warranty, returns and SEO fields do not — they are validated server-side
 * and are operational, not a different product. Category is already locked
 * once approved (categoryLock.ts).
 */
export const REREVIEW_FIELDS = [
  "title",
  "shortTitle",
  "description",
  "brand",
  "model",
  "thumbnail",
  "images",
  "video",
  "specifications",
] as const;

/** JSON with object keys sorted, so key order never reads as a change. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** What the variants ARE (id + attributes), ignoring their price and stock. */
function variantDefinitions(variants: unknown): string {
  if (!Array.isArray(variants)) return "[]";
  return stableStringify(
    variants.map((v) => {
      const variant = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return { id: variant.id ?? null, attributes: variant.attributes ?? null };
    })
  );
}

/**
 * The re-review fields that differ between the stored product and the product
 * as it will be after an edit ("variants" when a variant's id/attributes —
 * not its price or stock — changed). Empty and absent values are equal.
 */
export function reReviewFieldsChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const norm = (v: unknown) => {
    if (v === undefined || v === null || v === "") return "";
    const s = stableStringify(v);
    return s === "[]" || s === "{}" ? "" : s;
  };
  const changed: string[] = REREVIEW_FIELDS.filter((f) => norm(before[f]) !== norm(after[f]));
  if (variantDefinitions(before.variants) !== variantDefinitions(after.variants)) changed.push("variants");
  return changed;
}
