import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { validateSellerTaxProfile } from "@/lib/sellerTax";

// ---------------------------------------------------------------------------
// Server-authoritative save of a seller's Tax / GST profile.
//
// The profile and its verification status live under `taxProfile` /
// `taxVerificationStatus` on the vendor document and are writable ONLY through
// this route (firestore.rules pins both against client writes). That is what
// stops a seller setting their own status to VERIFIED or storing a GSTIN that
// failed validation.
//
// Any change resets verification to PENDING, so an edited GSTIN must be
// re-checked by an admin before the seller counts as verified. This is SELLER
// GST only — entirely separate from YOMICO commission (0%, no GST).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "tax-profile",
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const result = validateSellerTaxProfile(body);
    if (!result.ok) {
      return Response.json(
        { error: result.errors[0], errors: result.errors },
        { status: 400 }
      );
    }

    const db = getAdminDb();
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

    const vendorRef = vendorSnap.docs[0].ref;
    const existing = vendorSnap.docs[0].data() as {
      taxProfile?: { certificateStatus?: string };
    };

    // Preserve whatever certificate the seller already uploaded; a profile edit
    // doesn't discard it. Verification, however, always returns to PENDING.
    const certificateStatus =
      existing.taxProfile?.certificateStatus === "UPLOADED"
        ? "UPLOADED"
        : "NOT_UPLOADED";

    await vendorRef.update({
      taxProfile: {
        ...result.profile,
        certificateStatus,
      },
      taxVerificationStatus: "PENDING",
      taxProfileUpdatedAt: Timestamp.now(),
    });

    return Response.json({
      success: true,
      taxVerificationStatus: "PENDING",
      profile: result.profile,
    });
  } catch (error) {
    console.error("tax-profile save failed:", error);
    return Response.json(
      { error: "Could not save your tax profile. Please try again." },
      { status: 500 }
    );
  }
}
