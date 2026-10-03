import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminBucket, getAdminDb } from "@/lib/firebaseAdmin";
import { validateResubmission } from "@/lib/sellerKyc";
import { resubmitKyc, sellerKycView } from "@/lib/sellerKycServer";
import { findSellerVendor } from "@/lib/sellerBusinessServer";

// ---------------------------------------------------------------------------
// The signed-in seller's OWN KYC status, and resubmission after a rejection.
//   GET  /api/seller/kyc   -> status, rejection reason, current values
//   POST /api/seller/kyc   { values, documents } -> back to Pending review
//
// The seller is the verified token; the record is found by that uid only. A
// resubmission is accepted only from Rejected, never approves anything, and
// can only point the record at the seller's own new uploads in
// vendor-kyc/{uid}/ (checked to exist). Admin approval stays the only way to
// Approved (app/api/admin/kyc/decision).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return bad("Please sign in.", 401);
    const lookup = await findSellerVendor(getAdminDb(), requester.uid);
    if (lookup.kind === "none") return bad("Seller account not found.", 404);
    if (lookup.kind === "duplicate") return bad("Your seller account needs attention. Please contact support.", 409);
    return Response.json(sellerKycView(lookup.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Seller KYC status failed:", error instanceof Error ? error.name : "unknown error");
    return bad("Could not load your KYC status.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return bad("Please sign in.", 401);
    if (!(await isWithinRateLimit("seller-kyc-resubmit", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return bad("Too many requests. Please try again shortly.", 429);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body.");
    }
    const checked = validateResubmission(requester.uid, body);
    if (!checked.ok) return bad(checked.errors[0], 400, { errors: checked.errors });

    const outcome = await resubmitKyc(getAdminDb(), {
      actor: { uid: requester.uid, email: requester.email },
      data: checked.data,
      fileExists: async (path) => (await getAdminBucket().file(path).exists())[0],
    });
    switch (outcome.kind) {
      case "no-vendor":
        return bad("Seller account not found.", 404);
      case "duplicate":
        return bad("Your seller account needs attention. Please contact support.", 409);
      case "blocked":
        return bad("Your seller account is blocked. Please contact support.", 403);
      case "not-rejected":
        return bad(
          outcome.kycStatus === "Approved" ? "Your KYC is already approved." : "Your KYC is already under review.",
          409,
          { kycStatus: outcome.kycStatus }
        );
      case "nothing-changed":
        return bad("Correct the details or upload a new document before resubmitting.");
      case "missing-document":
        return bad(`The ${outcome.document} document upload was not found. Please upload it again.`);
      case "done":
        return Response.json({ ok: true, kycStatus: "Pending" });
    }
  } catch (error) {
    console.error("Seller KYC resubmission failed:", error instanceof Error ? error.name : "unknown error");
    return bad("Could not resubmit your KYC. Please try again.", 500);
  }
}
