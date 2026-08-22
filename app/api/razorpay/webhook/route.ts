import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpayVerify";
import {
  finalizeOnlineOrder,
  recordUnmatchedPayment,
  type PaymentIntent,
} from "@/lib/onlineOrder";

// ---------------------------------------------------------------------------
// Razorpay webhook — server-to-server reconciliation.
//
// This exists for one failure mode the browser callback cannot cover: the
// customer's payment is captured and then their browser dies — tab closed,
// network dropped, phone locked, JS error. Previously that meant money taken
// with no order and nothing anywhere to reconcile it against; the only record
// lived in the Razorpay dashboard.
//
// Razorpay calls this directly, so it does not depend on the customer's
// device surviving. It finalises through exactly the same
// lib/onlineOrder.ts#finalizeOnlineOrder as the browser path, keyed on the
// same deterministic order id (the Razorpay payment id), so whichever arrives
// first creates the order and the other becomes a no-op.
//
// ---------------------------------------------------------------------------
// CONFIGURATION REQUIRED BEFORE THIS DOES ANYTHING
// ---------------------------------------------------------------------------
//   1. Razorpay Dashboard -> Settings -> Webhooks -> Add New Webhook
//        URL:    https://www.yomico.in/api/razorpay/webhook
//        Events: payment.captured
//        Secret: generate one and paste it into Razorpay
//   2. Vercel -> Project -> Settings -> Environment Variables
//        RAZORPAY_WEBHOOK_SECRET = <the same secret>
//
// The secret is NOT set in this repository and no value is invented here.
// Until it is configured, every request is rejected as unverified — which is
// the correct failure direction: an unauthenticated caller must never be able
// to conjure orders by POSTing a fake payload.
// ---------------------------------------------------------------------------

// Next.js App Router hands us the raw body via request.text(). The signature
// is computed over those exact bytes, so it MUST be hashed before any
// JSON.parse — re-serialising a parsed object changes key order and the digest
// no longer matches.
export async function POST(request: Request) {
  try {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.error("razorpay/webhook: RAZORPAY_WEBHOOK_SECRET is not configured");
      // 503 rather than 500: Razorpay retries on 5xx, so once the secret is
      // configured the queued events still arrive.
      return Response.json({ error: "Webhook not configured." }, { status: 503 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      // Never process an unverified body. Returning 400 (not 5xx) stops
      // Razorpay retrying something that will never validate.
      return Response.json({ error: "Invalid signature." }, { status: 400 });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Invalid payload." }, { status: 400 });
    }

    // Only captured payments create orders. authorized/failed/refunded events
    // are acknowledged so Razorpay stops retrying, but change nothing.
    if (event?.event !== "payment.captured") {
      return Response.json({ received: true, ignored: event?.event ?? null });
    }

    const payment = event?.payload?.payment?.entity;
    const paymentId = typeof payment?.id === "string" ? payment.id : "";
    const orderId = typeof payment?.order_id === "string" ? payment.order_id : "";
    const amountPaise = Number(payment?.amount);

    if (!paymentId || !orderId || !Number.isFinite(amountPaise)) {
      return Response.json({ error: "Malformed payment entity." }, { status: 400 });
    }

    const db = getAdminDb();

    const intentSnap = await db.collection("paymentIntents").doc(orderId).get();

    if (!intentSnap.exists) {
      // A captured payment we cannot match to a cart. Record it rather than
      // discarding it: this is exactly the money-with-no-order case the
      // webhook exists to catch, and an admin needs to see it. The shared
      // recorder keys on the payment id (so repeated deliveries overwrite
      // rather than pile up) and raises the admin notification that makes the
      // record visible — the collection itself has no client read access.
      await recordUnmatchedPayment({
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountPaise,
        reason: "no matching paymentIntent",
        source: "webhook",
      });

      console.error("razorpay/webhook: captured payment with no intent:", orderId);
      // 200 so Razorpay stops retrying — it is recorded, and retrying will
      // not make the intent appear.
      return Response.json({ received: true, unmatched: true });
    }

    const intent = intentSnap.data() as PaymentIntent;

    // The expected amount was stamped into the intent server-side at
    // create-order time. The webhook never sees the checkout HMAC, so this is
    // the equivalent guarantee: a payload claiming a different amount than the
    // one this cart was priced at is not finalised.
    if (
      Number.isFinite(Number(intent.expectedAmountPaise)) &&
      Number(intent.expectedAmountPaise) !== amountPaise
    ) {
      // Durable record, not just a log line. This is a captured payment we
      // are deliberately NOT turning into an order, so the only trace would
      // otherwise be stdout — and money the platform holds with nothing
      // representing it is exactly what needs a queryable record. Same
      // collection and same document key as the no-intent case above, so a
      // repeated delivery overwrites rather than piling up duplicates.
      await recordUnmatchedPayment({
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountPaise,
        expectedAmountPaise: Number(intent.expectedAmountPaise),
        uid: intent.uid,
        reason: "captured amount does not match the priced intent",
        source: "webhook",
      });

      console.error(
        "razorpay/webhook: captured amount does not match the priced intent:",
        orderId
      );
      return Response.json({ received: true, mismatch: true });
    }

    const result = await finalizeOnlineOrder({
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      intent,
      capturedAmountPaise: amountPaise,
      source: "webhook",
    });

    if (result.kind === "error") {
      console.error("razorpay/webhook: finalisation failed:", result.error);
      // 500 so Razorpay retries — finalisation is idempotent, so a retry that
      // succeeds after a transient Firestore failure is safe.
      return Response.json({ error: "Finalisation failed." }, { status: 500 });
    }

    return Response.json({
      received: true,
      orderId: result.orderId,
      alreadyPlaced: result.kind === "already",
    });
  } catch (error) {
    console.error("razorpay/webhook: unexpected failure:", error);
    return Response.json({ error: "Webhook error." }, { status: 500 });
  }
}
