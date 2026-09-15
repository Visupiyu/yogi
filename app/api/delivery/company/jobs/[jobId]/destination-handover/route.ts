import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyDestinationHandoverInitiate } from "@/lib/deliveryEngine/destinationHandover";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/destination-handover
//
// COMPANY_HUB journey — destination-hub handover, STEP 1 of 2 (four-actor
// model, Phase 2). The Destination Hub Person currently RESPONSIBLE for this
// job (job.responsibleParty, set by the destination-hub receipt) declares
// "I am handing this shipment to Rider 2." This does NOT move custody — the
// parcel stays parked at the hub until Rider 2 confirms via the sibling
// `destination-handover/confirm` endpoint.
//
// Actor identity (uid + companyId + personId + hubId) is resolved SERVER-SIDE
// from the caller's OWN deliveryPersons doc — never the request body. The
// request body carries nothing: Rider 2 was already selected by the dispatcher
// (final-mile-assign) and is read from the leg, never supplied here. The leg
// update + event is one atomic transaction. This never touches the YOMICO
// DIRECT path.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-destination-handover-initiate", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Must be an ACTIVE COMPANY delivery person stationed as HUB_PERSON at a
    // specific hub. providerType/role/hubId are all read from the caller's OWN
    // resolved record — never trusted from the request body.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (
      actor.role !== "person" ||
      actor.providerType !== "COMPANY" ||
      !actor.companyId ||
      actor.person.role !== "HUB_PERSON" ||
      !actor.person.hubId
    ) {
      return Response.json(
        { error: "Only the Destination Hub Person responsible for this shipment can hand it to a rider." },
        { status: 403 }
      );
    }

    const initiateActor = {
      uid: actor.uid,
      companyId: actor.companyId,
      personId: actor.personId,
      hubId: actor.person.hubId,
    };

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyDestinationHandoverInitiate(tx, db, { jobId, actor: initiateActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("destination handover initiate failed:", error);
    return Response.json({ error: "Could not hand this shipment to the final-mile rider." }, { status: 500 });
  }
}
