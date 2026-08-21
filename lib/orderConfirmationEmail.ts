import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebaseAdmin";

// SERVER-ONLY. Reads RESEND_API_KEY.
//
// The order-confirmation email, extracted so the two server paths that can
// finalise a Razorpay order both reach it:
//
//   app/api/finalize-online-order  — via lib/onlineOrder.ts (browser callback)
//   app/api/razorpay/webhook       — via lib/onlineOrder.ts (browser gone)
//
// Before this existed the email was only ever triggered from the browser, so
// the one case the webhook was built for — the customer's device dying after
// capture — produced an order the customer never heard about.
//
// Every value is loaded from the order document with the Admin SDK. Nothing
// is accepted from a caller except the order id, so there is no path by which
// a browser-supplied amount or name can appear in a confirmation.

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const FROM = "YOMICO <onboarding@yomico.in>";
const SUBJECT = "Order Confirmation";

export type OrderEmailResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Sends the confirmation for an order that already exists.
 *
 * Never throws: a mail failure must not fail an order whose payment is
 * already captured. Callers log the reason and carry on.
 */
export async function sendOrderConfirmationEmail(
  orderId: string
): Promise<OrderEmailResult> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY is not configured" };
  if (!orderId) return { ok: false, reason: "orderId is required" };

  try {
    const snap = await getAdminDb().collection("orders").doc(orderId).get();

    if (!snap.exists) return { ok: false, reason: "Order not found" };

    const orderData = snap.data() as Record<string, unknown>;

    // finalTotal is what checkout / place-order / finalizeOnlineOrder commit
    // as the charged amount; total is the pre-discount fallback for orders
    // written before finalTotal existed.
    const finalTotal = Number(orderData?.finalTotal);
    const legacyTotal = Number(orderData?.total);
    const total = Number.isFinite(finalTotal)
      ? finalTotal
      : Number.isFinite(legacyTotal)
      ? legacyTotal
      : 0;

    const customerName =
      typeof orderData?.customerName === "string" && orderData.customerName
        ? orderData.customerName
        : "there";

    const customerEmail =
      typeof orderData?.userEmail === "string" ? orderData.userEmail : "";

    if (!customerEmail) {
      return { ok: false, reason: "No email on file for this order" };
    }

    const result = await resend.emails.send({
      from: FROM,
      to: customerEmail,
      subject: SUBJECT,
      html: `
          <h2>
            Thank you for your order,
            ${customerName}
          </h2>

          <p>
            Order ID:
            ${orderId}
          </p>

          <p>
            Customer Email:
            ${customerEmail}
          </p>

          <p>
            Total:
            ₹${total.toLocaleString("en-IN")}
          </p>

          <p>
            Your order has been placed successfully.
          </p>
        `,
    });

    // Resend reports a rejected send in the response body rather than by
    // throwing, so a bare await would report success for a mail that never
    // left.
    if ((result as { error?: unknown })?.error) {
      return {
        ok: false,
        reason: `Resend rejected the message: ${JSON.stringify(
          (result as { error?: unknown }).error
        )}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}
