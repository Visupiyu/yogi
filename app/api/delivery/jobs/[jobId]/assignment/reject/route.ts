import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  rejectRiderAssignment,
  AssignmentError,
} from "@/lib/deliveryEngine/assignment";

// POST /api/delivery/jobs/[jobId]/assignment/reject   { reason? }
//
// The assigned delivery person REJECTS a company assignment on the SAME Company
// Job (Rider Assignment Response). Person-only; only the currently-assigned
// rider, only a COMPANY job at AssignedToCompany whose pickup leg has not yet
// been picked up. Releases the rider: pickup leg Assigned/Started -> LegCreated,
// job AssignedToCompany -> AcceptedByCompany, company ownership KEPT, so the
// company can assign another rider. This is NOT RejectedByCompany, not a
// cancellation, not a delivery failure, and never a second job. Rejecting after
// pickup returns 409. Financially neutral.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-rider-reject", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person")
      return Response.json({ error: "Only the assigned delivery person can reject an assignment." }, { status: 403 });

    const { jobId } = await ctx.params;
    let body: { reason?: unknown } = {};
    try { body = await request.json(); } catch { body = {}; }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      rejectRiderAssignment(tx, db, {
        jobId,
        personId: actor.personId,
        actorUid: actor.uid,
        reason: reason || undefined,
      })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("rider reject failed:", error);
    return Response.json({ error: "Could not reject this assignment." }, { status: 500 });
  }
}
