// SERVER-ONLY. Delivery Engine — customer OTP issuance + customer notification.
//
// Issuance runs inside a Firestore transaction and stores ONLY the HMAC hash
// (+ issuedAt + attempts:0). The plaintext code is returned to the caller for a
// SINGLE post-commit notification and is never persisted or logged. Delivery of
// the code to the customer is PLUGGABLE (email + in-app today): adding
// SMS/WhatsApp later is a new channel here — no delivery-FSM or Expo change.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { Resend } from "resend";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";
import {
  generateDeliveryOtp,
  hashDeliveryOtp,
  isDeliveryOtpConfigured,
  DELIVERY_OTP_TTL_MS,
  DELIVERY_OTP_MAX_ATTEMPTS,
} from "@/lib/deliveryEngine/deliveryOtp";

export type OtpIssue =
  | {
      issued: true;
      code: string; // transient — for the post-commit notification only
      jobId: string;
      shipmentNumber: string;
      orderId: string;
      userId: string;
      userEmail: string;
      customerName: string;
    }
  | {
      issued: false;
      reason: "not-configured" | "not-out-for-delivery" | "already-active" | "job-missing" | "no-owner";
    };

function hasActiveOtp(job: DeliveryJob): boolean {
  const hash = (job as { deliveryOtpHash?: unknown }).deliveryOtpHash;
  if (typeof hash !== "string" || !hash) return false;
  const issued = (job as { deliveryOtpIssuedAt?: unknown }).deliveryOtpIssuedAt;
  const t =
    issued && typeof (issued as { toMillis?: unknown }).toMillis === "function"
      ? (issued as { toMillis: () => number }).toMillis()
      : 0;
  return t > 0 && Date.now() - t <= DELIVERY_OTP_TTL_MS;
}

// Idempotent issue at OUT_FOR_DELIVERY: generate ONLY if no active OTP exists.
export function ensureDeliveryOtp(tx: Transaction, db: Firestore, args: { jobId: string }): Promise<OtpIssue> {
  return issue(tx, db, args.jobId, false);
}

// Resend: always regenerate a fresh OTP (new hash, reset attempts, new issuedAt).
export function regenerateDeliveryOtp(tx: Transaction, db: Firestore, args: { jobId: string }): Promise<OtpIssue> {
  return issue(tx, db, args.jobId, true);
}

async function issue(tx: Transaction, db: Firestore, jobId: string, force: boolean): Promise<OtpIssue> {
  if (!isDeliveryOtpConfigured()) return { issued: false, reason: "not-configured" };

  const jobRef = db.collection("deliveryJobs").doc(jobId);
  // ---- READS (before writes) ----
  const snap = await tx.get(jobRef);
  if (!snap.exists) return { issued: false, reason: "job-missing" };
  const job = snap.data() as DeliveryJob;
  // OTP is a last-mile artifact — only valid while the parcel is out for delivery.
  if (job.currentStage !== "OutForDelivery") return { issued: false, reason: "not-out-for-delivery" };
  if (!force && hasActiveOtp(job)) return { issued: false, reason: "already-active" };

  const orderId = typeof job.orderId === "string" ? job.orderId : "";
  const orderSnap = orderId ? await tx.get(db.collection("orders").doc(orderId)) : null;
  const order = orderSnap && orderSnap.exists ? (orderSnap.data() as Record<string, unknown>) : null;
  const userId = order && typeof order.userId === "string" ? order.userId : "";
  const userEmail = order && typeof order.userEmail === "string" ? order.userEmail : "";
  const customerName =
    (order && typeof order.customerName === "string" && order.customerName) ||
    (typeof job.drop?.customerName === "string" ? job.drop.customerName : "");
  if (!userId) return { issued: false, reason: "no-owner" };

  // ---- WRITE: hash only, never the plaintext ----
  const code = generateDeliveryOtp();
  const now = Timestamp.now();
  tx.set(
    jobRef,
    // deliveryOtpDelivery is reset: the previous code's channel outcome must
    // never be read as this code's (deliverOtpToCustomer records the new one).
    { deliveryOtpHash: hashDeliveryOtp(code), deliveryOtpIssuedAt: now, deliveryOtpAttempts: 0, deliveryOtpDelivery: null, updatedAt: now },
    { merge: true },
  );

  return { issued: true, code, jobId, shipmentNumber: job.shipmentNumber, orderId, userId, userEmail, customerName };
}

// ---------------------------------------------------------------------------
// Customer notification (POST-COMMIT only — never inside the issue transaction).
// ---------------------------------------------------------------------------
const FROM = "YOMICO <onboarding@yomico.in>";
const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;

// Per-channel outcome. "sent" means the provider ACCEPTED the message — not
// that the customer read it. SMS is listed explicitly as "not_configured": no
// SMS provider is integrated (see README → Delivery OTP), and nothing here
// pretends otherwise.
export type OtpChannelState = "sent" | "failed" | "no_address" | "not_configured";
export type OtpDeliveryStatus = {
  inApp: OtpChannelState;
  email: OtpChannelState;
  sms: "not_configured";
  /** At least one channel accepted the code. */
  anyDelivered: boolean;
};

export type OtpNotifyResult = {
  channels: { channel: string; ok: boolean }[];
  status: OtpDeliveryStatus;
};

/** Injectable email sender (tests). Resolves to Resend's own `{ error }` shape. */
export type OtpEmailSender = (message: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) => Promise<{ error?: unknown } | null | undefined>;

const defaultEmailSender: OtpEmailSender | null = resend
  ? (message) => resend.emails.send(message) as Promise<{ error?: unknown }>
  : null;

// Deliver the code to the ORDER OWNER via the customer channels. Never throws
// (a notification failure must not corrupt the durable OTP/shipment state — the
// customer can Resend). Never logs the code or the address.
//
// The per-channel outcome is persisted on the job as deliveryOtpDelivery (no
// code, no address — just which channels accepted it) so the rider, the
// delivery company and the customer can all SEE whether the code went out,
// instead of finding out at the door.
export async function deliverOtpToCustomer(
  db: Firestore,
  args: { jobId?: string; userId: string; userEmail: string; customerName: string; shipmentNumber: string; code: string },
  deps: { sendEmail?: OtpEmailSender | null } = {},
): Promise<OtpNotifyResult> {
  const sendEmail = deps.sendEmail === undefined ? defaultEmailSender : deps.sendEmail;
  let inApp: OtpChannelState = "failed";
  let email: OtpChannelState = "failed";

  // In-app notification, scoped to the order owner's customer account.
  try {
    await db.collection("notifications").add({
      userId: args.userId,
      role: "customer",
      title: "🔐 Your delivery code",
      message: `Your delivery code for shipment ${args.shipmentNumber} is ${args.code}. Share it only with the delivery person at handover. It expires in 24 hours.`,
      type: "delivery",
      read: false,
      createdAt: Timestamp.now(),
    });
    inApp = "sent";
  } catch {
    inApp = "failed";
  }

  // Email to the order's customer email. Resend RESOLVES with { error } on an
  // API failure rather than throwing, so that must be checked explicitly —
  // previously a rejected send was recorded as delivered.
  if (!sendEmail) {
    email = "not_configured";
  } else if (!args.userEmail) {
    email = "no_address";
  } else {
    try {
      const result = await sendEmail({
        from: FROM,
        to: args.userEmail,
        subject: "Your YOMICO delivery code",
        text:
          `Hi ${args.customerName || "there"},\n\n` +
          `Your delivery code for shipment ${args.shipmentNumber} is ${args.code}.\n` +
          `Share it only with the delivery person when your parcel is handed over.\n\n` +
          `This code expires in 24 hours. If you didn't expect a delivery, you can ignore this message.\n\n— YOMICO`,
      });
      email = result && result.error ? "failed" : "sent";
    } catch {
      email = "failed";
    }
  }

  if (email === "failed" || inApp === "failed") {
    console.warn("delivery OTP: channel delivery failed", { jobId: args.jobId || null, inApp, email });
  }

  const status: OtpDeliveryStatus = {
    inApp,
    email,
    sms: "not_configured",
    anyDelivered: inApp === "sent" || email === "sent",
  };

  if (args.jobId) {
    try {
      await db.collection("deliveryJobs").doc(args.jobId).set(
        { deliveryOtpDelivery: { ...status, updatedAt: Timestamp.now(), sendCount: FieldValue.increment(1) } },
        { merge: true },
      );
    } catch {
      console.warn("delivery OTP: could not record delivery status", { jobId: args.jobId });
    }
  }

  return {
    channels: [
      { channel: "in-app", ok: inApp === "sent" },
      { channel: "email", ok: email === "sent" },
    ],
    status,
  };
}

// ---------------------------------------------------------------------------
// Read-only projection for the delivery actors and the customer. NEVER carries
// the code, the hash, the address or the attempt counter's raw document — just
// what an operator needs to act: is there a live code, did it reach the
// customer, and how many wrong entries remain before it locks.
// ---------------------------------------------------------------------------
export type OtpView = {
  state: "not_issued" | "active" | "expired" | "locked" | "used" | "unavailable";
  expiresAt: string | null;
  attemptsRemaining: number | null;
  delivery: OtpDeliveryStatus | null;
};

export function deliveryOtpView(job: DeliveryJob): OtpView {
  const j = job as Record<string, unknown>;
  const ms = (v: unknown) =>
    v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : null;
  const raw = j.deliveryOtpDelivery as Partial<OtpDeliveryStatus> | undefined;
  const delivery: OtpDeliveryStatus | null =
    raw && typeof raw === "object"
      ? {
          inApp: (raw.inApp as OtpChannelState) || "failed",
          email: (raw.email as OtpChannelState) || "failed",
          sms: "not_configured",
          anyDelivered: raw.anyDelivered === true,
        }
      : null;

  if (ms(j.deliveryOtpConsumedAt) !== null || job.status === "Delivered") {
    return { state: "used", expiresAt: null, attemptsRemaining: null, delivery };
  }
  if (!isDeliveryOtpConfigured()) return { state: "unavailable", expiresAt: null, attemptsRemaining: null, delivery };
  const hash = typeof j.deliveryOtpHash === "string" ? j.deliveryOtpHash : "";
  const issued = ms(j.deliveryOtpIssuedAt);
  if (!hash || issued === null) return { state: "not_issued", expiresAt: null, attemptsRemaining: null, delivery: null };
  const expiresAt = new Date(issued + DELIVERY_OTP_TTL_MS).toISOString();
  const attempts = typeof j.deliveryOtpAttempts === "number" ? j.deliveryOtpAttempts : 0;
  const attemptsRemaining = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - attempts);
  if (attemptsRemaining === 0) return { state: "locked", expiresAt, attemptsRemaining: 0, delivery };
  if (Date.now() - issued > DELIVERY_OTP_TTL_MS) return { state: "expired", expiresAt, attemptsRemaining, delivery };
  return { state: "active", expiresAt, attemptsRemaining, delivery };
}
