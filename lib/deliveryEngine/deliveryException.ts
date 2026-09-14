// SERVER-ONLY. Delivery Failure / Exception Handling V1.
//
// Lets the exact final-mile rider currently responsible for a customer
// delivery report that THIS attempt could not be completed right now — NOT a
// cancellation, NOT a refund, NOT a custody change. The shipment stays in a
// recoverable operational state: the SAME "Failed" leg status
// execution.ts's existing ATTEMPT_FAILED scan action already produces, and
// the SAME "Failed" -> "OutForDelivery" reattempt path execution.ts's
// TRANSITIONS table already allows (OUT_FOR_DELIVERY.from includes
// "Failed") — this module deliberately reuses that existing recovery
// mechanism rather than inventing a second one.
//
// Distinct from applyScan's ATTEMPT_FAILED/EXCEPTION actions only in HOW the
// rider is authorized: those are QR-SCAN actions (require job.scanToken) —
// reporting "the customer refused" or "wrong address" is not a scan of
// anything, so this is a plain authenticated action, the same convention
// hubIntake.ts / destinationHandover.ts / codPayment.ts already use for
// their own non-scan rider/hub-person actions. No custody, no OTP, no
// payment field is ever read or written here.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryEvent,
  DeliveryExceptionCode,
  DeliveryPersonRole,
} from "@/lib/deliveryEngine/types";
import { emitDeliveryNotification, readCustomerUid } from "@/lib/deliveryEngine/notifications";

// Customer-safe, fixed copy per reason — NEVER the rider's free-text note
// (args.note), which stays an internal/audit-only field (see the business
// rule in this module's own header). One line per whitelisted reason; OTHER
// is deliberately generic ("could not be completed") rather than inventing a
// specific-sounding excuse for a code that carries none.
const CUSTOMER_SAFE_REASON_TEXT: Record<DeliveryExceptionCode, string> = {
  CUSTOMER_UNAVAILABLE: "you were unavailable at the time of delivery",
  CUSTOMER_REFUSED: "the delivery could not be accepted",
  ADDRESS_PROBLEM: "of an issue with the delivery address",
  COD_PAYMENT_FAILED: "payment could not be completed",
  OTP_VERIFICATION_FAILED: "the delivery code could not be verified",
  OTHER: "of an issue during delivery",
  // Non-customer-delivery codes are never reachable via this module's
  // whitelist (CUSTOMER_DELIVERY_EXCEPTION_REASONS) but are listed so this
  // record stays a total function over DeliveryExceptionCode.
  SELLER_UNAVAILABLE: "of an issue during delivery",
  DAMAGED_PACKAGE: "of an issue during delivery",
  WRONG_PACKAGE: "of an issue during delivery",
  WRONG_SHIPMENT_SCAN: "of an issue during delivery",
  FAILED_PICKUP: "of an issue during delivery",
  FAILED_DELIVERY: "of an issue during delivery",
  HANDOVER_TIMEOUT: "of an issue during delivery",
  PERSON_UNAVAILABLE: "of an issue during delivery",
};

export class DeliveryExceptionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DeliveryExceptionError";
    this.status = status;
  }
}

// A DELIBERATELY NARROWER whitelist than execution.ts's full EXCEPTION_CODES
// (which also covers seller/pickup/handover-side exceptions this rider-facing
// endpoint never deals with) — exactly the reasons a final-mile rider may
// report about a CUSTOMER delivery attempt.
export const CUSTOMER_DELIVERY_EXCEPTION_REASONS: ReadonlySet<DeliveryExceptionCode> = new Set([
  "CUSTOMER_UNAVAILABLE",
  "CUSTOMER_REFUSED",
  "ADDRESS_PROBLEM",
  "COD_PAYMENT_FAILED",
  "OTP_VERIFICATION_FAILED",
  "OTHER",
]);

const TERMINAL_JOB_STATUSES = new Set(["Delivered", "Cancelled", "Returned"]);

// The SAME physical-responsibility rule codPayment.ts's
// isRiderResponsibleForCodPayment enforces for COD verification —
// duplicated (not imported) so this file has no dependency on codPayment.ts's
// internals; both independently encode the SAME real-world rule: the rider
// must currently hold custody of THIS shipment, on its FinalMile leg
// (COMPANY) or its only leg (YOMICO Direct). Rider 1's leg is always type
// "Pickup", never "FinalMile", so is never eligible; a Hub Person is never a
// job's custody holder, so is never eligible either.
function isFinalMileResponsibleRider(job: DeliveryJob, leg: DeliveryLeg | null, actorPersonId: string): boolean {
  if (TERMINAL_JOB_STATUSES.has(job.status)) return false;
  if (!leg || leg.custody?.personId !== actorPersonId) return false;
  if (job.providerType === "COMPANY") return leg.type === "FinalMile";
  return true;
}

export type DeliveryExceptionInfo = {
  // True only while there is something for THIS caller to report: they
  // currently hold final-mile custody AND the leg is OutForDelivery (the same
  // precondition applyDeliveryExceptionReport enforces). Always false for a
  // non-person caller (actorPersonId "").
  canReport: boolean;
  last: { code: DeliveryExceptionCode; reportedAt: unknown; note: string | null } | null;
};

// Read-only projection for the job-detail response — never mutates anything.
export async function readDeliveryExceptionInfo(
  db: Firestore,
  jobId: string,
  job: DeliveryJob,
  actorPersonId: string
): Promise<DeliveryExceptionInfo> {
  let canReport = false;
  if (actorPersonId && job.currentLegId) {
    const legSnap = await db.collection("deliveryJobs").doc(jobId).collection("legs").doc(job.currentLegId).get();
    const leg = legSnap.exists ? (legSnap.data() as DeliveryLeg) : null;
    canReport = isFinalMileResponsibleRider(job, leg, actorPersonId) && leg?.status === "OutForDelivery";
  }
  const last = job.lastDeliveryException
    ? {
        code: job.lastDeliveryException.code,
        reportedAt: job.lastDeliveryException.reportedAt,
        note: job.lastDeliveryException.note ?? null,
      }
    : null;
  return { canReport, last };
}

export type DeliveryExceptionReportActor = {
  uid: string;
  personId: string;
  role?: DeliveryPersonRole;
};

export type DeliveryExceptionReportResult = {
  ok: true;
  jobId: string;
  legId: string;
  legStatus: "Failed";
  code: DeliveryExceptionCode;
  eventId: string;
};

function sanitizeNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().slice(0, 300);
  return trimmed || null;
}

// The one transactional entry point. All reads happen before any write —
// same discipline as execution.ts's applyScan. Idempotent-safe by
// construction: once this succeeds the leg is "Failed" (no longer
// "OutForDelivery"), so an exact repeat (double-tap, retried network
// request) fails the same precondition check below and is cleanly rejected
// rather than recording a second event — never a silent duplicate, never a
// corrupted double-count. A genuinely NEW attempt requires a fresh
// OUT_FOR_DELIVERY scan first, which is its own distinct, already-idempotent
// transition.
export async function applyDeliveryExceptionReport(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; actor: DeliveryExceptionReportActor; reason: string; note?: unknown }
): Promise<DeliveryExceptionReportResult> {
  // HUB_PERSON must never report a customer delivery exception — explicit,
  // even though it is also structurally impossible below (a hub person is
  // never a job's custody holder).
  if (args.actor.role === "HUB_PERSON") {
    throw new DeliveryExceptionError("A hub person cannot report a customer delivery exception.", 403);
  }
  if (!CUSTOMER_DELIVERY_EXCEPTION_REASONS.has(args.reason as DeliveryExceptionCode)) {
    throw new DeliveryExceptionError("Invalid delivery issue reason.", 400);
  }
  const reason = args.reason as DeliveryExceptionCode;
  const note = sanitizeNote(args.note);

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new DeliveryExceptionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  if (job.assignedPersonId !== args.actor.personId) {
    throw new DeliveryExceptionError("You are not the assigned rider for this shipment.", 403);
  }

  const legId = job.currentLegId;
  const legSnap = legId ? await tx.get(jobRef.collection("legs").doc(legId)) : null;
  const leg = legSnap && legSnap.exists ? (legSnap.data() as DeliveryLeg) : null;

  if (!isFinalMileResponsibleRider(job, leg, args.actor.personId)) {
    throw new DeliveryExceptionError("You are not currently responsible for this customer delivery.", 403);
  }
  // leg is guaranteed non-null here (isFinalMileResponsibleRider requires it).
  if (!leg || leg.status !== "OutForDelivery" || !legId) {
    throw new DeliveryExceptionError("A delivery issue can only be reported while out for delivery.", 409);
  }

  // Delivery Notification System V1 — the customer recipient. A missing/
  // unreadable order degrades to null (no customer notification), never a
  // thrown error; the exception is still recorded either way.
  const customerUid = await readCustomerUid(tx, db, job.orderId);

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();
  const eventRef = db.collection("deliveryEvents").doc();
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId,
    shipmentNumber: job.shipmentNumber,
    actorUid: args.actor.uid,
    role: "person",
    providerType: job.providerType ?? null,
    companyId: job.companyId ?? null,
    action: "DeliveryExceptionReported",
    fromStage: "OutForDelivery",
    toStage: "Failed",
    fromStatus: job.status,
    toStatus: job.status, // unchanged — reporting an issue never changes job.status
    personId: args.actor.personId,
    exceptionCode: reason,
    orderId: job.orderId ?? null,
    at: now,
    geo: null,
    notes: note,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  tx.set(
    jobRef.collection("legs").doc(legId),
    {
      status: "Failed",
      attemptCount: (typeof leg.attemptCount === "number" ? leg.attemptCount : 0) + 1,
      exception: { code: reason, state: "Open", at: now, eventId: eventRef.id, notes: note, resolution: null },
      updatedAt: now,
    },
    { merge: true }
  );

  // Job-level: currentStage mirrors the leg (same convention execution.ts
  // uses for every other action); custody/status/deliveredAt/paymentStatus
  // are UNTOUCHED — this never transfers custody, never marks Delivered,
  // never marks a COD payment Paid.
  tx.set(
    jobRef,
    {
      currentStage: "Failed",
      failedAt: now,
      lastEventId: eventRef.id,
      lastEventAt: now,
      lastDeliveryException: {
        code: reason,
        reportedAt: now,
        reportedByPersonId: args.actor.personId,
        note,
        eventId: eventRef.id,
      },
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1 — customer-safe, fixed copy only (see
  // CUSTOMER_SAFE_REASON_TEXT above); the rider's free-text `note` is NEVER
  // included. Seller gets the same fixed reason text without the "we'll
  // retry" customer framing.
  const shipmentRef = job.orderNumber ? `order #${job.orderNumber}` : `shipment ${job.shipmentNumber}`;
  const reasonText = CUSTOMER_SAFE_REASON_TEXT[reason];
  if (customerUid) {
    emitDeliveryNotification(tx, db, {
      type: "DELIVERY_ISSUE",
      recipient: { role: "customer", userId: customerUid },
      eventId: eventRef.id,
      title: "Delivery could not be completed",
      message: `We could not deliver your ${shipmentRef} because ${reasonText}. We'll attempt delivery again soon.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  if (job.vendorId) {
    emitDeliveryNotification(tx, db, {
      type: "DELIVERY_ISSUE",
      recipient: { role: "seller", userId: job.vendorId },
      eventId: eventRef.id,
      title: "Delivery issue reported",
      message: `Delivery of ${shipmentRef} could not be completed because ${reasonText}.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { ok: true, jobId: args.jobId, legId, legStatus: "Failed", code: reason, eventId: eventRef.id };
}
