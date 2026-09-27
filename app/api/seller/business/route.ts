import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { buildSellerBusinessView } from "@/lib/sellerBusiness";
import {
  CHANGE_REQUESTS,
  findSellerVendor,
  newestFirst,
  sellerRequestView,
} from "@/lib/sellerBusinessServer";

// ---------------------------------------------------------------------------
// GET /api/seller/business — the signed-in seller's own business profile.
//
// Read-only. Identity is the verified token; no seller id is taken from the
// request, so one seller can never read another's details. Sensitive values
// (bank account, PAN, Aadhaar) leave the server masked, and KYC documents are
// reported as present/absent only — never as a URL. The seller's recent
// business-change requests come back with the account number masked too.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (
      !(await isWithinRateLimit("seller-business", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))
    ) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const db = getAdminDb();
    const vendor = await findSellerVendor(db, requester.uid);
    if (vendor.kind === "none") {
      return Response.json({ error: "No seller account found for this login." }, { status: 403 });
    }
    if (vendor.kind === "duplicate") {
      return Response.json(
        { error: "More than one seller record exists for this login. Please contact support." },
        { status: 409 }
      );
    }

    const requestSnap = await db
      .collection(CHANGE_REQUESTS)
      .where("vendorUid", "==", requester.uid)
      .get();
    const requests = [...requestSnap.docs].sort(newestFirst).slice(0, 20).map(sellerRequestView);

    return Response.json({
      profile: buildSellerBusinessView(vendor.data, { emailVerified: requester.emailVerified }),
      requests,
    });
  } catch (error) {
    console.error("seller-business failed:", error);
    return Response.json({ error: "Could not load your business profile." }, { status: 500 });
  }
}
