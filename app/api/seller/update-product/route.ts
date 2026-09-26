import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { validateSellerProductMoney } from "@/lib/products/sellerProductValidation";

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
// fields the form sent (nothing is deleted), by the product's owner only.
// Moderation flags, identity, the product number, server-owned counters and
// timestamps are never taken from the request.
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
  | { kind: "ok" }
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
    const db = getAdminDb();
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

      tx.update(ref, { ...changes, updatedAt: Timestamp.now() });
      return { kind: "ok" };
    });

    if (outcome.kind === "error") {
      return Response.json(
        { error: outcome.error, ...(outcome.errors ? { errors: outcome.errors } : {}) },
        { status: outcome.status }
      );
    }

    return Response.json({ success: true, productId });
  } catch (error) {
    console.error("update-product failed:", error);
    return Response.json(
      { error: "Could not update the product. Please try again." },
      { status: 500 }
    );
  }
}
