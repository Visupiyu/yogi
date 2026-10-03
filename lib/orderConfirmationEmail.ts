import { sendOrderStatusEmail } from "@/lib/orderStatusEmail";

// SERVER-ONLY.
//
// The order-confirmation ("placed") email for an order that already exists,
// reached from both server paths that can finalise a Razorpay order:
//
//   app/api/finalize-online-order  — via lib/onlineOrder.ts (browser callback)
//   app/api/razorpay/webhook       — via lib/onlineOrder.ts (browser gone)
//
// It is now the shared order-status email (lib/orderStatusEmail.ts): sent once
// per order however many of those paths run, with every value read from the
// stored order and HTML-escaped. Nothing is accepted from a caller except the
// order id.

export type OrderEmailResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Never throws: a mail failure must not fail an order whose payment is captured. */
export async function sendOrderConfirmationEmail(orderId: string): Promise<OrderEmailResult> {
  const outcome = await sendOrderStatusEmail(orderId, "placed");
  if (outcome.status === "sent") return { ok: true };
  if (outcome.status === "skipped" && (outcome.reason === "already-sent" || outcome.reason === "in-progress")) return { ok: true };
  return { ok: false, reason: outcome.reason };
}
