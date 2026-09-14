import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyOriginHubHandoverInitiate } from "@/lib/deliveryEngine/hubIntake";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/hub-intake   { hubId? }
//
// COMPANY_HUB journey — origin-hub handover, STEP 1 of 2 (four-actor model).
// The COMPANY DELIVERY PERSON who currently HOLDS the shipment (Rider 1)
// declares "I am handing this shipment to the Origin Hub." This does NOT move
// custody — Rider 1 still physically holds the parcel until an authenticated
// Origin Hub Person confirms receipt via the sibling `hub-intake/confirm`
// endpoint. This is a PHYSICAL CUSTODY action, not an ownership action: the
// company owner may NOT perform it merely by owning the job — only the
// custody-holding rider can. No new hub-operator role is introduced by this step.
//
// Actor identity (uid + companyId + personId) is resolved SERVER-SIDE from the
// verified token via resolveDeliveryActor — which returns role "person" only for
// an ACTIVE person of an ACTIVE company. companyId/providerType/personId are
// never trusted from the request. hubId is optional: if omitted the server uses
// the company's single active hub; if given, hub.companyId must equal the
// person's company. The leg update + event is one atomic transaction. This
// never touches the YOMICO DIRECT path.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-hub-intake", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Must be an ACTIVE COMPANY delivery person (resolver guarantees Active
    // person + Active company). A company OWNER resolves to role "company" and is
    // rejected here — ownership alone never authorizes a handover. This step
    // does not check role RIDER vs HUB_PERSON: the custody-holder precondition
    // inside applyOriginHubHandoverInitiate (leg.custody.personId === actor)
    // already guarantees only whoever physically holds the parcel can act.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person" || actor.providerType !== "COMPANY" || !actor.companyId)
      return Response.json(
        { error: "Only the company delivery person holding this shipment can hand it to a hub." },
        { status: 403 }
      );

    // Capture into locals so the narrowed (non-null) companyId survives the
    // transaction closure.
    const initiateActor = { uid: actor.uid, companyId: actor.companyId, personId: actor.personId };

    const { jobId } = await ctx.params;
    let body: { hubId?: unknown } = {};
    try { body = await request.json(); } catch { body = {}; }
    const hubId = typeof body.hubId === "string" ? body.hubId.trim() : null;

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyOriginHubHandoverInitiate(tx, db, { jobId, hubId, actor: initiateActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("origin hub handover initiate failed:", error);
    return Response.json({ error: "Could not hand this shipment to the hub." }, { status: 500 });
  }
}
