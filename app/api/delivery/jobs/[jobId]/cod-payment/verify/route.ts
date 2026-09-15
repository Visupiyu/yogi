import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { applyCodPaymentVerification, CodPaymentError } from "@/lib/deliveryEngine/codPayment";

// POST /api/delivery/jobs/[jobId]/cod-payment/verify   { reference, amount? }
//
// COD Payment Scan V1 — the rider's OWN step 1 of the EXISTING two-step
// Pay-on-Delivery (UPI Only) state machine (Pending -> AwaitingVerification ->
// Paid; see lib/deliveryEngine/codPayment.ts). PERSON-ONLY, and only the exact
// rider currently physically responsible for handing THIS shipment to the
// customer (YOMICO Direct's assigned rider, or COMPANY's Rider 2 after
// destination-handover is confirmed — never Rider 1, never a Hub Person, never
// a company owner/dispatcher) — enforced inside the transaction against the
// job's own custody, never trusted from this route.
//
// `reference` is treated as an OPAQUE string (whatever the rider's camera
// decoded from the customer's payment QR, or a manually-entered UPI
// transaction id) — never parsed or executed, only compared/stored. `amount`,
// if sent, is informational only: the authoritative amount is always
// order.paymentAmount, read server-side.
export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-cod-payment-verify", requester.uid, 30, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

    // Only a delivery PERSON may verify a COD payment — never a company
    // owner/dispatcher (they resolve to role "company", rejected here) and
    // never an admin. The exact physical-responsibility check (custody, leg
    // type, not a hub person) happens inside applyCodPaymentVerification.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person")
      return Response.json({ error: "Only the delivery person for this shipment can verify customer payment." }, { status: 403 });

    const { jobId } = await ctx.params;
    let body: { reference?: unknown; amount?: unknown } = {};
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

    const reference = typeof body.reference === "string" ? body.reference : "";
    if (!reference.trim()) return Response.json({ error: "Missing payment reference." }, { status: 400 });
    const clientAmount = typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      applyCodPaymentVerification(tx, db, {
        jobId,
        actor: { uid: actor.uid, personId: actor.personId, role: actor.person.role, name: actor.person.name },
        reference,
        clientAmount,
      })
    );

    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof CodPaymentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("COD payment verification failed:", error);
    return Response.json({ error: "Could not verify this payment." }, { status: 500 });
  }
}
