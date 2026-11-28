// SERVER-ONLY (firebase-admin). The ONE implementation of a seller's product
// edit, shared by app/api/seller/update-product (the product form) and
// app/api/seller/bulk-edit-products (Bulk Edit via Excel), so both apply the
// exact same rules in the same order:
//
//   - only fields that actually change are written; server-owned fields and
//     stored Timestamps are never written back;
//   - category is fixed once the product is approved (lib/products/
//     categoryLock.ts) — refused, not dropped;
//   - money is validated on the document as it will be AFTER the write
//     (lib/products/sellerProductValidation.ts), and the MRP / ₹499 pricing
//     policy whenever a price field changes;
//   - the discount is re-derived from MRP and selling price, never taken from
//     the browser;
//   - changing content an admin approved (or MRP) on an approved / legacy-live
//     product sends it back to "pending" review, hidden, with an admin
//     notification.
//
// Moved here unchanged from app/api/seller/update-product/route.ts. Ownership
// and the seller-account check stay with each caller (they read the product
// inside their own transaction and must refuse another seller's product
// before planning anything).

import { Timestamp, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import {
  deriveDiscountPercent,
  pricePolicyFieldsChanged,
  validateSellerProductMoney,
  validateSellerProductPricing,
} from "@/lib/products/sellerProductValidation";
import { reReviewFieldsChanged } from "@/lib/products/sellerProductFields";
import { isApprovedForSale } from "@/lib/products/visibility";
import {
  PRODUCT_CATEGORY_FIELDS,
  changedLockedCategoryFields,
  isCategoryLocked,
} from "@/lib/products/categoryLock";

// Never writable through a seller edit. active/approved/featured are admin
// moderation; vendorId/productNumber/createdAt are identity; the counters
// accrue only through their own guarded paths; updatedAt is stamped here.
export const SELLER_EDIT_SERVER_OWNED_FIELDS = new Set([
  "id",
  "productNumber",
  "vendorId",
  "approved",
  "featured",
  "active",
  "createdAt",
  "updatedAt",
  "sales",
  "rating",
  "reviewCount",
  "views",
  "wishlistCount",
  // Approval moderation — written only by the admin moderation route.
  "approvalStatus",
  "rejectionReason",
  "moderatedAt",
  "moderatedBy",
]);

export type SellerEditPlan =
  | { ok: true; changes: Record<string, unknown>; reReview: string[] }
  | { ok: false; status: number; error: string; errors?: string[] };

/**
 * What a seller edit of `existing` with `incoming` (already limited to seller
 * product fields) would write, or why it is refused. Pure: reads nothing,
 * writes nothing. `changes` empty means there is nothing to write.
 */
export function planSellerProductEdit(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): SellerEditPlan {
  // Only fields the seller actually changed are written. A field whose
  // stored value is a Firestore Timestamp is server-owned (it cannot
  // survive the JSON round trip intact), so it is never written back.
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (SELLER_EDIT_SERVER_OWNED_FIELDS.has(key)) continue;
    if (value === undefined) continue;
    if (existing[key] instanceof Timestamp) continue;
    if (JSON.stringify(existing[key]) === JSON.stringify(value)) continue;
    changes[key] = value;
  }

  // Category is fixed once the product is approved (see
  // lib/products/categoryLock.ts; firestore.rules enforces the same rule on
  // direct SDK writes). Refused outright rather than silently dropped, so
  // the seller is told why their change did not apply.
  const lockedCategoryChanges = changedLockedCategoryFields(existing, changes);
  if (lockedCategoryChanges.length > 0) {
    return {
      ok: false,
      status: 403,
      error:
        "The category of an approved product can't be changed. Please contact YOMICO support to move it to another category.",
    };
  }
  // Anything left under a category key on a locked product is a no-op
  // (e.g. "" re-sent for a field the product never had) — never write it.
  if (isCategoryLocked(existing)) {
    for (const field of PRODUCT_CATEGORY_FIELDS) delete changes[field];
  }

  // The discount figure is never the browser's: it is re-derived below
  // from the resulting MRP and sellingPrice.
  delete changes.discount;

  // Validate the document as it will be AFTER this write.
  const after = { ...existing, ...changes };
  const validation = validateSellerProductMoney(after);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.errors.join("\n"), errors: validation.errors };
  }
  // MRP / selling-price policy (F-10) whenever the edit touches a price
  // field (mrp, sellingPrice, price, variants). "Touches" is the exact
  // diff above — a price field that is SENT and differs from what is
  // stored is an intentional edit and is validated strictly (mrp 0,
  // negative, null or non-numeric is refused; nothing is normalized). A
  // stock- or content-only edit that does not send changed price fields
  // (ProductForm omits a legacy product's untouched ones —
  // lib/products/sellerProductEdit.ts) is not forced to reprice first.
  if (pricePolicyFieldsChanged(changes)) {
    const pricing = validateSellerProductPricing(after, {
      checkLegacyPrice: Object.prototype.hasOwnProperty.call(changes, "price"),
    });
    if (!pricing.ok) {
      return { ok: false, status: 400, error: pricing.errors.join("\n"), errors: pricing.errors };
    }
  }
  // Keep the stored discount equal to what MRP and price actually support
  // (0 when there is no valid MRP or no genuine discount).
  const discount = deriveDiscountPercent(after.mrp, after.sellingPrice);
  if (existing.discount !== discount) changes.discount = discount;

  // RE-REVIEW through the existing moderation model: changing content an
  // admin approved on an approved (or pre-approval legacy) product returns
  // it to "pending" — hidden until approved again. So does an MRP change
  // (the discount claim). Selling-price/stock/tax edits do not. A
  // pending or rejected product keeps its state (a rejected one
  // is resubmitted explicitly: app/api/seller/product-status).
  const reReview = isApprovedForSale(existing)
    ? reReviewFieldsChanged(existing, { ...existing, ...changes })
    : [];
  return { ok: true, changes, reReview };
}

/** Writes a planned edit inside `tx` (the caller has read `ref` in `tx`). */
export function writeSellerProductEdit(
  tx: Transaction,
  db: Firestore,
  ref: DocumentReference,
  existing: Record<string, unknown>,
  plan: { changes: Record<string, unknown>; reReview: string[] }
): void {
  const { changes, reReview } = plan;
  const now = Timestamp.now();
  tx.update(ref, {
    ...changes,
    ...(reReview.length > 0
      ? {
          approvalStatus: "pending",
          approved: false,
          active: false,
          reReviewRequestedAt: now,
          reReviewFields: reReview,
        }
      : {}),
    updatedAt: now,
  });
  if (reReview.length > 0) {
    const title = typeof existing.title === "string" ? existing.title : "A product";
    tx.set(db.collection("notifications").doc(), {
      title: "Product edit needs review",
      message: `"${title}" was edited (${reReview.join(", ")}) and is waiting for review.`,
      role: "admin",
      type: "vendor",
      read: false,
      createdAt: now,
    });
  }
}
