import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  acceptCompanyHandoff,
  AssignmentError,
} from "@/lib/deliveryEngine/assignment";

// POST /api/delivery/company/jobs/[jobId]/accept
//
// A delivery company ACCEPTS a job handed to it (Phase 2A) BEFORE assigning one
// of its own people. Company-only; the job must belong to the caller's company
// and be OfferedToCompany. This advances the job to AcceptedByCompany — no leg,
// person, custody or stage change — so assignment can follow. Idempotent:
// accepting an already-accepted job succeeds as a no-op. Financially neutral.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-company-accept", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company")
      return Response.json({ error: "Only a delivery company can accept a job." }, { status: 403 });

    const { jobId } = await ctx.params;

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      acceptCompanyHandoff(tx, db, {
        jobId,
        companyId: actor.companyId,
        actorUid: actor.uid,
      })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("company accept failed:", error);
    return Response.json({ error: "Could not accept this job." }, { status: 500 });
  }
}
