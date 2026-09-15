import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyDeliveryExceptionReport, DeliveryExceptionError } from "@/lib/deliveryEngine/deliveryException";

// POST /api/delivery/jobs/[jobId]/delivery-exception   { reason, note? }
//
// Delivery Failure/Exception Handling V1 — the final-mile rider's safe way to
// report that THIS delivery attempt could not be completed. PERSON-ONLY, and
// only the exact rider currently physically responsible for handing THIS
// shipment to the customer (YOMICO Direct's assigned rider, or COMPANY's
// Rider 2 after destination-handover is confirmed — never Rider 1, never a
// Hub Person, never a company owner/dispatcher) — enforced inside the
// transaction against the job's own custody, never trusted from this route.
//
// This is NOT a cancellation: it never touches custody, never marks
// Delivered, never marks a COD payment Paid, and never changes order status —
// see lib/deliveryEngine/deliveryException.ts. `reason` must be one of the
// whitelisted customer-delivery exception codes; `note` is optional, short,
// and free-text (never customer PII beyond what the rider chooses to type).
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-exception-report", requester.uid, 30, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

    // Only a delivery PERSON may report a delivery exception — never a
    // company owner/dispatcher (they resolve to role "company", rejected
    // here) and never an admin. The exact physical-responsibility check
    // (custody, leg type/status, not a hub person) happens inside
    // applyDeliveryExceptionReport.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person")
      return Response.json({ error: "Only the delivery person for this shipment can report a delivery issue." }, { status: 403 });

    const { jobId } = await ctx.params;
    let body: { reason?: unknown; note?: unknown } = {};
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

    const reason = typeof body.reason === "string" ? body.reason : "";
    if (!reason) return Response.json({ error: "Missing reason." }, { status: 400 });

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyDeliveryExceptionReport(tx, db, {
        jobId,
        actor: { uid: actor.uid, personId: actor.personId, role: actor.person.role },
        reason,
        note: body.note,
      })
    );

    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof DeliveryExceptionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("delivery exception report failed:", error);
    return Response.json({ error: "Could not record this delivery issue." }, { status: 500 });
  }
}
