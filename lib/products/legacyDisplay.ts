// ==========================================
// YOMICO Marketplace
// lib/products/legacyDisplay.ts
// ==========================================
//
// Real product docs (written by the seller ProductForm) use
// title/thumbnail/sellingPrice/categoryId. Several older customer-facing
// pages were built against an ad-hoc name/image/price/category shape and
// never updated when the real schema changed. Rather than rewriting every
// one of those pages, this maps a raw Firestore product doc into the shape
// they already expect.

export type LegacyProductView = {
  id: string;
  name: string;
  price: number;
  image: string;
  images: string[];
  mrp?: number;
  stock: number;
  category: string;
  categoryId: string;
  description: string;
  vendorId: string;
  vendorName: string;
  brand?: string;
  [key: string]: any;
};

// Admin blocks a product by setting active:false (app/admin/products).
// Nothing on the storefront checked it, so a blocked product stayed
// browsable, add-to-cart-able and only failed at checkout with a generic
// "currently unavailable" — after the customer had already committed.
//
// Tested as `!== false` rather than `=== true` on purpose: one production
// product has no `active` field at all, and every server-side gate that
// already exists (computeOrderPricing, checkout validateStock) uses the
// same `active === false` test. Treating a missing field as visible keeps
// that product live and matches the server exactly — a `where("active","==",true)`
// query would silently drop it, and would need a new composite index on
// the category page besides.
export function isStorefrontVisible(data: any): boolean {
  return data?.active !== false;
}

export function toLegacyProduct(id: string, data: any): LegacyProductView {
  return {
    // Spread first — some product docs carry a stray, useless `id: ""`
    // field written by the seller form itself. The real Firestore
    // document ID (the `id` param) and every field below it MUST win over
    // whatever is in the raw doc, so they come last, never first.
    ...data,
    id,
    // shortTitle is the concise customer-facing name for cards (homepage,
    // category, search, etc.) — falls back to the full title for products
    // saved before shortTitle existed, so nothing breaks retroactively.
    name: data.shortTitle || data.title || data.name || "",
    price:
      typeof data.sellingPrice === "number" ? data.sellingPrice : data.price || 0,
    image:
      data.thumbnail ||
      data.image ||
      (Array.isArray(data.images) ? data.images[0] : "") ||
      "",
    images: Array.isArray(data.images) ? data.images : [],
    mrp: data.mrp,
    stock: typeof data.stock === "number" ? data.stock : 0,
    category: data.categoryId || data.category || "",
    categoryId: data.categoryId || data.category || "",
    description: data.description || "",
    vendorId: data.vendorId || "",
    vendorName: data.vendorName || "",
    brand: data.brand,
  };
}
