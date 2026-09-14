import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyFinalMileAssignment } from "@/lib/deliveryEngine/finalMileAssign";
import { AssignmentError } from "@/lib/deliveryEngine/assignment";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/final-mile-assign   { personId }
//
// COMPANY_HUB journey — destination hub → final-mile person. The authenticated
// company DISPATCHER (role "company" — the company owner, the SAME server-
// authoritative authority the existing assign endpoint trusts to select the
// company's own people) assigns one of its OWN eligible delivery people to carry
// the parcel from the destination hub to the customer, handing custody from the
// hub to that person. This is ASSIGNMENT + a hub→person custody handover, NOT
// departure — it never sets OutForDelivery and never completes delivery.
//
// Two parties, NEITHER client-controlled: the dispatcher is resolved SERVER-SIDE
// from the verified token (its companyId is never trusted from the body); the
// final-mile person is the ONLY accepted body field (personId) and is validated
// against the dispatcher's OWN company roster + eligibility (Active + Available)
// inside the transaction. providerType/companyId/custody/status/leg ids are never
// trusted from the client. A role "person" caller (an ordinary company delivery
// person) is rejected here — ownership of a token is not dispatch authority. The
// whole assignment + custody move + leg + event + availability change is one
// atomic transaction. This never touches the YOMICO DIRECT path.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-final-mile-assign", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Company dispatcher only. A delivery PERSON (role "person") is rejected — the
    // final-mile person is SELECTED by the dispatcher, never self-claimed here.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company" || !actor.companyId)
      return Response.json(
        { error: "Only the delivery company can assign a final-mile delivery person." },
        { status: 403 }
      );

    // Capture narrowed (non-null) identity for use inside the transaction closure.
    const dispatchActor = { uid: actor.uid, companyId: actor.companyId };

    // The ONLY accepted body field is the final-mile person id (selected from the
    // dispatcher's own roster). It is fully validated server-side.
    let body: { personId?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) return Response.json({ error: "Missing personId." }, { status: 400 });

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyFinalMileAssignment(tx, db, { jobId, personId, actor: dispatchActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError || error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("final-mile assignment failed:", error);
    return Response.json({ error: "Could not assign a final-mile delivery person." }, { status: 500 });
  }
}
