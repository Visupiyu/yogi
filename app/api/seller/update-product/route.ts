import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { validateSellerProductMoney } from "@/lib/products/sellerProductValidation";
import {
  reReviewFieldsChanged,
  unknownSellerProductFields,
} from "@/lib/products/sellerProductFields";
import { isApprovedForSale } from "@/lib/products/visibility";
import {
  PRODUCT_CATEGORY_FIELDS,
  changedLockedCategoryFields,
  isCategoryLocked,
} from "@/lib/products/categoryLock";

// ---------------------------------------------------------------------------
// Server-authoritative product EDIT for sellers.
//
// ProductForm used to updateDoc() the product straight from the browser, and
// firestore.rules only checked `sellingPrice >= 0` and `stock >= 0` on that
// write — `price` (which the mobile checkout reads first), `variants[].price`,
// `variants[].stock` and `gstPercent` were not validated at all, and rules
// cannot loop over an array to validate each variant. firestore.rules now
// freezes those price/stock/tax fields on any direct seller write, so this
// route is the only way a seller can change them, and every change is
// validated here with the same rule create-product applies.
//
// Behaviour otherwise matches the old direct write: a partial update of the
// fields the form sent (nothing is deleted), by the product's owner only, and
// only while the seller account is Approved. The body may carry ONLY the
// seller product fields (lib/products/sellerProductFields.ts) — moderation
// flags, identity (vendorId, vendorName), the product number, server-owned
// counters and timestamps are refused, not trimmed.
//
// Editing what an admin approved (content, media, variant definitions — see
// REREVIEW_FIELDS) on an approved or legacy-live product sends it back to the
// existing "pending" review, hidden until an admin approves it again.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Never writable through this route. active/approved/featured are admin
// moderation; vendorId/productNumber/createdAt are identity; the counters
// accrue only through their own guarded paths; updatedAt is stamped here.
const SERVER_OWNED_FIELDS = new Set([
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

type Outcome =
  | { kind: "ok"; reReview: string[] }
  | { kind: "error"; status: number; error: string; errors?: string[] };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "update-product",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { productId?: unknown; product?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const productId = typeof body?.productId === "string" ? body.productId : "";
    if (!productId || productId.includes("/") || productId.length > 200) {
      return Response.json({ error: "Missing product id." }, { status: 400 });
    }

    if (!body.product || typeof body.product !== "object" || Array.isArray(body.product)) {
      return Response.json({ error: "Missing product data." }, { status: 400 });
    }

    const incoming = body.product as Record<string, unknown>;
    const unknownFields = unknownSellerProductFields(incoming);
    if (unknownFields.length > 0) {
      return Response.json(
        {
          error: `These product fields can't be changed: ${unknownFields.join(", ")}`,
          fields: unknownFields,
        },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // Only an admin-Approved seller may change their products — a Blocked,
    // Rejected or Pending account cannot, whatever its token. Read by the
    // verified uid, never from the request.
    const vendorSnap = await db
      .collection("vendors")
      .where("uid", "==", requester.uid)
      .limit(1)
      .get();
    if (vendorSnap.empty) {
      return Response.json({ error: "No seller account found for this login." }, { status: 403 });
    }
    if (vendorSnap.docs[0].data()?.status !== "Approved") {
      return Response.json(
        { error: "Your seller account is not approved to change products." },
        { status: 403 }
      );
    }
    const ref = db.collection("products").doc(productId);

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return { kind: "error", status: 404, error: "Product not found." };
      }

      const existing = snap.data() as Record<string, unknown>;

      // Owner only — identity from the verified token, never the body.
      if (existing.vendorId !== requester.uid) {
        return { kind: "error", status: 403, error: "You can only edit your own products." };
      }

      // Only fields the seller actually changed are written. A field whose
      // stored value is a Firestore Timestamp is server-owned (it cannot
      // survive the JSON round trip intact), so it is never written back.
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(incoming)) {
        if (SERVER_OWNED_FIELDS.has(key)) continue;
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
          kind: "error",
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

      // Validate the document as it will be AFTER this write.
      const validation = validateSellerProductMoney({ ...existing, ...changes });
      if (!validation.ok) {
        return {
          kind: "error",
          status: 400,
          error: validation.errors.join("\n"),
          errors: validation.errors,
        };
      }

      // RE-REVIEW through the existing moderation model: changing content an
      // admin approved on an approved (or pre-approval legacy) product returns
      // it to "pending" — hidden until approved again. Price/stock/tax edits
      // do not. A pending or rejected product keeps its state (a rejected one
      // is resubmitted explicitly: app/api/seller/product-status).
      const now = Timestamp.now();
      const reReview = isApprovedForSale(existing)
        ? reReviewFieldsChanged(existing, { ...existing, ...changes })
        : [];
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
      return { kind: "ok", reReview };
    });

    if (outcome.kind === "error") {
      return Response.json(
        { error: outcome.error, ...(outcome.errors ? { errors: outcome.errors } : {}) },
        { status: outcome.status }
      );
    }

    return Response.json({
      success: true,
      productId,
      reReview: outcome.reReview.length > 0,
      reReviewFields: outcome.reReview,
    });
  } catch (error) {
    console.error("update-product failed:", error);
    return Response.json(
      { error: "Could not update the product. Please try again." },
      { status: 500 }
    );
  }
}
