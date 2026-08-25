import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// PUBLIC guest order tracking.
//
// This is the only unauthenticated route in the app that reads an order, so
// the projection below is the security boundary, not a convenience.
//
// Why a server route rather than a client Firestore query: firestore.rules
// cannot express "an unauthenticated caller may read this document if it
// matches on two fields", and the orders read rule deliberately requires a
// signed-in owner, vendor or admin. The Admin SDK bypasses rules, so the
// filtering has to happen here, explicitly.
//
// Two secrets are required together — the order id AND the email on the order.
// ONLINE order ids are Razorpay payment ids (pay_...) and COD ids are
// {uid}_{uuid}, so neither is guessable, but an id that leaks (a screenshot, a
// forwarded confirmation email) must still not expose the customer's address
// or phone number on its own.
// ---------------------------------------------------------------------------

// Keyed by order id rather than by IP: the abuse this bounds is guessing the
// email for a known order id, and the order id is the thing an attacker would
// hold fixed while varying the email. A legitimate customer refreshing their
// own tracking page stays far inside this.
const TRACK_RATE_LIMIT_MAX = 10;
const TRACK_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Everything the tracker is allowed to see. Anything not listed here is never
 * returned, including: address, phone, customerName, userEmail, items, prices,
 * total, finalTotal, discount, rewardValue, commission, sellerEarning,
 * vendorIds, userId, razorpayPaymentId, razorpayOrderId, paymentMethod,
 * paymentStatus, paymentTransactionId and refundTransactionId.
 *
 * refundStatus is included because a customer chasing a refund is exactly who
 * uses this page; the refund AMOUNT and reference are not, since neither is
 * needed to answer "where is my money" and both are sensitive.
 */
type TrackingProjection = {
  status: string;
  createdAt: string | null;
  deliveryDate: string | null;
  expectedDelivery: string | null;
  deliveredAt: string | null;
  courierName: string | null;
  trackingNumber: string | null;
  refundStatus: string | null;
};

function asIsoString(value: unknown): string | null {
  if (!value) return null;
  // Firestore Timestamp
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  // Already a display string (deliveryDate / expectedDelivery are stored as
  // pre-formatted strings by checkout and the seller form).
  if (typeof value === "string") return value;
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const orderId =
      typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    // BOTH are required. Neither alone is sufficient to see anything.
    if (!orderId || !email) {
      return Response.json(
        { error: "Enter both your order ID and the email used to order." },
        { status: 400 }
      );
    }

    if (orderId.length > 200 || email.length > 320) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    if (
      !(await isWithinRateLimit(
        "track-order",
        orderId,
        TRACK_RATE_LIMIT_MAX,
        TRACK_RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const snap = await getAdminDb().collection("orders").doc(orderId).get();

    // Deliberately identical response for "no such order" and "email does not
    // match", so this cannot be used to test whether an order id exists.
    const notFound = Response.json(
      {
        error:
          "We couldn't find an order with those details. Check the order ID and email and try again.",
      },
      { status: 404 }
    );

    if (!snap.exists) return notFound;

    const order = snap.data() as Record<string, unknown>;

    const storedEmail =
      typeof order.userEmail === "string" ? order.userEmail : "";

    if (
      !storedEmail ||
      storedEmail.trim().toLowerCase() !== email.toLowerCase()
    ) {
      return notFound;
    }

    const projection: TrackingProjection = {
      status: asString(order.status) || "Pending",
      createdAt: asIsoString(order.createdAt),
      deliveryDate: asIsoString(order.deliveryDate),
      expectedDelivery: asIsoString(order.expectedDelivery),
      deliveredAt: asIsoString(order.deliveredAt),
      courierName: asString(order.courierName),
      trackingNumber: asString(order.trackingNumber),
      refundStatus: asString(order.refundStatus),
    };

    return Response.json({ order: projection });
  } catch (error) {
    console.error("track-order: unexpected failure:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
