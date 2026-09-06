import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  assignCompanyPerson,
  AssignmentError,
} from "@/lib/deliveryEngine/assignment";

// POST /api/delivery/company/jobs/[jobId]/assign   { personId }
//
// A delivery company assigns (or reassigns) one of its OWN Active+Available
// people to a job handed to it. Company-only; the job must belong to the
// caller's company and the person must belong to the caller's company (both
// enforced server-side, never from the body). Idempotent.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-company-assign", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company")
      return Response.json({ error: "Only a delivery company can assign its people." }, { status: 403 });

    const { jobId } = await ctx.params;
    let body: { personId?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) return Response.json({ error: "Missing personId." }, { status: 400 });

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      assignCompanyPerson(tx, db, {
        jobId,
        personId,
        companyId: actor.companyId,
        actorUid: actor.uid,
      })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("company assign failed:", error);
    return Response.json({ error: "Could not assign this delivery person." }, { status: 500 });
  }
}
