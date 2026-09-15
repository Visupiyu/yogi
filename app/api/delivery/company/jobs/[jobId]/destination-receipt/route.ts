import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyDestinationHubReceipt } from "@/lib/deliveryEngine/destinationHub";
import { AssignmentError } from "@/lib/deliveryEngine/assignment";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/destination-receipt
//
// COMPANY_HUB journey — company transport arrives at the destination hub; an
// authenticated Destination Hub Person confirms receipt (four-actor model,
// Phase 2). Custody was already at the COMPANY level in transit (no person)
// and simply becomes parked at the destination hub — the receiving Hub Person
// is recorded as the job's responsible physical actor, never as a rider.
//
// PHASE 2 CHANGE: this was previously a company DISPATCHER action. The
// dispatcher is never physically at the hub, so that was never a real
// physical receipt. The actor (uid + companyId + personId + hubId) is now
// resolved SERVER-SIDE from the caller's OWN deliveryPersons doc — the caller
// must be an ACTIVE COMPANY person with role HUB_PERSON and a hubId. The
// request body carries nothing: the destination hub is simply wherever THIS
// authenticated person is stationed, never a client-supplied hubId.
// The whole leg advancement + custody move + event is one atomic transaction.
// This never touches the YOMICO DIRECT path and performs NO final-mile assignment.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-destination-receipt", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Must be an ACTIVE COMPANY delivery person stationed as HUB_PERSON at a
    // specific hub. providerType/role/hubId are all read from the caller's OWN
    // resolved record — never trusted from the request body. A company OWNER
    // (role "company") is rejected here — ownership alone is not a physical
    // receipt.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (
      actor.role !== "person" ||
      actor.providerType !== "COMPANY" ||
      !actor.companyId ||
      actor.person.role !== "HUB_PERSON" ||
      !actor.person.hubId
    ) {
      return Response.json(
        { error: "Only an authenticated Destination Hub Person can confirm receipt at a hub." },
        { status: 403 }
      );
    }

    // Capture into locals so the narrowed (non-null) identity survives the
    // transaction closure.
    const receiptActor = {
      uid: actor.uid,
      companyId: actor.companyId,
      personId: actor.personId,
      hubId: actor.person.hubId,
    };

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyDestinationHubReceipt(tx, db, { jobId, actor: receiptActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError || error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("destination hub receipt failed:", error);
    return Response.json({ error: "Could not receive this shipment at the destination hub." }, { status: 500 });
  }
}
