// SERVER-ONLY (Admin SDK). Loads a seller's storefront for the public route
// (app/store/[id]) and for the seller's own store page (app/api/seller/
// storefront). All shaping and field selection is lib/storefront/
// publicStorefront.ts; this file only reads and gates.
//
// STORE STATUS reuses vendors.status — admin-controlled, and frozen against
// seller writes by firestore.rules. Only an "Approved" seller's store is
// public; Pending, Rejected and Blocked stores are simply not found, so a
// suspended store cannot be reached (or its seller number learned) through
// any URL. No new status field exists.
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { productModerationStatus } from "@/lib/products/visibility";
import {
  SELLER_NUMBER_PATTERN,
  buildStorefront,
  type PublicStorefront,
} from "@/lib/storefront/publicStorefront";

export type PublicStorefrontResult =
  | { kind: "ok"; storefront: PublicStorefront }
  | { kind: "redirect"; sellerNumber: string }
  | { kind: "not-found" };

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

async function productsOf(db: Firestore, uid: string) {
  const snap = await db.collection("products").where("vendorId", "==", uid).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

async function publicProfileOf(db: Firestore, uid: string): Promise<DocumentData | null> {
  const snap = await db.collection("vendors_public").doc(uid).get();
  return snap.exists ? snap.data() || null : null;
}

/**
 * /store/[id]: `id` is a seller number (SELLER00001) — or, for links created
 * before seller numbers, a seller uid, which redirects to the seller-number
 * URL so the uid never stays in the address bar. Unknown, ambiguous or
 * non-public stores are "not-found" (the same answer, so status can't be probed).
 */
export async function loadPublicStorefront(db: Firestore, rawId: unknown): Promise<PublicStorefrontResult> {
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id || id.length > 128 || id.includes("/")) return { kind: "not-found" };

  const bySellerNumber = SELLER_NUMBER_PATTERN.test(id.toUpperCase());
  if (!bySellerNumber && !UID_PATTERN.test(id)) return { kind: "not-found" };

  const snap = await db
    .collection("vendors")
    .where(bySellerNumber ? "sellerNumber" : "uid", "==", bySellerNumber ? id.toUpperCase() : id)
    .limit(2)
    .get();
  if (snap.size !== 1) return { kind: "not-found" };

  const vendor = snap.docs[0].data() as Record<string, unknown>;
  const uid = typeof vendor.uid === "string" ? vendor.uid : "";
  if (!uid || vendor.status !== "Approved") return { kind: "not-found" };

  const sellerNumber =
    typeof vendor.sellerNumber === "string" && SELLER_NUMBER_PATTERN.test(vendor.sellerNumber)
      ? vendor.sellerNumber
      : null;
  // Legacy uid link: send the visitor to the seller-number URL.
  if (!bySellerNumber && sellerNumber) return { kind: "redirect", sellerNumber };
  // Canonical casing for a seller-number URL typed in lowercase.
  if (bySellerNumber && sellerNumber && id !== sellerNumber) return { kind: "redirect", sellerNumber };

  const [publicProfile, products] = await Promise.all([publicProfileOf(db, uid), productsOf(db, uid)]);
  return { kind: "ok", storefront: buildStorefront({ vendor, publicProfile, products }) };
}

export type SellerStorefrontStatus = {
  accountStatus: string;
  isPublic: boolean;
  message: string;
};

export type SellerStorefrontView = {
  status: SellerStorefrontStatus;
  publicPath: string | null;
  appearance: { storeLogo: string; storeBanner: string; aboutStore: string };
  preview: PublicStorefront;
  counts: {
    total: number;
    visible: number;
    outOfStock: number;
    pending: number;
    rejected: number;
    blocked: number;
    archived: number;
  };
};

const STATUS_MESSAGES: Record<string, string> = {
  Approved: "Your store is public. Customers can see your approved, active products.",
  Pending: "Your store is hidden until YOMICO approves your seller account.",
  Rejected: "Your store is hidden because your seller application was not approved.",
  Blocked: "Your store is hidden because your seller account is blocked. Please contact support.",
};

/** The seller's OWN storefront view: status, preview (whatever the status), and product counts. */
export async function loadSellerStorefront(
  db: Firestore,
  uid: string,
  vendor: Record<string, unknown>
): Promise<SellerStorefrontView> {
  const [publicProfile, products] = await Promise.all([publicProfileOf(db, uid), productsOf(db, uid)]);
  const preview = buildStorefront({ vendor, publicProfile, products });
  const accountStatus = typeof vendor.status === "string" ? vendor.status : "Pending";
  const isPublic = accountStatus === "Approved";

  const counts = { total: products.length, visible: preview.products.length, outOfStock: 0, pending: 0, rejected: 0, blocked: 0, archived: 0 };
  counts.outOfStock = preview.products.filter((p) => !p.inStock).length;
  for (const p of products) {
    const state = productModerationStatus(p.data);
    if (state === "pending") counts.pending += 1;
    else if (state === "rejected") counts.rejected += 1;
    else if (state === "blocked") counts.blocked += 1;
    else if (state === "archived") counts.archived += 1;
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    status: {
      accountStatus,
      isPublic,
      message: STATUS_MESSAGES[accountStatus] || "Your store is hidden.",
    },
    // The seller's own public link. Seller number when minted; otherwise the
    // legacy uid URL (their own uid, shown only to them).
    publicPath: isPublic ? `/store/${preview.sellerNumber || uid}` : null,
    appearance: {
      storeLogo: str(vendor.storeLogo),
      storeBanner: str(vendor.storeBanner),
      aboutStore: str(vendor.aboutStore),
    },
    preview,
    counts,
  };
}
