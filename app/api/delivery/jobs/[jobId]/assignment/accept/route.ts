import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  acceptRiderAssignment,
  AssignmentError,
} from "@/lib/deliveryEngine/assignment";

// POST /api/delivery/jobs/[jobId]/assignment/accept
//
// The assigned delivery person ACCEPTS a company assignment on the SAME Company
// Job (Rider Assignment Response). Person-only; only the currently-assigned
// rider, only a COMPANY job at AssignedToCompany whose pickup leg is "Assigned".
// Advances the pickup leg Assigned -> Started — job.status, assignment and
// company ownership are all unchanged; PICKUP still works from "Started".
// Idempotent (re-accepting, or accepting after pickup, is a safe no-op).
// Financially neutral; never creates a second job.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-rider-accept", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person")
      return Response.json({ error: "Only the assigned delivery person can accept an assignment." }, { status: 403 });

    const { jobId } = await ctx.params;

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      acceptRiderAssignment(tx, db, {
        jobId,
        personId: actor.personId,
        actorUid: actor.uid,
      })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("rider accept failed:", error);
    return Response.json({ error: "Could not accept this assignment." }, { status: 500 });
  }
}
