// ==========================================
// YOMICO Marketplace
// lib/products/visibility.ts
// ==========================================
//
// The ONE product-publication rule. Every customer-facing product surface
// (storefront lists, the product page, AI customer tools) and every server
// order path uses these helpers, so "can a customer see / buy this product"
// has a single answer.
//
// A product is customer-visible only when BOTH hold:
//   1. it is approved for sale — `approvalStatus` is "approved", OR the
//      product has no `approvalStatus` at all (the catalog that existed
//      before the approval gate), and
//   2. it is not blocked — `active !== false`.
//
// Why `approvalStatus` and not the older `approved` boolean: the legacy
// seller form wrote `approved: false` onto nearly every existing product and
// nothing ever set it to true, so `approved` cannot distinguish a live legacy
// product from one awaiting review. `approvalStatus` is written only by the
// server — "pending" at seller creation (app/api/seller/create-product), then
// "approved" / "rejected" by an admin (app/api/admin/products/[id]/moderation)
// — so its ABSENCE reliably means "pre-gate product", which stays visible.
// `approved` is still kept in step by the moderation route for display, but
// it is never read for visibility.
//
// Any unknown approvalStatus value fails closed (hidden), and `active` keeps
// the existing `!== false` test so a product with no `active` field stays
// visible exactly as before.
//
// Dependency-free: safe for client components, server routes and tests.

export type ApprovalStatus = "pending" | "approved" | "rejected";

/** What an admin or seller sees as the product's moderation state. */
export type ModerationStatus = "pending" | "rejected" | "blocked" | "live";

type ModeratableProduct =
  | { active?: unknown; approvalStatus?: unknown }
  | null
  | undefined;

/** Approved for sale: approvalStatus "approved", or no approvalStatus (pre-gate catalog). */
export function isApprovedForSale(product: ModeratableProduct): boolean {
  const status = product?.approvalStatus;
  return status === undefined || status === null || status === "approved";
}

/** The canonical rule: approved for sale AND not blocked. */
export function isProductVisible(product: ModeratableProduct): boolean {
  if (!product) return false;
  return product.active !== false && isApprovedForSale(product);
}

/** Alias for call sites that read better as a question about the customer. */
export function shouldShowToCustomer(product: ModeratableProduct): boolean {
  return isProductVisible(product);
}

/**
 * Moderation state for admin/seller screens.
 *   pending  — awaiting admin review (or an unknown status: fail closed)
 *   rejected — admin rejected it (a rejectionReason is stored)
 *   blocked  — approved (or pre-gate) but taken down with active:false
 *   live     — customer-visible
 */
export function productModerationStatus(product: ModeratableProduct): ModerationStatus {
  const status = product?.approvalStatus;
  if (status === "rejected") return "rejected";
  if (status !== undefined && status !== null && status !== "approved") return "pending";
  return product?.active === false ? "blocked" : "live";
}

/** Fields a brand-new seller product is always created with (server-set). */
export const NEW_PRODUCT_MODERATION = {
  approvalStatus: "pending",
  approved: false,
  active: false,
  featured: false,
} as const;

/** Moderation fields a seller may never write, on create or update. */
export const SELLER_FORBIDDEN_MODERATION_FIELDS = [
  "approvalStatus",
  "approved",
  "active",
  "featured",
  "rejectionReason",
  "moderatedAt",
  "moderatedBy",
] as const;
