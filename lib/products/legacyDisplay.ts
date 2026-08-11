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

export function toLegacyProduct(id: string, data: any): LegacyProductView {
  return {
    // Spread first — some product docs carry a stray, useless `id: ""`
    // field written by the seller form itself. The real Firestore
    // document ID (the `id` param) and every field below it MUST win over
    // whatever is in the raw doc, so they come last, never first.
    ...data,
    id,
    name: data.title || data.name || "",
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
