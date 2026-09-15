import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyDestinationHandoverConfirm } from "@/lib/deliveryEngine/destinationHandover";
import { AssignmentError } from "@/lib/deliveryEngine/assignment";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/destination-handover/confirm
//
// COMPANY_HUB journey — destination-hub handover, STEP 2 of 2 (four-actor
// model, Phase 2). Rider 2 — the SPECIFIC person the dispatcher already
// selected via final-mile-assign — declares "I received this shipment." THIS
// is what moves custody onto Rider 2 and ends the Destination Hub Person's
// responsibility for this job. The Company Job stays InProgress and remains
// visible in the Company Console.
//
// Actor identity (uid + companyId + personId) is resolved SERVER-SIDE from the
// verified token. Authorization is that this EXACT person is the leg's own
// assignedPersonId (the dispatcher's selection) — the sole source of truth; no
// client-supplied "toPersonId" is ever trusted. A HUB_PERSON is rejected here
// (a hub person can never also act as Rider 2). The request body carries
// nothing. The leg update + custody move + event is one atomic transaction.
// This never touches the YOMICO DIRECT path.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-destination-handover-confirm", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Must be an ACTIVE COMPANY delivery person who is NOT a hub person. The
    // deeper authorization (must be THIS exact leg's assignedPersonId) is
    // re-validated inside the transaction.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person" || actor.providerType !== "COMPANY" || !actor.companyId) {
      return Response.json(
        { error: "Only the final-mile rider selected for this shipment can confirm receipt." },
        { status: 403 }
      );
    }
    if (actor.person.role === "HUB_PERSON") {
      return Response.json({ error: "A hub person cannot act as the final-mile rider." }, { status: 403 });
    }

    const confirmActor = { uid: actor.uid, companyId: actor.companyId, personId: actor.personId };

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyDestinationHandoverConfirm(tx, db, { jobId, actor: confirmActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError || error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("destination handover confirm failed:", error);
    return Response.json({ error: "Could not confirm receipt of this shipment." }, { status: 500 });
  }
}
