import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyOriginHubReceiptConfirm } from "@/lib/deliveryEngine/hubIntake";
import { AssignmentError } from "@/lib/deliveryEngine/assignment";
import { ExecutionError } from "@/lib/deliveryEngine/execution";

// POST /api/delivery/company/jobs/[jobId]/hub-intake/confirm
//
// COMPANY_HUB journey — origin-hub handover, STEP 2 of 2 (four-actor model).
// The authenticated Origin Hub Person — a DIFFERENT physical actor from
// Rider 1 — declares "I received this shipment." THIS is what moves custody
// to COMPANY at the hub, completes Rider 1's task (Busy -> Available), clears
// Rider 1 as the job's active assignment, and creates the next (HubIntake)
// leg. The Company Job stays InProgress and remains visible in the Company
// Console — it is never Delivered and never disappears here.
//
// Actor identity (uid + companyId + personId + hubId) is resolved SERVER-SIDE
// from the verified token: hubId comes from the caller's OWN deliveryPersons
// doc (via resolveDeliveryActor), never the request body — a delivery person
// cannot claim to be stationed at a hub they are not assigned to, and an
// arbitrary company rider can never confirm a receipt merely by holding a
// valid token (role must be HUB_PERSON). The request body carries nothing.
// The leg completion + new leg + custody move + event + Rider-1 release is
// one atomic transaction. This never touches the YOMICO DIRECT path.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-hub-receipt-confirm", requester.uid, 60, 10 * 60 * 1000)))
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
        { error: "Only an Origin Hub Person can confirm receipt of this shipment." },
        { status: 403 }
      );
    }

    // Capture into locals so the narrowed (non-null) identity survives the
    // transaction closure.
    const confirmActor = {
      uid: actor.uid,
      companyId: actor.companyId,
      personId: actor.personId,
      hubId: actor.person.hubId,
    };

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyOriginHubReceiptConfirm(tx, db, { jobId, actor: confirmActor })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError || error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("origin hub receipt confirm failed:", error);
    return Response.json({ error: "Could not confirm receipt of this shipment." }, { status: 500 });
  }
}
