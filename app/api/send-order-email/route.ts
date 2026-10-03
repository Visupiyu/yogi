import { sendOrderStatusEmail } from "@/lib/orderStatusEmail";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";

// The "placed" email is sent at most once per order (lib/orderStatusEmail.ts),
// so a loop here can no longer send duplicates; the limit still bounds the
// Firestore reads an abusive caller can cause. A real checkout calls once,
// plus the occasional retry; 10 per 10 minutes sits far above that.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(
  request: Request
) {
  try {

    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json(
        { success: false, error: "Please sign in to send this email." },
        { status: 401 }
      );
    }

    // Keyed on the server-verified uid, before the order read below, so a
    // rejected caller costs neither an email nor a Firestore read.
    if (
      !(await isWithinRateLimit(
        "send-order-email",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        {
          success: false,
          error: "Too many requests. Please wait a few minutes and try again.",
        },
        { status: 429 }
      );
    }

    // Only orderId is taken from the request. customerName and total used
    // to arrive in the body and were rendered straight into the email, so
    // the confirmation could state a name and an amount that never matched
    // the order — and after the P1 pricing work the browser's figure can
    // legitimately differ from what the server charged. Both now come from
    // the order document that is loaded below for the ownership check
    // anyway, so this costs no extra read.
    const { orderId } = await request.json();

    if (!orderId) {
      return Response.json(
        { success: false, error: "orderId is required" },
        { status: 400 }
      );
    }

    // Confirm this order actually belongs to the caller, and send to the
    // order's own stored email rather than whatever the client claims —
    // otherwise anyone could POST an arbitrary orderId/customerEmail pair
    // and use this route to spam any inbox with a plausible-looking
    // "order confirmation".
    if (!isValidDocId(orderId)) {
      return Response.json({ success: false, error: "Order not found" }, { status: 404 });
    }
    const orderSnap = await getAdminDb().collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return Response.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const orderData = orderSnap.data();

    if (orderData?.userId !== requester.uid) {
      return Response.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    // The shared order-status email (lib/orderStatusEmail.ts): recipient and
    // every value from the stored order, HTML-escaped, and sent at most once
    // per order — the server's own post-commit send and this browser retry
    // can never produce two emails.
    const outcome = await sendOrderStatusEmail(orderId, "placed");
    if (outcome.status === "failed") {
      return Response.json({ success: false, error: "Could not send the email." }, { status: 502 });
    }
    if (outcome.status === "skipped" && outcome.reason === "not-configured") {
      return Response.json({ success: false, error: "Email is not configured." }, { status: 500 });
    }
    if (outcome.status === "skipped" && outcome.reason === "no-recipient") {
      return Response.json({ success: false, error: "No email on file for this order" }, { status: 400 });
    }
    return Response.json({
      success: true,
    });

  } catch (error) {

    console.error(
      "Email Error:",
      error
    );

    // Never echo the raw exception (provider/Firebase text) to the browser —
    // the full error stays in the server log above.
    return Response.json(
      {
        success: false,
        error: "Couldn't send the order email.",
      },
      {
        status: 500,
      }
    );
  }
}