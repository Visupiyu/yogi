// SERVER-ONLY. Delivery Engine — customer OTP issuance + customer notification.
//
// Issuance runs inside a Firestore transaction and stores ONLY the HMAC hash
// (+ issuedAt + attempts:0). The plaintext code is returned to the caller for a
// SINGLE post-commit notification and is never persisted or logged. Delivery of
// the code to the customer is PLUGGABLE (email + in-app today): adding
// SMS/WhatsApp later is a new channel here — no delivery-FSM or Expo change.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { Resend } from "resend";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";
import {
  generateDeliveryOtp,
  hashDeliveryOtp,
  isDeliveryOtpConfigured,
  DELIVERY_OTP_TTL_MS,
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
    { deliveryOtpHash: hashDeliveryOtp(code), deliveryOtpIssuedAt: now, deliveryOtpAttempts: 0, updatedAt: now },
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

export type OtpNotifyResult = { channels: { channel: string; ok: boolean }[] };

// Deliver the code to the ORDER OWNER via the customer channels. Never throws
// (a notification failure must not corrupt the durable OTP/shipment state — the
// customer can Resend). Never logs the code.
export async function deliverOtpToCustomer(
  db: Firestore,
  args: { userId: string; userEmail: string; customerName: string; shipmentNumber: string; code: string },
): Promise<OtpNotifyResult> {
  const channels: { channel: string; ok: boolean }[] = [];

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
    channels.push({ channel: "in-app", ok: true });
  } catch {
    channels.push({ channel: "in-app", ok: false });
  }

  // Email to the order's customer email.
  if (resend && args.userEmail) {
    try {
      await resend.emails.send({
        from: FROM,
        to: args.userEmail,
        subject: "Your YOMICO delivery code",
        text:
          `Hi ${args.customerName || "there"},\n\n` +
          `Your delivery code for shipment ${args.shipmentNumber} is ${args.code}.\n` +
          `Share it only with the delivery person when your parcel is handed over.\n\n` +
          `This code expires in 24 hours. If you didn't expect a delivery, you can ignore this message.\n\n— YOMICO`,
      });
      channels.push({ channel: "email", ok: true });
    } catch {
      channels.push({ channel: "email", ok: false });
    }
  } else {
    channels.push({ channel: "email", ok: false });
  }

  return { channels };
}
