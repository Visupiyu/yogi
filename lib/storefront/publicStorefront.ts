// ==========================================
// YOMICO Marketplace
// lib/storefront/publicStorefront.ts
// ==========================================
//
// The PUBLIC shape of a seller's storefront, and the only code that decides
// what goes into it. Every field is chosen here from an explicit whitelist:
//
//   store   — sellerNumber, store name (the business name, never the owner's
//             personal name), logo, banner, About text, rating
//   product — id, display name, price/MRP, image, stock state, category,
//             brand, rating/reviewCount
//
// Nothing else ever leaves the server: no email, phone, street address, bank,
// PAN, Aadhaar, KYC, settlement/payout/withdrawal data, and no vendor uid or
// other internal identifier. Product visibility is lib/products/visibility.ts
// (approved AND active AND not archived) — the same rule every storefront and
// order path uses; this file adds no second visibility system.
//
// Dependency-free apart from the catalog names, so the server loader, the
// client view and the tests share it.
import { findNodeById } from "@/lib/catalog/categoryUtils";
import { isProductVisible } from "@/lib/products/visibility";

/** Server-minted seller number, e.g. SELLER00001 (lib/humanIds). */
export const SELLER_NUMBER_PATTERN = /^SELLER\d{5,}$/;
export const MAX_ABOUT_LENGTH = 2000;

export type StorefrontProduct = {
  id: string;
  name: string;
  price: number;
  mrp: number | null;
  image: string;
  stock: number;
  inStock: boolean;
  categoryId: string;
  categoryName: string;
  brand: string;
  rating: number;
  reviewCount: number;
  createdAtMs: number;
};

export type PublicStorefront = {
  sellerNumber: string | null;
  storeName: string;
  storeLogo: string | null;
  storeBanner: string | null;
  about: string;
  /** vendors_public.rating when an admin has set one (> 0). */
  rating: number | null;
  /** Weighted average of the visible products' server-computed ratings. */
  reviewSummary: { average: number; count: number } | null;
  products: StorefrontProduct[];
  categories: { id: string; name: string }[];
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function millis(v: unknown): number {
  const t = v as { toMillis?: () => number; seconds?: number } | null;
  if (t && typeof t.toMillis === "function") return t.toMillis();
  if (t && typeof t.seconds === "number") return t.seconds * 1000;
  return 0;
}

/**
 * A store image may be shown only if it is a Firebase Storage download URL
 * (the Storage emulator too, only in the opt-in local-test mode — the same
 * switch next.config.ts uses). Anything else is dropped, so an arbitrary
 * external URL saved into a store record is never rendered.
 */
export function safeStoreImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol === "https:" && url.hostname === "firebasestorage.googleapis.com") return value;
  if (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    url.port === "9199"
  ) {
    return value;
  }
  return null;
}

/** The decoded Storage object path of a download URL, or null. */
export function storageObjectPath(value: unknown): string | null {
  if (!safeStoreImageUrl(value)) return null;
  try {
    const match = new URL(value as string).pathname.match(/\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** A store image the seller may set: a Storage URL in THEIR OWN vendor-store/{uid}/ folder. */
export function isOwnStoreImageUrl(uid: string, value: unknown): boolean {
  const path = storageObjectPath(value);
  const prefix = `vendor-store/${uid}/`;
  return (
    !!uid &&
    !!path &&
    path.startsWith(prefix) &&
    path.length > prefix.length &&
    !path.includes("..") &&
    !path.slice(prefix.length).includes("/")
  );
}

/** About text as stored and shown: trimmed, control characters removed (newlines kept). */
export function cleanAbout(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_ABOUT_LENGTH);
}

/** The public card for ONE product, or null when it is not customer-visible. */
export function toStorefrontProduct(id: string, data: Record<string, unknown>): StorefrontProduct | null {
  if (!isProductVisible(data)) return null;
  const price = typeof data.sellingPrice === "number" ? data.sellingPrice : num(data.price);
  const mrp = num(data.mrp);
  const stock = Math.max(0, Math.floor(num(data.stock)));
  const images = Array.isArray(data.images) ? data.images : [];
  const categoryId = String(data.categoryId || data.category || "");
  const rating = num(data.rating);
  return {
    id,
    name: String(data.shortTitle || data.title || data.name || ""),
    price,
    mrp: mrp > price ? mrp : null,
    image: String(data.thumbnail || data.image || images[0] || ""),
    stock,
    inStock: stock > 0,
    categoryId,
    categoryName: (categoryId && findNodeById(categoryId)?.name) || categoryId,
    brand: typeof data.brand === "string" ? data.brand : "",
    rating: rating >= 0 && rating <= 5 ? rating : 0,
    reviewCount: Math.max(0, Math.floor(num(data.reviewCount))),
    createdAtMs: millis(data.createdAt),
  };
}

/**
 * The public storefront from a seller's records. Store-status gating (only an
 * admin-Approved seller is public) is the caller's job — the seller's own
 * preview uses this too, whatever their status.
 */
export function buildStorefront(params: {
  vendor: Record<string, unknown>;
  publicProfile?: Record<string, unknown> | null;
  products: { id: string; data: Record<string, unknown> }[];
}): PublicStorefront {
  const { vendor, publicProfile } = params;
  const products = params.products
    .map((p) => toStorefrontProduct(p.id, p.data))
    .filter((p): p is StorefrontProduct => p !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const reviewed = products.filter((p) => p.reviewCount > 0);
  const reviewCount = reviewed.reduce((s, p) => s + p.reviewCount, 0);
  const reviewSummary =
    reviewCount > 0
      ? {
          average: Math.round((reviewed.reduce((s, p) => s + p.rating * p.reviewCount, 0) / reviewCount) * 10) / 10,
          count: reviewCount,
        }
      : null;

  const adminRating = num(publicProfile?.rating);
  const categories = [
    ...new Map(products.filter((p) => p.categoryId).map((p) => [p.categoryId, p.categoryName])).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sellerNumber =
    typeof vendor.sellerNumber === "string" && SELLER_NUMBER_PATTERN.test(vendor.sellerNumber)
      ? vendor.sellerNumber
      : null;

  return {
    sellerNumber,
    storeName: (typeof vendor.businessName === "string" && vendor.businessName.trim()) || "YOMICO Seller",
    storeLogo: safeStoreImageUrl(vendor.storeLogo),
    storeBanner: safeStoreImageUrl(vendor.storeBanner),
    about: cleanAbout(vendor.aboutStore),
    rating: adminRating > 0 && adminRating <= 5 ? adminRating : null,
    reviewSummary,
    products,
    categories,
  };
}
