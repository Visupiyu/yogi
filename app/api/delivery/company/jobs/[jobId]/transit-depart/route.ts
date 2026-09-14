import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyTransitDeparture } from "@/lib/deliveryEngine/transit";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/transit-depart   { destinationHubId }
//
// COMPANY_HUB journey — origin hub → COMPANY-MANAGED transit. The company
// DISPATCHER (role "company") sends the shipment from its origin hub into the
// company's OWN internal bulk / inter-city transport. This is a COMPANY-MANAGED
// movement, NOT a rider task: custody stays at the company level (no person is
// made responsible or given personal custody). The actor (uid + companyId) is
// resolved SERVER-SIDE from the verified token — companyId/providerType/custody/
// status/leg ids are never trusted from the client.
//
// PHASE 5: the ONLY accepted body field is `destinationHubId` — the dispatcher's
// explicit choice of which of the company's OWN hubs this shipment is headed
// to. It is REQUIRED (never auto-derived from hub count, address text, or
// geocoding) and fully validated server-side in applyTransitDeparture (exists,
// same company, Active, not the origin hub). The whole leg advancement +
// custody move + event + destinationHubId persistence is one atomic
// transaction. This never touches the YOMICO DIRECT path and never turns
// company transit into a YOMICO rider delivery task.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-transit-depart", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Company dispatcher only. Company transit is company-managed, so this is a
    // role "company" action (a delivery person cannot dispatch company transport).
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company" || !actor.companyId)
      return Response.json(
        { error: "Only the delivery company can dispatch this shipment into company transit." },
        { status: 403 }
      );

    // Capture narrowed (non-null) identity for use inside the transaction closure.
    const transitActor = { uid: actor.uid, companyId: actor.companyId };

    // The ONLY accepted body field is the dispatcher's chosen destination hub.
    // Any other field (personId/companyId/providerType/custody/status/leg ids)
    // is ignored.
    let destinationHubId = "";
    try {
      const body = (await request.json()) as unknown;
      if (body && typeof body === "object" && typeof (body as { destinationHubId?: unknown }).destinationHubId === "string") {
        destinationHubId = (body as { destinationHubId: string }).destinationHubId;
      }
    } catch {
      // No/invalid JSON body — destinationHubId stays empty; applyTransitDeparture
      // rejects a missing destination with a 400 (it is never derived).
    }

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyTransitDeparture(tx, db, { jobId, destinationHubId, actor: transitActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("transit departure failed:", error);
    return Response.json({ error: "Could not dispatch this shipment into company transit." }, { status: 500 });
  }
}
