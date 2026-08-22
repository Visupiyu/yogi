import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRazorpayPayment } from "@/lib/razorpayVerify";
import {
  finalizeOnlineOrder,
  onlineOrderIdFor,
  recordUnmatchedPayment,
  type PaymentIntent,
} from "@/lib/onlineOrder";
import { isWithinRateLimit } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// Server-authoritative ONLINE order creation.
//
// Replaces the block in app/checkout/page.tsx that, after Razorpay reported
// success, called reserveStockBestEffort() and then addDoc(orders,
// buildOrderData(...)) straight from the browser. Every financial field on
// that document — items[].price, total, discount, rewardValue, shippingCharge,
// vendorIds, commissionRate, commission, sellerEarning — came from browser
// state, the write used a random document id so one payment could produce two
// orders, and the four steps (stock, order, coupon, rewards) were separate
// client operations that could half-complete after the card was charged.
//
// The browser now sends three identifiers and nothing else. Everything the
// order is built from was computed and stored server-side at
// /api/create-order time, before the customer saw the payment modal.
//
// The heavy lifting is in lib/onlineOrder.ts, shared verbatim with
// app/api/razorpay/webhook so the two entry points cannot drift.
// ---------------------------------------------------------------------------

const FINALIZE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
// Higher than create-order's ceiling on purpose. This route runs AFTER money
// has been captured, so a retry is the customer trying to recover an order
// they have already paid for. Throttling that aggressively would strand a
// real payment; the operation is idempotent, so repeats are cheap.
const FINALIZE_RATE_LIMIT_MAX = 40;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "finalize-online-order",
        requester.uid,
        FINALIZE_RATE_LIMIT_MAX,
        FINALIZE_RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    // ---- The ONLY three fields read from the browser. No price, total,
    // discount, rewardValue, shipping, commission, sellerEarning, vendorId,
    // paymentStatus, userId or userEmail is accepted here or anywhere below.
    const razorpay_order_id =
      typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const razorpay_payment_id =
      typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const razorpay_signature =
      typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return Response.json(
        { error: "Missing payment identifiers." },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // Cheapest possible answer for the common repeat: a double-clicked
    // callback, a refresh, or a webhook that already got here first.
    const existing = await db
      .collection("orders")
      .doc(onlineOrderIdFor(razorpay_payment_id))
      .get();

    if (existing.exists) {
      const data = existing.data() as { userId?: unknown; finalTotal?: unknown };
      // Don't confirm someone else's order to a caller who has no claim on it.
      if (data?.userId !== requester.uid) {
        return Response.json({ error: "Order not found." }, { status: 404 });
      }
      return Response.json({
        success: true,
        alreadyPlaced: true,
        orderId: existing.id,
        finalTotal: Number(data?.finalTotal || 0),
      });
    }

    // ---- Razorpay is the authority on whether money moved, not the browser.
    const verification = await verifyRazorpayPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      expectedUid: requester.uid,
    });

    if (!verification.ok) {
      return Response.json(
        { success: false, error: verification.message },
        { status: 400 }
      );
    }

    // ---- The priced order intent, written server-side before the modal
    // opened. Never round-tripped through the browser.
    const intentSnap = await db
      .collection("paymentIntents")
      .doc(razorpay_order_id)
      .get();

    if (!intentSnap.exists) {
      // Money is captured but there is nothing to build an order from. Do not
      // invent one — record it and surface it for manual reconciliation.
      //
      // Reached only after verifyRazorpayPayment succeeded above, so Razorpay
      // has confirmed this payment was captured. Recording from here rather
      // than relying on the webhook matters: the webhook 503s until
      // RAZORPAY_WEBHOOK_SECRET is configured, and without this the only
      // trace of the orphan is the log line below.
      await recordUnmatchedPayment({
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        amountPaise: verification.amountPaise,
        uid: requester.uid,
        reason: "no matching paymentIntent",
        source: "browser",
      });

      console.error(
        "finalize-online-order: captured payment with no intent:",
        razorpay_order_id,
        razorpay_payment_id
      );
      return Response.json(
        {
          error:
            "We couldn't match this payment to your cart. Your payment is safe — please contact support with your order reference.",
        },
        { status: 409 }
      );
    }

    const intent = intentSnap.data() as PaymentIntent;

    if (intent.uid !== requester.uid) {
      // Also a captured-but-unmatched payment: verification passed, so money
      // moved, but the intent belongs to someone else and finalising it here
      // would attach the order to the wrong account. Recorded for the same
      // reason as the missing-intent case — the 404 below is deliberately
      // uninformative to the caller, which leaves nothing else to reconcile
      // against. The response itself is unchanged.
      await recordUnmatchedPayment({
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        amountPaise: verification.amountPaise,
        uid: intent.uid,
        reason: "payment intent belongs to a different account",
        source: "browser",
      });

      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    const result = await finalizeOnlineOrder({
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      intent,
      capturedAmountPaise: verification.amountPaise,
      source: "browser",
    });

    if (result.kind === "error") {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({
      success: true,
      alreadyPlaced: result.kind === "already",
      orderId: result.orderId,
      finalTotal: result.finalTotal,
    });
  } catch (error) {
    console.error("finalize-online-order: unexpected failure:", error);
    // Deliberately generic: the customer has paid, and the webhook will
    // reconcile independently, so this must not read as "your payment failed".
    return Response.json(
      {
        error:
          "We're confirming your payment. Check My Orders in a moment — do not pay again.",
      },
      { status: 500 }
    );
  }
}
