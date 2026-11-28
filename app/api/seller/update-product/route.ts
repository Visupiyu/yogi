import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { unknownSellerProductFields } from "@/lib/products/sellerProductFields";
import { planSellerProductEdit, writeSellerProductEdit } from "@/lib/products/sellerProductUpdate";

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

      // The edit rules (changed fields only, category lock, money and pricing
      // policy, derived discount, re-review) — lib/products/sellerProductUpdate,
      // shared with Bulk Edit via Excel.
      const plan = planSellerProductEdit(existing, incoming);
      if (!plan.ok) {
        return { kind: "error", status: plan.status, error: plan.error, ...(plan.errors ? { errors: plan.errors } : {}) };
      }
      writeSellerProductEdit(tx, db, ref, existing, plan);
      return { kind: "ok", reReview: plan.reReview };
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
