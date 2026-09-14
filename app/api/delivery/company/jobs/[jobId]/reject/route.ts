import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  rejectCompanyHandoff,
  AssignmentError,
} from "@/lib/deliveryEngine/assignment";

// POST /api/delivery/company/jobs/[jobId]/reject   { reason? }
//
// A delivery company declines a job handed to it (before or after assigning its
// own person). Company-only; the job must belong to the caller's company. The
// job's provider is removed and it returns to RejectedByCompany for YOMICO
// Admin to re-decide; any assigned company person is freed. Financially neutral.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-company-reject", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company")
      return Response.json({ error: "Only a delivery company can reject a job." }, { status: 403 });

    const { jobId } = await ctx.params;
    let body: { reason?: unknown } = {};
    try { body = await request.json(); } catch { body = {}; }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      rejectCompanyHandoff(tx, db, {
        jobId,
        companyId: actor.companyId,
        actorUid: actor.uid,
        reason: reason || undefined,
      })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("company reject failed:", error);
    return Response.json({ error: "Could not reject this job." }, { status: 500 });
  }
}
