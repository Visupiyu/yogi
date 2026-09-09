import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyDestinationHubReceipt } from "@/lib/deliveryEngine/destinationHub";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/destination-receipt
//
// COMPANY_HUB journey — COMPANY-MANAGED transit → destination hub. The company
// DISPATCHER (role "company") receives the shipment — arriving via the company's
// OWN internal transport — into one of its destination hubs. This is a COMPANY-
// MANAGED receipt, NOT a rider task: custody was already at the company level in
// transit (no person) and simply becomes parked at the destination hub. The actor
// (uid + companyId) is resolved SERVER-SIDE from the verified token — companyId/
// providerType/custody/status/leg ids are NEVER trusted from the client.
//
// The ONLY client-supplied value is `hubId`: the REQUESTED destination hub.
// There is no persisted destination-routing source in the model, so the hub is
// never auto-selected/guessed; it is fully validated server-side in
// applyDestinationHubReceipt (exists, same company, Active, not the origin hub).
// The whole leg advancement + custody move + event is one atomic transaction.
// This never touches the YOMICO DIRECT path and performs NO final-mile assignment.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-destination-receipt", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Company dispatcher only. Company transit / hub receipt is company-managed,
    // so this is a role "company" action (a delivery person cannot perform it).
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company" || !actor.companyId)
      return Response.json(
        { error: "Only the delivery company can receive this shipment at a destination hub." },
        { status: 403 }
      );

    // Capture narrowed (non-null) identity for use inside the transaction closure.
    const receiptActor = { uid: actor.uid, companyId: actor.companyId };

    // The ONLY accepted body field is the requested destination hub id. Any other
    // field (personId/companyId/providerType/custody/status/leg ids) is ignored.
    let hubId = "";
    try {
      const body = (await request.json()) as unknown;
      if (body && typeof body === "object" && typeof (body as { hubId?: unknown }).hubId === "string") {
        hubId = (body as { hubId: string }).hubId;
      }
    } catch {
      // No/invalid JSON body — hubId stays empty; applyDestinationHubReceipt
      // rejects a missing hub with a 400 (the hub is never derived).
    }

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyDestinationHubReceipt(tx, db, { jobId, hubId, actor: receiptActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("destination hub receipt failed:", error);
    return Response.json({ error: "Could not receive this shipment at the destination hub." }, { status: 500 });
  }
}
