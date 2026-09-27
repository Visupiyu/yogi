import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { mintSequential } from "@/lib/humanIds";
import { canSellerList, sellerListingBlockReason } from "@/lib/sellerTax";
import { validateSellerProductMoney } from "@/lib/products/sellerProductValidation";
import { NEW_PRODUCT_MODERATION } from "@/lib/products/visibility";
import { unknownSellerProductFields } from "@/lib/products/sellerProductFields";

// ---------------------------------------------------------------------------
// Server-authoritative product creation.
//
// Product creation moved here from the browser (app/seller/components/
// ProductForm.tsx used to addDoc directly) so the human-readable productNumber
// (PCT000001) is minted SERVER-SIDE from an atomic counter, in the same
// transaction that writes the product. firestore.rules now denies client
// `create` on products, so this route is the only creation path.
//
// Identity is taken from the verified token — vendorId is set here, and the
// storefront vendorName comes from the seller's own vendor record — and the
// body may carry ONLY the seller product fields (lib/products/
// sellerProductFields.ts): anything else is refused, not trimmed. The
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

    if (!body.product || typeof body.product !== "object" || Array.isArray(body.product)) {
      return Response.json({ error: "Missing product data." }, { status: 400 });
    }

    // STRICT allow-list. Identity (vendorId, vendorName), the product number,
    // moderation and lifecycle flags, and the server-owned counters (sales,
    // rating, reviewCount, views, wishlistCount) and timestamps are never
    // accepted from the browser: a request carrying any key outside
    // lib/products/sellerProductFields.ts is refused, so a forged field can
    // never be stored.
    const productFields = body.product as Record<string, unknown>;
    const unknownFields = unknownSellerProductFields(productFields);
    if (unknownFields.length > 0) {
      return Response.json(
        {
          error: `These product fields can't be set: ${unknownFields.join(", ")}`,
          fields: unknownFields,
        },
        { status: 400 }
      );
    }

    // Price / stock / GST fields are validated here, server-side — this route
    // writes with the Admin SDK, so firestore.rules' product checks never run
    // on it. Invalid values are refused, never coerced (a negative or zero
    // price, a fractional stock, a non-slab GST rate, a malformed variant).
    const moneyCheck = validateSellerProductMoney(productFields);
    if (!moneyCheck.ok) {
      return Response.json(
        { error: moneyCheck.errors.join("\n"), errors: moneyCheck.errors },
        { status: 400 }
      );
    }

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
      status?: string;
      businessName?: string;
      fullName?: string;
      taxProfile?: { gstStatus?: string; gstin?: string };
      taxVerificationStatus?: string;
    };

    // Seller-account status is enforced HERE, server-side — the seller
    // dashboard's own status gate (app/seller/layout.js) is client-only and a
    // valid token can reach this route directly. Only an admin-Approved vendor
    // may list; a Pending, Rejected, Blocked, or status-less account is refused
    // even if it still carries a previously admin-VERIFIED GST profile. The GST
    // eligibility check below is kept unchanged and applies on top of this.
    if (vendor.status !== "Approved") {
      return Response.json(
        { error: "Your seller account is not approved for listing products." },
        { status: 403 }
      );
    }

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
        // Every new product starts pending admin review and hidden:
        // approvalStatus "pending", approved/active/featured false. Only
        // app/api/admin/products/[id]/moderation can publish it. This also
        // means deleting and re-creating a blocked product never makes it
        // live again.
        ...NEW_PRODUCT_MODERATION,
        vendorId: requester.uid, // server-authoritative identity
        // Shown on the storefront and copied onto order lines: always the
        // seller's own business name from their vendor record, never the body.
        vendorName: vendor.businessName || vendor.fullName || "",
        // Server-owned counters start at zero.
        sales: 0,
        rating: 0,
        reviewCount: 0,
        views: 0,
        wishlistCount: 0,
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
