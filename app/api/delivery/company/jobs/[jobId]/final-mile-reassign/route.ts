import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyFinalMileReassignment } from "@/lib/deliveryEngine/finalMileAssign";
import { AssignmentError } from "@/lib/deliveryEngine/assignment";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/final-mile-reassign   { personId }
//
// COMPANY_HUB journey — corrects a mistaken final-mile (Rider 2) selection
// BEFORE the physical destination-hub handover has started. This is NOT the
// handover itself: custody stays exactly where the destination-hub receipt
// left it (parked at the hub), and responsibleParty stays the destination-hub/
// company side. applyFinalMileReassignment re-validates, inside the
// transaction, that no destinationHandover record exists yet (neither
// Initiated nor Confirmed) and that custody has not moved to any person —
// once either is true, this is rejected (409): only the destination-hub ->
// Rider 2 handover flow (destinationHandover.ts) may proceed from there.
//
// Same authority model as final-mile-assign: only the company DISPATCHER
// (role "company") may call this — a delivery person (including the
// currently-assigned Rider 2) is rejected here. The replacement person is the
// ONLY accepted body field and is fully validated server-side (same company,
// never a HUB_PERSON, Active + Available) inside the transaction.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-final-mile-reassign", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Company dispatcher only. A delivery PERSON (role "person") is rejected —
    // the final-mile person is SELECTED by the dispatcher, never self-claimed.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company" || !actor.companyId)
      return Response.json(
        { error: "Only the delivery company can reassign the final-mile delivery person." },
        { status: 403 }
      );

    // Capture narrowed (non-null) identity for use inside the transaction closure.
    const dispatchActor = { uid: actor.uid, companyId: actor.companyId };

    // The ONLY accepted body field is the replacement final-mile person id.
    let body: { personId?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) return Response.json({ error: "Missing personId." }, { status: 400 });

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyFinalMileReassignment(tx, db, { jobId, personId, actor: dispatchActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError || error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("final-mile reassignment failed:", error);
    return Response.json({ error: "Could not reassign the final-mile delivery person." }, { status: 500 });
  }
}
