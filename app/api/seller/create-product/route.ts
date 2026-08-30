import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { mintSequential } from "@/lib/humanIds";
import { canSellerList, sellerListingBlockReason } from "@/lib/sellerTax";

// ---------------------------------------------------------------------------
// Server-authoritative product creation.
//
// Product creation moved here from the browser (app/seller/components/
// ProductForm.tsx used to addDoc directly) so the human-readable productNumber
// (PCT000001) is minted SERVER-SIDE from an atomic counter, in the same
// transaction that writes the product. firestore.rules now denies client
// `create` on products, so this route is the only creation path.
//
// Identity is taken from the verified token — vendorId is overwritten, never
// trusted from the body — and any client-supplied number/id is dropped. The
// product's descriptive fields are persisted as the form built them (the same
// values the client wrote before this route existed); this change adds the
// server-minted number and server-owned identity, it does not re-open product
// validation.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "create-product",
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

    let body: { product?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!body.product || typeof body.product !== "object") {
      return Response.json({ error: "Missing product data." }, { status: 400 });
    }

    // Never trust a client-supplied number, id, vendorId, or moderation flags.
    const {
      productNumber: _n,
      id: _id,
      vendorId: _v,
      approved: _a,
      featured: _f,
      createdAt: _c,
      ...productFields
    } = body.product as Record<string, unknown>;
    void _n;
    void _id;
    void _v;
    void _a;
    void _f;
    void _c;

    const db = getAdminDb();

    // GST listing eligibility — MANDATORY server-side gate (strict policy).
    // A seller may create a product only when their GST profile makes them
    // eligible to list (Registered/Composition + valid + admin-VERIFIED GSTIN).
    // Read from the vendor doc; the client cannot influence this.
    const vendorSnap = await db
      .collection("vendors")
      .where("uid", "==", requester.uid)
      .limit(1)
      .get();

    if (vendorSnap.empty) {
      return Response.json(
        { error: "No seller account found for this login." },
        { status: 403 }
      );
    }

    const vendor = vendorSnap.docs[0].data() as {
      taxProfile?: { gstStatus?: string; gstin?: string };
      taxVerificationStatus?: string;
    };
    const listingProfile = {
      gstStatus: vendor.taxProfile?.gstStatus,
      gstin: vendor.taxProfile?.gstin,
      taxVerificationStatus: vendor.taxVerificationStatus,
    };

    if (!canSellerList(listingProfile)) {
      return Response.json(
        {
          error:
            sellerListingBlockReason(listingProfile) ||
            "Your GST profile does not allow listing yet.",
          code: "GST_LISTING_BLOCKED",
        },
        { status: 403 }
      );
    }

    const ref = db.collection("products").doc();

    const productNumber = await db.runTransaction(async (tx) => {
      const number = await mintSequential(tx, db, "product");
      tx.set(ref, {
        ...productFields,
        vendorId: requester.uid, // server-authoritative identity
        productNumber: number,
        createdAt: Timestamp.now(),
      });
      return number;
    });

    return Response.json({
      success: true,
      productId: ref.id,
      productNumber,
    });
  } catch (error) {
    console.error("create-product failed:", error);
    return Response.json(
      { error: "Could not create the product. Please try again." },
      { status: 500 }
    );
  }
}
