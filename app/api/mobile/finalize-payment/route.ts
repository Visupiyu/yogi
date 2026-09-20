import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRazorpayPayment } from "@/lib/razorpayVerify";
import { onlineOrderIdFor, recordUnmatchedPayment } from "@/lib/onlineOrder";
import { finalizeMobileOnlineOrder, type MobilePaymentIntent } from "@/lib/mobileOnlineOrder";
import { isWithinRateLimit } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// Server-authoritative finalisation for the YOMICO CUSTOMER MOBILE APP's
// "Pay Online" checkout — the app's post-payment callback, mirroring
// app/api/finalize-online-order's structure exactly, but for a mobile-created
// paymentIntents record and mobile-shaped order document (see
// lib/mobileOnlineOrder.ts for why that is a separate schema).
//
// The app sends only three Razorpay identifiers and nothing else. Everything
// the order is built from was computed and stored server-side at
// /api/mobile/create-payment-order time, before the customer saw the payment
// sheet.
//
// Verification itself is NOT duplicated: lib/razorpayVerify.ts's
// verifyRazorpayPayment is the exact same HMAC + Razorpay-lookup check the
// web callback and the webhook both already use.
// ---------------------------------------------------------------------------

const FINALIZE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
// Matches finalize-online-order's own reasoning: this runs AFTER money has
// been captured, so a retry is the customer recovering an order they already
// paid for, and the operation is idempotent.
const FINALIZE_RATE_LIMIT_MAX = 40;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "mobile-finalize-payment",
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

    const razorpay_order_id =
      typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const razorpay_payment_id =
      typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const razorpay_signature =
      typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return Response.json({ error: "Missing payment identifiers." }, { status: 400 });
    }

    const db = getAdminDb();

    // Cheapest possible answer for the common repeat: a double-tap on the
    // app's own callback, a re-launch after the app died, or a webhook that
    // already got here first.
    const existing = await db.collection("orders").doc(onlineOrderIdFor(razorpay_payment_id)).get();

    if (existing.exists) {
      const data = existing.data() as { userId?: unknown; total?: unknown };
      if (data?.userId !== requester.uid) {
        return Response.json({ error: "Order not found." }, { status: 404 });
      }
      return Response.json({
        success: true,
        alreadyPlaced: true,
        orderId: existing.id,
        total: Number(data?.total || 0),
      });
    }

    // ---- Razorpay is the authority on whether money moved, not the app.
    const verification = await verifyRazorpayPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      expectedUid: requester.uid,
    });

    if (!verification.ok) {
      return Response.json({ success: false, error: verification.message }, { status: 400 });
    }

    const intentSnap = await db.collection("paymentIntents").doc(razorpay_order_id).get();

    if (!intentSnap.exists) {
      await recordUnmatchedPayment({
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        amountPaise: verification.amountPaise,
        uid: requester.uid,
        reason: "no matching paymentIntent",
        source: "browser",
      });

      console.error(
        "mobile/finalize-payment: captured payment with no intent:",
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

    const intent = intentSnap.data() as MobilePaymentIntent;

    // Defensive: a web-created intent should never reach this route (it has
    // no `platform` field at all — only mobile intents do).
    if (intent.platform !== "mobile") {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    if (intent.uid !== requester.uid) {
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

    const result = await finalizeMobileOnlineOrder({
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      intent,
      capturedAmountPaise: verification.amountPaise,
      source: "mobile-app",
    });

    if (result.kind === "error") {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({
      success: true,
      alreadyPlaced: result.kind === "already",
      orderId: result.orderId,
      total: result.finalTotal,
    });
  } catch (error) {
    console.error("mobile/finalize-payment: unexpected failure:", error);
    // Deliberately generic: the customer may have already paid, and the
    // webhook will reconcile independently, so this must not read as "your
    // payment failed".
    return Response.json(
      {
        error:
          "We're confirming your payment. Check My Orders in a moment — do not pay again.",
      },
      { status: 500 }
    );
  }
}
