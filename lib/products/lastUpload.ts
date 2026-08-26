// ==========================================
// YOMICO Marketplace
// lib/products/lastUpload.ts
// ==========================================

import type { Product } from "./product";

// Most sellers list within one category, so the second product of a session
// repeats nearly everything the first one had — category, brand, shipping
// dimensions, warranty, specifications. This remembers the values a seller
// just uploaded so the next Add Product form can start from them instead of
// from an empty form.
//
// Deliberately sessionStorage, not localStorage or Firestore: this is a
// convenience for the current sitting, never a saved draft. It has to
// survive navigating to the product list and back (it does), and it should
// not outlive the tab (it does not).

const STORAGE_KEY = "yomico:seller:lastUpload";

// Everything the form needs to repopulate, minus the parts that must never
// be inherited. `id` belongs to the document just written; the image fields
// identify one specific product; the timestamps are re-stamped server-side
// on every save and are not JSON round-trippable as Date objects anyway.
//
// The approval flag and the rating/analytics counters are excluded for
// safety rather than convenience. On the one path that writes a draft today
// they are always false/0, but a draft must never be able to hand a
// brand-new listing someone else's review count — or, worse, an approved
// status it never went through review for. Leaving them out means the
// form's own defaults supply them on restore.
export type LastUploadDraft = Omit<
  Product,
  | "id"
  | "thumbnail"
  | "images"
  | "video"
  | "createdAt"
  | "updatedAt"
  | "approved"
  | "rating"
  | "reviewCount"
  | "views"
  | "sales"
  | "wishlistCount"
>;

interface StoredEnvelope {
  vendorId: string;
  savedAt: number;
  product: LastUploadDraft;
}

// ------------------------------------------
// Save
// ------------------------------------------

export function saveLastUpload(
  vendorId: string,
  product: Product
): void {

  if (typeof window === "undefined" || !vendorId) return;

  const {
    id: _id,
    thumbnail: _thumbnail,
    images: _images,
    video: _video,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    approved: _approved,
    rating: _rating,
    reviewCount: _reviewCount,
    views: _views,
    sales: _sales,
    wishlistCount: _wishlistCount,
    ...reusable
  } = product;

  const envelope: StoredEnvelope = {
    vendorId,
    savedAt: Date.now(),
    product: reusable,
  };

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(envelope)
    );
  } catch {
    // Storage can be unavailable (private browsing) or full. Prefilling is
    // a convenience — never fail an upload that already succeeded over it.
  }

}

// ------------------------------------------
// Load
// ------------------------------------------

export function loadLastUpload(
  vendorId: string
): LastUploadDraft | null {

  if (typeof window === "undefined" || !vendorId) return null;

  try {

    const raw = window.sessionStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const envelope = JSON.parse(raw) as Partial<StoredEnvelope>;

    if (!envelope?.product) return null;

    // Scoped to the seller who saved it. sessionStorage outlives a sign-out
    // within the same tab, so without this a second seller signing in on a
    // shared browser would start with the first one's product prefilled.
    if (envelope.vendorId !== vendorId) return null;

    return envelope.product;

  } catch {
    return null;
  }

}

// ------------------------------------------
// Clear
// ------------------------------------------

export function clearLastUpload(): void {

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover from — the caller resets the form either way.
  }

}
