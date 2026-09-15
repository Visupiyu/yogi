// SERVER-ONLY. COD ("Pay on Delivery (UPI Only)") payment verification for the
// Delivery App — COD Payment Scan V1.
//
// COD PAYMENT and SHIPMENT/CUSTODY ARE SEPARATE CONCERNS. A DeliveryJob/
// DeliveryLeg carries NO money field, ever (see jobFactory.ts's
// assertNoFinancialFields / FINANCIAL_KEYS, which explicitly bans "cod" and
// "codAmount" from any delivery record). The authoritative COD record already
// lives on orders/{orderId} — paymentMethod, paymentAmount, paymentStatus,
// paymentTransactionId, paymentSubmittedAt, paymentConfirmedBy(Name) — the
// EXACT fields lib/deliveryPayment.ts's confirmDeliveryPayment/
// verifyDeliveryPayment already read and write for the existing web delivery-
// partner flow (app/delivery/[id]/page.tsx). This module is the Delivery
// App's OWN, more strongly-authorized way of reaching Step 1 of that SAME
// two-step state machine (Pending -> AwaitingVerification -> Paid) — never a
// second, parallel payment system — and never touches Step 2 (admin-only,
// unchanged, in lib/deliveryPayment.ts's verifyDeliveryPayment).
//
// HONESTY BOUNDARY: "Pay on Delivery (UPI Only)" is a direct customer -> YOMICO
// UPI transfer with NO payment-gateway/webhook behind it (unlike the ONLINE/
// Razorpay checkout flow — see lib/razorpayVerify.ts, which DOES have real
// API-backed proof of a captured payment). There is therefore no way for this
// server to independently PROVE money moved at scan time. This module
// verifies everything it safely CAN — the order/job/rider relationship, COD
// status, the authoritative amount, and that this exact payment reference is
// not reused across orders — then moves the order to "AwaitingVerification",
// the SAME state the existing web flow already uses for "a rider-submitted
// reference, not yet bank-reconciled". Promoting AwaitingVerification to the
// fully bank-reconciled "Paid" remains the existing ADMIN-only step
// (verifyDeliveryPayment) — that manual bank check is the remaining
// provider-integration point a real UPI-collection gateway would eventually
// close. This module never claims more proof than it actually has.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import type { DeliveryJob, DeliveryLeg, DeliveryPersonRole } from "@/lib/deliveryEngine/types";
import { emitDeliveryNotification } from "@/lib/deliveryEngine/notifications";

export class CodPaymentError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CodPaymentError";
    this.status = status;
  }
}

// Mirrors lib/upiPayment.ts's PAY_ON_DELIVERY_UPI constant exactly (not
// re-exported from there to avoid this server-only module ever being pulled
// into a "use client" bundle transitively).
export const PAY_ON_DELIVERY_UPI = "PAY_ON_DELIVERY_UPI";

export type OrderPaymentStatus = "Pending" | "AwaitingVerification" | "Paid" | string;

type OrderRecord = {
  paymentMethod?: string;
  paymentAmount?: number;
  paymentStatus?: OrderPaymentStatus;
  paymentTransactionId?: string | null;
  userId?: string;
  orderNumber?: string;
};

const TERMINAL_JOB_STATUSES = new Set(["Delivered", "Cancelled", "Returned"]);

// Is THIS authenticated rider currently the one physically responsible for
// handing this shipment to the customer, right now? Mirrors execution.ts's
// OWN "you do not currently hold this shipment" custody check exactly — never
// a looser or different rule for payment than for the physical scan itself.
//   YOMICO Direct: whoever currently holds custody (the only leg there is).
//   COMPANY:       ONLY the FinalMile leg's current custody holder (Rider 2,
//                  and only once destination-handover is Confirmed — before
//                  that, leg.custody.personId is null, so this is false).
//                  Rider 1's Pickup leg is never eligible: its leg.type is
//                  "Pickup", never "FinalMile".
export function isRiderResponsibleForCodPayment(
  job: DeliveryJob,
  leg: DeliveryLeg | null,
  actorPersonId: string
): boolean {
  if (TERMINAL_JOB_STATUSES.has(job.status)) return false;
  if (!leg || leg.custody?.personId !== actorPersonId) return false;
  if (job.providerType === "COMPANY") return leg.type === "FinalMile";
  return true;
}

export type CodPaymentInfo = {
  isCod: boolean;
  amountDue: number | null;
  status: OrderPaymentStatus | null;
  reference: string | null;
  // True only while there is something for THIS caller to do: COD, still
  // Pending, and they currently hold the relevant physical responsibility.
  // Always false for a non-person caller (admin/company) — see callers.
  canVerify: boolean;
};

const NOT_COD: CodPaymentInfo = { isCod: false, amountDue: null, status: null, reference: null, canVerify: false };

// Read-only projection for the job-detail response — never mutates anything.
// `actorPersonId` is "" for a non-person caller (admin/company), which can
// never match a custody.personId, so canVerify is always false for them.
export async function readCodPaymentInfo(
  db: Firestore,
  jobId: string,
  job: DeliveryJob,
  actorPersonId: string
): Promise<CodPaymentInfo> {
  if (!job.orderId) return NOT_COD;
  const orderSnap = await db.collection("orders").doc(job.orderId).get();
  if (!orderSnap.exists) return NOT_COD;
  const order = orderSnap.data() as OrderRecord;
  if (order.paymentMethod !== PAY_ON_DELIVERY_UPI) return NOT_COD;

  const status: OrderPaymentStatus = order.paymentStatus || "Pending";
  const amountDue = typeof order.paymentAmount === "number" ? order.paymentAmount : 0;
  const reference = typeof order.paymentTransactionId === "string" ? order.paymentTransactionId : null;

  let canVerify = false;
  if (status === "Pending" && job.currentLegId && actorPersonId) {
    const legSnap = await db.collection("deliveryJobs").doc(jobId).collection("legs").doc(job.currentLegId).get();
    const leg = legSnap.exists ? (legSnap.data() as DeliveryLeg) : null;
    canVerify = isRiderResponsibleForCodPayment(job, leg, actorPersonId);
  }

  return { isCod: true, amountDue, status, reference, canVerify };
}

export type CodPaymentVerifyActor = {
  uid: string;
  personId: string;
  role?: DeliveryPersonRole;
  name?: string;
};

export type CodPaymentVerifyResult = {
  ok: true;
  idempotent?: boolean;
  orderId: string;
  status: "AwaitingVerification" | "Paid";
  amount: number;
  reference: string;
};

function sanitizeReference(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 128) : "";
}
// Firestore doc ids may not contain '/'. Keep everything else — the reference
// itself is never parsed/executed, only compared and stored opaquely.
function referenceDocId(reference: string): string {
  return reference.replace(/\//g, "_");
}

// The one transactional entry point. All reads happen before any write, same
// discipline as execution.ts's applyScan. Idempotent: replaying the exact same
// (order, reference) pair — or re-verifying an order already Paid — returns
// the existing result instead of writing again or erroring.
export async function applyCodPaymentVerification(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; actor: CodPaymentVerifyActor; reference: string; clientAmount?: number | null }
): Promise<CodPaymentVerifyResult> {
  // HUB_PERSON must never verify customer COD payment — explicit, even though
  // it is also structurally impossible below (a hub person is never a job's
  // custody holder).
  if (args.actor.role === "HUB_PERSON") {
    throw new CodPaymentError("A hub person cannot verify customer payment.", 403);
  }
  const reference = sanitizeReference(args.reference);
  if (!reference) throw new CodPaymentError("Invalid payment reference.", 400);

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new CodPaymentError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  if (job.assignedPersonId !== args.actor.personId) {
    throw new CodPaymentError("You are not the assigned rider for this shipment.", 403);
  }

  const legId = job.currentLegId;
  const legSnap = legId ? await tx.get(jobRef.collection("legs").doc(legId)) : null;
  const leg = legSnap && legSnap.exists ? (legSnap.data() as DeliveryLeg) : null;

  if (!isRiderResponsibleForCodPayment(job, leg, args.actor.personId)) {
    throw new CodPaymentError("You are not currently responsible for this customer delivery.", 403);
  }

  const orderId = job.orderId;
  if (!orderId) throw new CodPaymentError("This job has no associated order.", 409);
  const orderRef = db.collection("orders").doc(orderId);
  const orderSnap = await tx.get(orderRef);
  if (!orderSnap.exists) throw new CodPaymentError("Order not found.", 404);
  const order = orderSnap.data() as OrderRecord;

  if (order.paymentMethod !== PAY_ON_DELIVERY_UPI) {
    throw new CodPaymentError("This order is not Pay on Delivery — nothing to verify.", 409);
  }

  // The server ALONE determines the amount owed — orders/{orderId}.paymentAmount
  // is the ONLY authoritative source, never anything the client sends, and
  // it is never rounded/floored/ceiled/adjusted to make a mismatch pass.
  const amountDue = typeof order.paymentAmount === "number" ? order.paymentAmount : 0;

  // The customer must pay the EXACT COD amount — there is NO tolerance.
  // `clientAmount`, if sent, is still only ever informational (it is never
  // stored and never substitutes for amountDue above); it is compared here in
  // integer paise (not rupees) purely to avoid binary floating-point noise
  // (e.g. 1249.1 - 1249 in IEEE754), never to widen what counts as a match —
  // a genuine ₹1 (or ₹0.01) difference is rejected exactly as strictly as a
  // ₹1000 one. NOTE: this is a client-reported value, not authoritative
  // provider evidence of the amount actually paid — no such evidence exists
  // for "Pay on Delivery (UPI Only)" today (no gateway/webhook backs it; see
  // the module comment above). A real provider integration that DOES report a
  // verified paid amount must be checked with this exact same zero-tolerance
  // rule, never a looser one.
  if (args.clientAmount != null && Number.isFinite(args.clientAmount)) {
    const toPaise = (rupees: number) => Math.round(rupees * 100);
    if (toPaise(args.clientAmount) !== toPaise(amountDue)) {
      throw new CodPaymentError("Payment amount does not match the order.", 409);
    }
  }

  // Idempotent short-circuits — no write, safe to repeat.
  if (order.paymentStatus === "Paid") {
    return { ok: true, idempotent: true, orderId, status: "Paid", amount: amountDue, reference: order.paymentTransactionId || reference };
  }
  if (order.paymentStatus === "AwaitingVerification") {
    if (order.paymentTransactionId === reference) {
      return { ok: true, idempotent: true, orderId, status: "AwaitingVerification", amount: amountDue, reference };
    }
    throw new CodPaymentError("A payment reference has already been submitted for this order and is awaiting verification.", 409);
  }
  if (order.paymentStatus && order.paymentStatus !== "Pending") {
    throw new CodPaymentError(`Payment cannot be verified from status "${order.paymentStatus}".`, 409);
  }

  // Replay/reuse guard: this exact reference must not already belong to a
  // DIFFERENT order (a customer's payment reference is proof for ONE order
  // only). The reference itself is the idempotency key for this write.
  const refRef = db.collection("codPaymentReferences").doc(referenceDocId(reference));
  const refSnap = await tx.get(refRef);
  if (refSnap.exists) {
    const existing = refSnap.data() as { orderId?: string };
    if (existing.orderId && existing.orderId !== orderId) {
      throw new CodPaymentError("This payment reference is already associated with another order.", 409);
    }
  }

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();
  tx.set(
    orderRef,
    {
      paymentStatus: "AwaitingVerification",
      paymentTransactionId: reference,
      paymentSubmittedAt: now,
      paymentConfirmedBy: args.actor.uid,
      paymentConfirmedByName: args.actor.name || "",
      // New, additive field only — distinguishes this path from the legacy
      // web delivery-partner's manual text-entry submission. Never read by
      // the existing admin verification step, which is unaffected.
      paymentVerificationSource: "delivery_app_scan",
      updatedAt: now,
    },
    { merge: true }
  );
  tx.set(
    refRef,
    {
      orderId,
      jobId: args.jobId,
      personId: args.actor.personId,
      uid: args.actor.uid,
      amount: amountDue,
      createdAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1 — fires ONLY on this real Pending ->
  // AwaitingVerification transition (never on the idempotent short-circuits
  // above, which return before this line), so a rider merely opening the
  // scanner or a replayed request never sends a second "payment verified"
  // notification. refRef.id (the reference's own deterministic doc id) is
  // this operation's stable idempotency key — there is no separate
  // deliveryEvents row for a COD verification today.
  const shipmentRef = order.orderNumber ? `order #${order.orderNumber}` : "your order";
  if (order.userId) {
    emitDeliveryNotification(tx, db, {
      type: "COD_PAYMENT_VERIFIED",
      recipient: { role: "customer", userId: order.userId },
      eventId: refRef.id,
      title: "Payment verified",
      message: `Your COD payment for ${shipmentRef} has been verified.`,
      orderId,
      orderNumber: order.orderNumber ?? null,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  if (job.vendorId) {
    emitDeliveryNotification(tx, db, {
      type: "COD_PAYMENT_VERIFIED",
      recipient: { role: "seller", userId: job.vendorId },
      eventId: refRef.id,
      title: "COD payment verified",
      message: `COD payment for ${shipmentRef} has been verified.`,
      orderId,
      orderNumber: order.orderNumber ?? null,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { ok: true, orderId, status: "AwaitingVerification", amount: amountDue, reference };
}
