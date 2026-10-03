// SERVER-ONLY (Admin SDK + RESEND_API_KEY).
//
// The ONE customer order-status email. Every authoritative transition point
// calls sendOrderStatusEmail(orderId, event) AFTER its own write has committed:
//
//   placed            app/api/place-order, app/api/mobile/place-order,
//                     lib/onlineOrder (web online: finalize + webhook),
//                     lib/mobileOnlineOrder, app/api/send-order-email
//   confirmed         app/api/confirm-order
//   shipped / out_for_delivery / delivered
//                     app/api/seller/advance-item (seller/admin roll-up),
//                     lib/deliveryEngine/reconcile callers (delivery-driven)
//   cancelled         app/api/cancel-order
//   refunded          lib/refunds/orderRefund (Razorpay refund processed)
//
// Rules:
//   * Never throws and never changes the order: a mail problem cannot fail or
//     roll back a commerce operation that already committed.
//   * Once per (order, event): a ledger document orderEmails/{orderId}_{event}
//     is claimed in a transaction before sending, and Resend gets the same
//     idempotency key, so a retry, a double click or two concurrent callers
//     send one email. A failed send can be retried (up to MAX_ATTEMPTS).
//   * Recipient and every value come from the stored order (server-side). The
//     caller passes only the order id and the event.
//   * Every stored value inserted into the HTML is escaped.
//   * Tests inject a fake transport; without RESEND_API_KEY nothing is sent.
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { EMAIL_FROM, SUPPORT_EMAIL, siteUrl } from "@/lib/siteConfig";

export const ORDER_EMAIL_EVENTS = [
  "placed",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderEmailEvent = (typeof ORDER_EMAIL_EVENTS)[number];

export const ORDER_EMAILS_COLLECTION = "orderEmails";
const MAX_ATTEMPTS = 3;
/** A claim older than this with no result is treated as abandoned (crashed sender). */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/** The stored order status each roll-up status maps to, for advance-item / reconcile. */
export function emailEventForStatus(status: unknown): OrderEmailEvent | null {
  switch (status) {
    case "Confirmed":
      return "confirmed";
    case "Shipped":
      return "shipped";
    case "Out For Delivery":
      return "out_for_delivery";
    case "Delivered":
      return "delivered";
    case "Cancelled":
      return "cancelled";
    default:
      return null;
  }
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "";
};

type OrderDoc = Record<string, unknown>;

const COPY: Record<OrderEmailEvent, { subject: string; heading: string; body: string }> = {
  placed: { subject: "Order placed", heading: "Thank you for your order", body: "We have received your order. We'll email you again when it is confirmed." },
  confirmed: { subject: "Order confirmed", heading: "Your order is confirmed", body: "Your order has been confirmed and is being prepared." },
  shipped: { subject: "Order shipped", heading: "Your order has shipped", body: "Your order is on its way." },
  out_for_delivery: { subject: "Out for delivery", heading: "Your order is out for delivery", body: "Your order will be delivered soon. Please keep your delivery code ready." },
  delivered: { subject: "Order delivered", heading: "Your order has been delivered", body: "Your order has been delivered. We hope you enjoy it." },
  cancelled: { subject: "Order cancelled", heading: "Your order has been cancelled", body: "Your order has been cancelled. If you paid online, any refund due is shown on your order page." },
  refunded: { subject: "Refund processed", heading: "Your refund has been processed", body: "Your refund has been sent to your original payment method. Banks usually take 5–7 working days to show it." },
};

/** The order reference customers see (orderNumber, else the document id). */
function orderRef(orderId: string, order: OrderDoc): string {
  return str(order.orderNumber, 60) || orderId;
}

/** Subject + HTML + text for one event. Pure; every inserted value is escaped. */
export function buildOrderStatusEmail(orderId: string, order: OrderDoc, event: OrderEmailEvent) {
  const copy = COPY[event];
  const ref = orderRef(orderId, order);
  const name = str(order.customerName, 100) || "there";
  const items = (Array.isArray(order.items) ? order.items : []).slice(0, 20).map((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const qty = Number(item.qty ?? item.quantity);
    return { name: str(item.name, 150) || "Item", qty: Number.isFinite(qty) && qty > 0 ? qty : 1 };
  });
  const amount =
    event === "refunded" ? money(order.refundedAmount) : money(order.finalTotal ?? order.total);
  const amountLabel = event === "refunded" ? "Refund amount" : "Order total";
  const orderUrl = siteUrl(`/orders/${encodeURIComponent(orderId)}`);

  const subject = `${copy.subject} — ${ref}`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
<h2>${escapeHtml(copy.heading)}</h2>
<p>Hi ${escapeHtml(name)},</p>
<p>${escapeHtml(copy.body)}</p>
<p><strong>Order:</strong> ${escapeHtml(ref)}</p>
${items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i.name)} × ${i.qty}</li>`).join("")}</ul>` : ""}
${amount ? `<p><strong>${escapeHtml(amountLabel)}:</strong> ${escapeHtml(amount)}</p>` : ""}
<p><a href="${escapeHtml(orderUrl)}">View your order</a></p>
<p style="color:#555;font-size:13px">Questions? Write to ${escapeHtml(SUPPORT_EMAIL)}.</p>
</body></html>`;
  const text = [
    copy.heading,
    `Hi ${name},`,
    copy.body,
    `Order: ${ref}`,
    ...items.map((i) => `- ${i.name} x ${i.qty}`),
    amount ? `${amountLabel}: ${amount}` : "",
    `View your order: ${orderUrl}`,
  ].filter(Boolean).join("\n");
  return { subject, html, text };
}

export type EmailMessage = { from: string; to: string; subject: string; html: string; text: string };
/** Sends one message. `idempotencyKey` must make a repeat a no-op at the provider. */
export type EmailTransport = (message: EmailMessage, idempotencyKey: string) => Promise<{ ok: true; id?: string } | { ok: false; error: string }>;

let transportOverride: EmailTransport | null = null;
/** Tests only: route every send to a fake. Pass null to restore the default. */
export function setOrderEmailTransportForTests(transport: EmailTransport | null) {
  transportOverride = transport;
}

function defaultTransport(): EmailTransport | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const resend = new Resend(apiKey);
  return async (message, idempotencyKey) => {
    const result = await resend.emails.send(message, { idempotencyKey });
    // Resend reports a rejected send in the body rather than by throwing.
    if (result.error) return { ok: false, error: result.error.message || "rejected" };
    return { ok: true, id: result.data?.id };
  };
}

export type OrderEmailOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: "already-sent" | "in-progress" | "not-configured" | "no-recipient" | "order-not-found" | "too-many-attempts" | "invalid" }
  | { status: "failed"; reason: string };

function recipientOf(order: OrderDoc): string {
  const email = str(order.userEmail, 254).toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : "";
}

/**
 * Sends `event` for `orderId` once. Call only after the transition is saved.
 * Never throws.
 */
export async function sendOrderStatusEmail(
  orderId: string,
  event: OrderEmailEvent,
  db: Firestore = getAdminDb()
): Promise<OrderEmailOutcome> {
  try {
    if (!orderId || typeof orderId !== "string" || orderId.includes("/") || !ORDER_EMAIL_EVENTS.includes(event)) {
      return { status: "skipped", reason: "invalid" };
    }
    const transport = transportOverride ?? defaultTransport();
    if (!transport) return { status: "skipped", reason: "not-configured" };

    const ledgerRef = db.collection(ORDER_EMAILS_COLLECTION).doc(`${orderId}_${event}`);
    const orderRefDoc = db.collection("orders").doc(orderId);

    // ---- claim (once per order + event) ----
    type Claim = { kind: "go"; order: OrderDoc; to: string; attempt: number } | { kind: "skip"; outcome: OrderEmailOutcome };
    const claim = await db.runTransaction<Claim>(async (tx) => {
      const [ledgerSnap, orderSnap] = await Promise.all([tx.get(ledgerRef), tx.get(orderRefDoc)]);
      if (!orderSnap.exists) return { kind: "skip", outcome: { status: "skipped", reason: "order-not-found" } };
      const order = orderSnap.data() as OrderDoc;
      const to = recipientOf(order);
      if (!to) return { kind: "skip", outcome: { status: "skipped", reason: "no-recipient" } };

      const ledger = ledgerSnap.exists ? (ledgerSnap.data() as Record<string, unknown>) : null;
      const attempts = Number(ledger?.attempts) || 0;
      if (ledger?.status === "sent") return { kind: "skip", outcome: { status: "skipped", reason: "already-sent" } };
      if (ledger?.status === "sending") {
        const claimedAt = (ledger.claimedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
        if (Date.now() - claimedAt < STALE_CLAIM_MS) return { kind: "skip", outcome: { status: "skipped", reason: "in-progress" } };
      }
      if (attempts >= MAX_ATTEMPTS) return { kind: "skip", outcome: { status: "skipped", reason: "too-many-attempts" } };

      const now = Timestamp.now();
      tx.set(ledgerRef, {
        orderId,
        event,
        status: "sending",
        attempts: attempts + 1,
        claimedAt: now,
        ...(ledger ? {} : { createdAt: now }),
      }, { merge: true });
      return { kind: "go", order, to, attempt: attempts + 1 };
    });
    if (claim.kind === "skip") return claim.outcome;

    // ---- send (outside any transaction) ----
    const { subject, html, text } = buildOrderStatusEmail(orderId, claim.order, event);
    let result: Awaited<ReturnType<EmailTransport>>;
    try {
      // Same key for every attempt: the provider drops a repeat of a message
      // it already accepted (e.g. our "sent" write failed after it went out).
      result = await transport({ from: EMAIL_FROM, to: claim.to, subject, html, text }, `order-email/${orderId}/${event}`);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : "send threw" };
    }

    const now = Timestamp.now();
    if (result.ok) {
      await ledgerRef.set({ status: "sent", sentAt: now, providerId: result.id ?? null, lastError: null }, { merge: true });
      return { status: "sent" };
    }
    await ledgerRef.set({ status: "failed", failedAt: now, lastError: String(result.error).slice(0, 300) }, { merge: true });
    console.error(`order email ${event} for ${orderId} failed (attempt ${claim.attempt}).`);
    return { status: "failed", reason: String(result.error).slice(0, 300) };
  } catch (error) {
    console.error(`order email ${event} for ${orderId} errored:`, error instanceof Error ? error.name : "unknown");
    return { status: "failed", reason: "internal error" };
  }
}
