import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { validateRejectionReason } from "@/lib/sellerKyc";
import { decideKyc } from "@/lib/sellerKycServer";

// ---------------------------------------------------------------------------
// ADMIN seller KYC decision.
//   POST /api/admin/kyc/decision  { vendorId, action: "APPROVE" | "REJECT", reason? }
//
// The only path to an Approved or Rejected KYC. Admin is decided from the
// verified token (lib/adminAccess.ts, same test as firestore.rules), never from
// the request. A rejection must carry a reason, which the seller then sees on
// /seller-kyc. Updates vendors + the vendors_public status mirror and writes an
// audit_logs entry in one transaction (lib/sellerKycServer.ts).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return bad("Please sign in.", 401);
    if (!requester.isAdmin) return bad("Not authorized.", 403);
    if (!(await isWithinRateLimit("admin-kyc-decision", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return bad("Too many requests. Please try again shortly.", 429);
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body.");
    }
    const vendorId = typeof body?.vendorId === "string" ? body.vendorId.trim() : "";
    const action = typeof body?.action === "string" ? body.action.trim().toUpperCase() : "";
    if (!vendorId || vendorId.length > 128 || vendorId.includes("/")) return bad("Missing vendor id.");
    if (action !== "APPROVE" && action !== "REJECT") return bad("Invalid action.");

    let reason: string | null = null;
    if (action === "REJECT") {
      const checked = validateRejectionReason(body.reason);
      if (!checked.ok) return bad(checked.error);
      reason = checked.reason;
    }

    const outcome = await decideKyc(getAdminDb(), {
      vendorId,
      action,
      reason,
      actor: { uid: requester.uid, email: requester.email },
    });
    switch (outcome.kind) {
      case "not-found":
        return bad("Vendor not found.", 404);
      case "already":
        return bad(`KYC is already ${outcome.kycStatus.toLowerCase()}.`, 409, { kycStatus: outcome.kycStatus });
      case "done":
        return Response.json({ ok: true, kycStatus: outcome.kycStatus, status: outcome.status, kycRejectionReason: reason });
    }
  } catch (error) {
    console.error("Admin KYC decision failed:", error instanceof Error ? error.name : "unknown error");
    return bad("Could not update the KYC status.", 500);
  }
}
