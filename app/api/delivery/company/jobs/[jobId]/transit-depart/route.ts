import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyTransitDeparture } from "@/lib/deliveryEngine/transit";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/transit-depart
//
// COMPANY_HUB journey — origin hub → transit / line-haul. A COMPANY line-haul
// delivery PERSON departs the origin hub carrying the parcel into transit. This
// is a PHYSICAL custody action (custody moves from the hub to the acting person),
// company-scoped and server-authoritative. The request body carries NOTHING:
// the actor (uid + companyId + personId) is resolved SERVER-SIDE from the
// verified token — personId/companyId/providerType/custody/status/leg ids are
// never trusted from the client. resolveDeliveryActor returns role "person" only
// for an ACTIVE person of an ACTIVE company. The whole leg advancement + custody
// move + event is one atomic transaction. This never touches the YOMICO DIRECT
// path and does not determine/fabricate a destination hub.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-transit-depart", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Active COMPANY delivery person only (owner resolves to role "company" and
    // is rejected here — ownership alone never authorizes a custody transition).
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person" || actor.providerType !== "COMPANY" || !actor.companyId)
      return Response.json(
        { error: "Only a company delivery person can take this shipment into transit." },
        { status: 403 }
      );

    // Capture narrowed (non-null) identity for use inside the transaction closure.
    const transitActor = { uid: actor.uid, companyId: actor.companyId, personId: actor.personId };

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyTransitDeparture(tx, db, { jobId, actor: transitActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("transit departure failed:", error);
    return Response.json({ error: "Could not take this shipment into transit." }, { status: 500 });
  }
}
