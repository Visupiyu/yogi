// SERVER-ONLY. Delivery Engine Phase 2B-4 — physical execution & custody.
//
// One transactional entry point, applyScan(), drives every physical transition
// from an authenticated Delivery-App scan. A QR scan is NEVER authorization by
// itself: for every scan the server independently establishes
//   authenticated Firebase actor -> actor identity/type -> company ownership
//   -> job (from scanToken) -> current leg -> expected action -> current custody
//   -> legal state transition,
// and only then writes. Custody changes ONLY via PICKUP, HANDOVER_CONFIRM and
// DELIVER — never by editing assignedPersonId directly (decision M7).
//
// All reads and validations complete BEFORE any write. Idempotent: a scan whose
// deterministic event id already exists is a no-op (offline replays / retries).
// Server `at` is authoritative; client capturedAt is evidence only, and a late
// offline event is applied only if its transition is still legal — otherwise it
// is rejected (it never overrides the authoritative FSM). No money/inventory/
// earnings fields are read or written.
import type {
  Transaction,
  Firestore,
  DocumentReference,
} from "firebase-admin/firestore";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryPerson,
  DeliveryLegStatus,
  DeliveryProviderType,
  DeliveryEvent,
  DeliveryExceptionCode,
  ExecutionAction,
  CustodyState,
  CustodyHolderKind,
  DeliveryPod,
} from "@/lib/deliveryEngine/types";
import { classifyDeliveryOtp } from "@/lib/deliveryEngine/deliveryOtp";
import { PAY_ON_DELIVERY_UPI } from "@/lib/deliveryEngine/codPayment";
import { emitDeliveryNotification, readCustomerUid } from "@/lib/deliveryEngine/notifications";
import { hasOtherActiveJobs, releaseAfterLosingJob } from "@/lib/deliveryEngine/assignment";

export class ExecutionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ExecutionError";
    this.status = status;
  }
}

export type ScanActor = {
  uid: string;
  personId: string;
  providerType: DeliveryProviderType;
  companyId: string | null;
};

export type ScanEvidence = {
  clientEventId: string;
  capturedAt?: unknown | null;
  geo?: { lat: number; lng: number } | null;
  geoAccuracy?: number | null;
  deviceId?: string | null;
};

export type ScanArgs = {
  jobId: string;
  scanToken: string;
  action: ExecutionAction;
  actor: ScanActor;
  evidence: ScanEvidence;
  handoverToPersonId?: string | null; // HANDOVER_INITIATE
  otp?: string | null; // DELIVER
  exceptionCode?: DeliveryExceptionCode | null; // ATTEMPT_FAILED / EXCEPTION
  notes?: string | null;
};

export type ScanResult = {
  applied: boolean;
  idempotent?: boolean;
  // DELIVER only: true when customer-OTP verification failed. The shipment is
  // NOT delivered (stays OutForDelivery); only the attempt counter may have
  // been incremented. The route translates this to a generic 403.
  otpFailed?: boolean;
  action: ExecutionAction;
  jobId: string;
  legId: string;
  legStatus: DeliveryLegStatus;
  jobStatus: string;
  custody: CustodyState | null;
};

const EXCEPTION_CODES: ReadonlySet<string> = new Set([
  "SELLER_UNAVAILABLE",
  "CUSTOMER_UNAVAILABLE",
  "DAMAGED_PACKAGE",
  "WRONG_PACKAGE",
  "WRONG_SHIPMENT_SCAN",
  "FAILED_PICKUP",
  "FAILED_DELIVERY",
  "HANDOVER_TIMEOUT",
  "PERSON_UNAVAILABLE",
  // Delivery Failure/Exception Handling V1 (see deliveryException.ts) — kept
  // in sync with types.ts's DeliveryExceptionCode union so this scan-path
  // validation and the new rider-facing endpoint never diverge.
  "CUSTOMER_REFUSED",
  "ADDRESS_PROBLEM",
  "COD_PAYMENT_FAILED",
  "OTP_VERIFICATION_FAILED",
  "OTHER",
]);

// Legal leg-status preconditions per action. EXCEPTION is allowed from any
// non-terminal state and does not itself change the status.
const TRANSITIONS: Record<
  Exclude<ExecutionAction, "EXCEPTION">,
  { from: readonly DeliveryLegStatus[]; to: DeliveryLegStatus }
> = {
  PICKUP: { from: ["Assigned", "Started"], to: "PickedUp" },
  DEPART: { from: ["PickedUp", "HandoverConfirmed"], to: "InTransit" },
  ARRIVE: { from: ["InTransit"], to: "ArrivedAtStage" },
  OUT_FOR_DELIVERY: {
    // "Assigned" supports the COMPANY_HUB final-mile leg, which is created by the
    // dispatcher's final-mile assignment with status "Assigned" AND custody
    // already on the rider (a hybrid state no scan produces). It is DIRECT-safe:
    // OUT_FOR_DELIVERY changes no custody and is gated below by
    // `leg.custody?.personId === actor.personId`, so any ordinary "Assigned" leg
    // (custody.personId === null until a PICKUP/HANDOVER_CONFIRM scan, which both
    // leave "Assigned") is still rejected — only the final-mile leg, which holds
    // rider custody at "Assigned", can use this source.
    from: ["Assigned", "PickedUp", "InTransit", "ArrivedAtStage", "HandoverConfirmed", "Failed"],
    to: "OutForDelivery",
  },
  HANDOVER_INITIATE: { from: ["PickedUp", "InTransit", "ArrivedAtStage"], to: "HandoverInitiated" },
  HANDOVER_CONFIRM: { from: ["HandoverInitiated"], to: "HandoverConfirmed" },
  DELIVER: { from: ["OutForDelivery"], to: "Delivered" },
  ATTEMPT_FAILED: { from: ["OutForDelivery"], to: "Failed" },
};

const TERMINAL_LEG: ReadonlySet<string> = new Set(["Delivered"]);

// Physical delivery model. DERIVED, not a new persisted field: YOMICO's own
// workforce delivers direct (SELLER -> person -> CUSTOMER, no hub/transit),
// while an external COMPANY runs the hub/transit model. An explicit
// job.deliveryModel is honored if a future writer ever sets it; otherwise it is
// derived from providerType (null only before assignment, before any
// transit/handover action is reachable).
type PhysicalDeliveryModel = "YOMICO_DIRECT" | "COMPANY_HUB";
function deliveryModelOf(job: DeliveryJob): PhysicalDeliveryModel {
  const explicit = (job as { deliveryModel?: unknown }).deliveryModel;
  if (explicit === "YOMICO_DIRECT" || explicit === "COMPANY_HUB") return explicit;
  return job.providerType === "COMPANY" ? "COMPANY_HUB" : "YOMICO_DIRECT";
}

// YOMICO Direct is a two-hop journey with ONE person holding custody from pickup
// to the customer: no hub, no line-haul transit, and no handoff to a second
// person. These actions are therefore never valid for it and are rejected
// server-side (not merely hidden in the app). The COMPANY hub model is left
// unrestricted for its future multi-leg journey.
const YOMICO_DIRECT_FORBIDDEN: ReadonlySet<ExecutionAction> = new Set([
  "DEPART",
  "ARRIVE",
  "HANDOVER_INITIATE",
  "HANDOVER_CONFIRM",
]);

function sanitizeId(v: unknown): string {
  return typeof v === "string" ? v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) : "";
}

/** Deterministic event id => idempotent replays address the same document. */
export function scanEventId(legId: string, clientEventId: string): string {
  return `${legId}__scan__${sanitizeId(clientEventId)}`;
}

function normGeo(geo: unknown): { lat: number; lng: number } | null {
  if (geo && typeof geo === "object") {
    const g = geo as { lat?: unknown; lng?: unknown };
    if (typeof g.lat === "number" && typeof g.lng === "number" && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
      return { lat: g.lat, lng: g.lng };
    }
  }
  return null;
}

function s(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

// Availability transitions use the shared multi-parcel helpers from
// assignment.ts (hasOtherActiveJobs / releaseAfterLosingJob): a person returns
// to Available only when they hold no OTHER active job.

export async function applyScan(
  tx: Transaction,
  db: Firestore,
  args: ScanArgs
): Promise<ScanResult> {
  const { action, actor, evidence } = args;
  const clientEventId = sanitizeId(evidence.clientEventId);
  if (!clientEventId) throw new ExecutionError("Missing or invalid clientEventId.", 400);

  // ---- READS ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  // The QR token resolves the job but is not authorization; it must match.
  if (!job.scanToken || job.scanToken !== args.scanToken) {
    throw new ExecutionError("Invalid shipment token.", 403);
  }
  const legId = job.currentLegId;
  if (!legId) throw new ExecutionError("Job has no current leg.", 409);

  const legRef = jobRef.collection("legs").doc(legId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency: deterministic event id — a replay is a no-op.
  const eventRef = db.collection("deliveryEvents").doc(scanEventId(legId, clientEventId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    return {
      applied: false,
      idempotent: true,
      action,
      jobId: args.jobId,
      legId,
      legStatus: leg.status,
      jobStatus: job.status,
      custody: leg.custody ?? null,
    };
  }

  // Reads that some actions need (target/old person for availability + eligibility).
  let incomingRef: DocumentReference | null = null;
  let incoming: DeliveryPerson | null = null;
  let outgoingRef: DocumentReference | null = null;
  let outgoing: DeliveryPerson | null = null;

  if (action === "HANDOVER_INITIATE") {
    const toId = typeof args.handoverToPersonId === "string" ? args.handoverToPersonId.trim() : "";
    if (!toId) throw new ExecutionError("Missing handoverToPersonId.", 400);
    if (toId === actor.personId) throw new ExecutionError("Cannot hand over to yourself.", 409);
    incomingRef = db.collection("deliveryPersons").doc(toId);
    const snap = await tx.get(incomingRef);
    if (!snap.exists) throw new ExecutionError("Handover target not found.", 404);
    incoming = snap.data() as DeliveryPerson;
  }
  if (action === "HANDOVER_CONFIRM") {
    const fromId = leg.handover?.fromPersonId || "";
    if (fromId) {
      outgoingRef = db.collection("deliveryPersons").doc(fromId);
      const snap = await tx.get(outgoingRef);
      outgoing = snap.exists ? (snap.data() as DeliveryPerson) : null;
    }
  }

  // Multi-parcel availability (READ phase): whether a person about to LOSE this
  // job still holds another active job, so the write phase keeps them Busy
  // instead of wrongly flipping to Available.
  let outgoingHasOtherActive = false;
  if (action === "HANDOVER_CONFIRM" && outgoing && leg.handover?.fromPersonId) {
    outgoingHasOtherActive = await hasOtherActiveJobs(tx, db, leg.handover.fromPersonId, args.jobId);
  }
  let deliverHolderRef: DocumentReference | null = null;
  let deliverHolder: DeliveryPerson | null = null;
  let deliverHolderHasOtherActive = false;
  if (action === "DELIVER") {
    const holderId = leg.custody?.personId || "";
    if (holderId) {
      deliverHolderRef = db.collection("deliveryPersons").doc(holderId);
      const hSnap = await tx.get(deliverHolderRef);
      deliverHolder = hSnap.exists ? (hSnap.data() as DeliveryPerson) : null;
      deliverHolderHasOtherActive = await hasOtherActiveJobs(tx, db, holderId, args.jobId);
    }
  }

  // Delivery Notification System V1 — the customer recipient for PICKUP /
  // OUT_FOR_DELIVERY (see below for DELIVER, which reuses its OWN existing
  // order read instead of a second one). A missing/unreadable order degrades
  // to null (no customer notification), never a thrown error.
  let pickupOrTransitCustomerUid: string | null = null;
  if ((action === "PICKUP" || action === "OUT_FOR_DELIVERY") && job.orderId) {
    pickupOrTransitCustomerUid = await readCustomerUid(tx, db, job.orderId);
  }

  // ---- VALIDATE (still no writes) ----
  if (TERMINAL_LEG.has(leg.status)) {
    throw new ExecutionError(`Leg is already ${leg.status}.`, 409);
  }
  // Payment Lifecycle V1 — a Cancelled/Returned order's job must never keep
  // physically executing (a rider must never still scan PICKUP/OUT_FOR_
  // DELIVERY/DELIVER on a sale that no longer exists). Mirrors the SAME
  // TERMINAL_JOB_STATUSES check codPayment.ts and deliveryException.ts
  // already enforce; app/api/cancel-order is the only writer of job.status
  // "Cancelled" (see its own comment on this — a first-class part of
  // cancellation, not a new mechanism).
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
  }

  // Actor <-> provider/company consistency (defense in depth; actor is already
  // server-resolved). A YOMICO actor must be on a YOMICO leg, a company actor
  // on their own company's leg.
  if (leg.providerType && leg.providerType !== actor.providerType) {
    throw new ExecutionError("You are not the provider for this shipment.", 403);
  }
  if (actor.providerType === "COMPANY" && leg.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }

  // Per-action actor authorization.
  if (action === "PICKUP") {
    if (leg.assignedPersonId !== actor.personId) {
      throw new ExecutionError("You are not the assigned person for this shipment.", 403);
    }
  } else if (action === "HANDOVER_CONFIRM") {
    if (leg.handover?.state !== "Initiated" || leg.handover.toPersonId !== actor.personId) {
      throw new ExecutionError("No handover is awaiting your confirmation.", 403);
    }
  } else {
    // DEPART / ARRIVE / OUT_FOR_DELIVERY / HANDOVER_INITIATE / DELIVER /
    // ATTEMPT_FAILED / EXCEPTION: the current physical custody holder acts.
    if (leg.custody?.personId !== actor.personId) {
      throw new ExecutionError("You do not currently hold this shipment.", 403);
    }
  }

  // Handover target eligibility (same provider, Active + Available).
  if (action === "HANDOVER_INITIATE" && incoming) {
    const acct = incoming.accountStatus ?? (incoming.status === "Inactive" ? "Suspended" : "Active");
    if (acct !== "Active") throw new ExecutionError("Handover target is not active.", 409);
    if (incoming.availability === "Offline") throw new ExecutionError("Handover target is offline (off shift).", 409);
    const targetProvider: DeliveryProviderType = incoming.providerType === "YOMICO" ? "YOMICO" : "COMPANY";
    if (targetProvider !== actor.providerType) throw new ExecutionError("Handover target is a different provider.", 409);
    if (actor.providerType === "COMPANY" && incoming.companyId !== actor.companyId) {
      throw new ExecutionError("Handover target belongs to another company.", 409);
    }
  }

  // Physical-model restriction (enforced server-side, not just in the app): a
  // YOMICO Direct job has no transit/hub/handover stages, so DEPART, ARRIVE and
  // HANDOVER are never valid for it — a client cannot drive them regardless of
  // its UI. The COMPANY hub model keeps the full action set.
  if (deliveryModelOf(job) === "YOMICO_DIRECT" && YOMICO_DIRECT_FORBIDDEN.has(action)) {
    throw new ExecutionError(`${action} is not valid for a YOMICO Direct delivery.`, 409);
  }

  // State-transition legality.
  const now = Timestamp.now();
  let newLegStatus: DeliveryLegStatus = leg.status;
  if (action !== "EXCEPTION") {
    const t = TRANSITIONS[action];
    if (!t.from.includes(leg.status)) {
      throw new ExecutionError(`Action ${action} is not allowed from ${leg.status}.`, 409);
    }
    newLegStatus = t.to;
  }

  // COD delivery-completion guard (COD Payment Scan V1): for a Pay-on-Delivery
  // order, DELIVER is rejected outright while payment is still Pending — never
  // bypassed, and checked BEFORE the OTP check below so an unpaid COD attempt
  // never burns an OTP attempt. This is read-only against orders/{orderId}
  // (the authoritative payment record — see codPayment.ts) and writes nothing
  // here; it does not touch custody, OTP or any other delivery state. A
  // non-COD order (paymentMethod !== PAY_ON_DELIVERY_UPI, including no order
  // found / no orderId) is completely unaffected — existing behavior.
  //
  // The same read also feeds the POD projection written below on success (POD
  // Part 1): orderPaymentSnapshot is a small, amount-FREE snapshot
  // (paymentMethod/paymentStatus/paymentTransactionId only — never
  // paymentAmount, never any money field, matching jobFactory.ts's
  // assertNoFinancialFields boundary for every other DeliveryJob field) of
  // exactly what this guard already saw, so POD records "was this COD, and
  // what payment state/reference applied at delivery time" without a second
  // read or a second source of truth.
  let orderPaymentSnapshot: { paymentMethod?: string; paymentStatus?: string; paymentTransactionId?: string | null } | null = null;
  // Delivery Notification System V1 — the DELIVERED notification's customer
  // recipient, read off this SAME order doc (no second read).
  let deliverCustomerUid: string | null = null;
  if (action === "DELIVER" && job.orderId) {
    const orderSnap = await tx.get(db.collection("orders").doc(job.orderId));
    if (orderSnap.exists) {
      const order = orderSnap.data() as { paymentMethod?: string; paymentStatus?: string; paymentTransactionId?: string | null; userId?: string };
      orderPaymentSnapshot = order;
      deliverCustomerUid = typeof order.userId === "string" && order.userId ? order.userId : null;
      if (order.paymentMethod === PAY_ON_DELIVERY_UPI && order.paymentStatus !== "AwaitingVerification" && order.paymentStatus !== "Paid") {
        throw new ExecutionError("COD payment has not been verified yet.", 409);
      }
    }
  }

  // DELIVER requires customer OTP verification (fail-closed boundary). A genuine
  // wrong guess against an active, unlocked OTP is counted DURABLY and the
  // shipment stays OutForDelivery — we return a COMMITTED failure (not a throw)
  // so ONLY the attempt counter persists and no DELIVER state is written (no
  // event, no custody change, no status change, no reconciliation). Missing /
  // expired / locked also fail but are not counted. The caller is never told
  // which case occurred.
  if (action === "DELIVER") {
    const verdict = classifyDeliveryOtp(job, args.otp);
    if (verdict !== "ok") {
      if (verdict === "mismatch") {
        tx.set(jobRef, { deliveryOtpAttempts: FieldValue.increment(1), updatedAt: now }, { merge: true });
      }
      return {
        applied: false,
        idempotent: false,
        otpFailed: true,
        action,
        jobId: args.jobId,
        legId,
        legStatus: leg.status,
        jobStatus: job.status,
        custody: leg.custody ?? null,
      };
    }
  }

  // Exception code validation.
  let exceptionCode: DeliveryExceptionCode | null = null;
  if (action === "EXCEPTION") {
    const code = s(args.exceptionCode, 40);
    if (!EXCEPTION_CODES.has(code)) throw new ExecutionError("Invalid exception code.", 400);
    exceptionCode = code as DeliveryExceptionCode;
  } else if (action === "ATTEMPT_FAILED") {
    const code = s(args.exceptionCode, 40);
    exceptionCode = (EXCEPTION_CODES.has(code) ? code : "FAILED_DELIVERY") as DeliveryExceptionCode;
  }

  // ---- Compute custody + writes ----
  const geo = normGeo(evidence.geo);
  const geoAccuracy = typeof evidence.geoAccuracy === "number" ? evidence.geoAccuracy : null;

  let custodyChange: CustodyState | null = null;
  let handoverRole: "outgoing" | "incoming" | null = null;

  if (action === "PICKUP") {
    custodyChange = {
      holderKind: actor.providerType as CustodyHolderKind,
      personId: actor.personId,
      companyId: actor.companyId,
      since: now,
      sinceEventId: eventRef.id,
    };
  } else if (action === "HANDOVER_CONFIRM" && leg.handover) {
    custodyChange = {
      holderKind: leg.handover.toKind as CustodyHolderKind,
      personId: leg.handover.toPersonId,
      companyId: leg.handover.toCompanyId,
      since: now,
      sinceEventId: eventRef.id,
    };
    handoverRole = "incoming";
  } else if (action === "DELIVER") {
    custodyChange = {
      holderKind: "CUSTOMER",
      personId: null,
      companyId: null,
      since: now,
      sinceEventId: eventRef.id,
    };
  } else if (action === "HANDOVER_INITIATE") {
    handoverRole = "outgoing";
  }

  // ---- WRITES (after all reads) ----
  // 1) availability nudges
  if (action === "HANDOVER_CONFIRM") {
    // Previous holder handed THIS job away — free them ONLY if they hold no
    // other active job (multi-parcel); otherwise they stay Busy.
    if (outgoingRef && outgoing) releaseAfterLosingJob(tx, outgoingRef, outgoing, outgoingHasOtherActive, now);
    // incoming (the actor) is now a holder -> Busy. A person confirming receipt
    // is actively working; merge never clobbers an explicit Offline choice made
    // afterwards, and cannot happen mid-receipt.
    const meRef = db.collection("deliveryPersons").doc(actor.personId);
    tx.set(meRef, { availability: "Busy", updatedAt: now }, { merge: true });
  } else if (action === "DELIVER") {
    // Completed THIS job — return the holder to Available ONLY if no other
    // active job remains (multi-parcel); otherwise they stay Busy.
    if (deliverHolderRef && deliverHolder) {
      releaseAfterLosingJob(tx, deliverHolderRef, deliverHolder, deliverHolderHasOtherActive, now);
    }
  }

  // 2) event (immutable, server-generated, append-only)
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "person",
    providerType: leg.providerType ?? actor.providerType,
    companyId: leg.companyId ?? actor.companyId,
    action,
    fromStage: leg.status,
    toStage: newLegStatus,
    fromStatus: job.status,
    toStatus: action === "PICKUP" ? "InProgress" : action === "DELIVER" ? "Delivered" : job.status,
    personId: actor.personId,
    capturedAt: evidence.capturedAt ?? null,
    geo,
    geoAccuracy,
    deviceId: s(evidence.deviceId, 128) || null,
    handoverRole,
    exceptionCode,
    custodyToKind: custodyChange ? custodyChange.holderKind : null,
    at: now,
    notes: args.notes ? s(args.notes, 500) : null,
    photoPath: null,
    clientEventId,
  };
  tx.set(eventRef, event);

  // 3) leg update
  const legUpdate: Record<string, unknown> = { updatedAt: now };
  if (action !== "EXCEPTION") legUpdate.status = newLegStatus;
  if (custodyChange) legUpdate.custody = custodyChange;
  if (action === "PICKUP") {
    legUpdate.proof = { ...(leg.proof ?? {}), pickup: proofRecord(eventRef.id, now, actor.uid, geo, geoAccuracy) };
  }
  if (action === "DELIVER") {
    legUpdate.proof = {
      ...(leg.proof ?? {}),
      delivery: { ...proofRecord(eventRef.id, now, actor.uid, geo, geoAccuracy), otpVerified: true },
    };
  }
  if (action === "HANDOVER_INITIATE") {
    legUpdate.handover = {
      state: "Initiated",
      fromPersonId: actor.personId,
      toKind: actor.providerType,
      toCompanyId: actor.companyId,
      toPersonId: (args.handoverToPersonId as string).trim(),
      initiatedAt: now,
      initiatedEventId: eventRef.id,
      confirmedAt: null,
      confirmedEventId: null,
    };
  }
  if (action === "HANDOVER_CONFIRM" && leg.handover) {
    legUpdate.handover = { ...leg.handover, state: "Confirmed", confirmedAt: now, confirmedEventId: eventRef.id };
    legUpdate.assignedPersonId = leg.handover.toPersonId; // custody-aware reassignment
    legUpdate.assignedPersonName = incoming?.name ?? s(leg.handover.toPersonId, 200);
  }
  if (action === "ATTEMPT_FAILED") {
    legUpdate.attemptCount = (typeof leg.attemptCount === "number" ? leg.attemptCount : 0) + 1;
    legUpdate.exception = { code: exceptionCode, state: "Open", at: now, eventId: eventRef.id, notes: args.notes ? s(args.notes, 500) : null, resolution: null };
  }
  if (action === "EXCEPTION") {
    legUpdate.exception = { code: exceptionCode, state: "Open", at: now, eventId: eventRef.id, notes: args.notes ? s(args.notes, 500) : null, resolution: null };
  }
  tx.set(legRef, legUpdate, { merge: true });

  // 4) job update (mirrors current leg)
  const jobUpdate: Record<string, unknown> = { lastEventId: eventRef.id, lastEventAt: now, updatedAt: now };
  if (action !== "EXCEPTION") jobUpdate.currentStage = newLegStatus;
  if (custodyChange) jobUpdate.custody = custodyChange;
  if (action === "PICKUP") {
    jobUpdate.status = "InProgress";
    if (!job.executionStartedAt) jobUpdate.executionStartedAt = now;
  }
  if (action === "DELIVER") {
    jobUpdate.status = "Delivered";
    jobUpdate.deliveredAt = now;
    // POD Part 1 — a durable, server-derived proof-of-delivery projection on
    // the SAME write as the custody/status transition above (no second
    // custody mutation, no second event, no second transaction). Every value
    // here comes from the authenticated actor, this leg, or the order doc
    // already read above — NEVER from the client's request body. Amount-free
    // by design (see orderPaymentSnapshot's comment above and
    // jobFactory.ts's assertNoFinancialFields): codPaymentStatus/Reference are
    // state/reference only, never paymentAmount.
    const pod: DeliveryPod = {
      deliveredAt: now,
      deliveredByPersonId: actor.personId,
      eventId: eventRef.id,
      legId,
      otpVerified: true, // DELIVER only ever reaches this line once classifyDeliveryOtp returned "ok"
      codPaymentStatus: orderPaymentSnapshot?.paymentMethod === PAY_ON_DELIVERY_UPI ? orderPaymentSnapshot.paymentStatus ?? null : null,
      codPaymentReference: orderPaymentSnapshot?.paymentMethod === PAY_ON_DELIVERY_UPI ? orderPaymentSnapshot.paymentTransactionId ?? null : null,
    };
    jobUpdate.pod = pod;
  }
  tx.set(jobRef, jobUpdate, { merge: true });

  // Delivery Notification System V1 — derived from THIS authoritative scan
  // event (eventRef.id is the deterministic idempotency key already used
  // above), never from client UI state. Seller recipient is job.vendorId
  // directly (one DeliveryJob == one order+vendor — see jobFactory.ts), no
  // extra read needed. See notifications.ts for the failure-isolation
  // contract (never throws, never blocks this transition).
  if (action === "PICKUP") {
    const shipmentRef = job.orderNumber ? `order #${job.orderNumber}` : `shipment ${job.shipmentNumber}`;
    if (pickupOrTransitCustomerUid) {
      emitDeliveryNotification(tx, db, {
        type: "SHIPMENT_PICKED_UP",
        recipient: { role: "customer", userId: pickupOrTransitCustomerUid },
        eventId: eventRef.id,
        title: "Order picked up",
        message: `Your ${shipmentRef} has been picked up and is on its way.`,
        orderId: job.orderId,
        orderNumber: job.orderNumber,
        sellerOrderId: job.sellerOrderId,
        deliveryJobId: args.jobId,
        now,
      });
    }
    if (job.vendorId) {
      emitDeliveryNotification(tx, db, {
        type: "SHIPMENT_PICKED_UP",
        recipient: { role: "seller", userId: job.vendorId },
        eventId: eventRef.id,
        title: "Shipment picked up",
        message: `Shipment for ${shipmentRef} has been picked up by the delivery partner.`,
        orderId: job.orderId,
        orderNumber: job.orderNumber,
        sellerOrderId: job.sellerOrderId,
        deliveryJobId: args.jobId,
        now,
      });
    }
  } else if (action === "OUT_FOR_DELIVERY") {
    const shipmentRef = job.orderNumber ? `order #${job.orderNumber}` : `shipment ${job.shipmentNumber}`;
    if (pickupOrTransitCustomerUid) {
      emitDeliveryNotification(tx, db, {
        type: "OUT_FOR_DELIVERY",
        recipient: { role: "customer", userId: pickupOrTransitCustomerUid },
        eventId: eventRef.id,
        title: "Out for delivery",
        message: `Your ${shipmentRef} is out for delivery.`,
        orderId: job.orderId,
        orderNumber: job.orderNumber,
        sellerOrderId: job.sellerOrderId,
        deliveryJobId: args.jobId,
        now,
      });
    }
    if (job.vendorId) {
      emitDeliveryNotification(tx, db, {
        type: "OUT_FOR_DELIVERY",
        recipient: { role: "seller", userId: job.vendorId },
        eventId: eventRef.id,
        title: "Out for delivery",
        message: `${shipmentRef} is out for delivery.`,
        orderId: job.orderId,
        orderNumber: job.orderNumber,
        sellerOrderId: job.sellerOrderId,
        deliveryJobId: args.jobId,
        now,
      });
    }
  } else if (action === "DELIVER") {
    const shipmentRef = job.orderNumber ? `order #${job.orderNumber}` : `shipment ${job.shipmentNumber}`;
    if (deliverCustomerUid) {
      emitDeliveryNotification(tx, db, {
        type: "DELIVERED",
        recipient: { role: "customer", userId: deliverCustomerUid },
        eventId: eventRef.id,
        title: "Order delivered",
        message: `Your ${shipmentRef} has been delivered.`,
        orderId: job.orderId,
        orderNumber: job.orderNumber,
        sellerOrderId: job.sellerOrderId,
        deliveryJobId: args.jobId,
        now,
      });
    }
    if (job.vendorId) {
      emitDeliveryNotification(tx, db, {
        type: "DELIVERED",
        recipient: { role: "seller", userId: job.vendorId },
        eventId: eventRef.id,
        title: "Order delivered",
        message: `${shipmentRef} has been delivered.`,
        orderId: job.orderId,
        orderNumber: job.orderNumber,
        sellerOrderId: job.sellerOrderId,
        deliveryJobId: args.jobId,
        now,
      });
    }
  }

  return {
    applied: true,
    action,
    jobId: args.jobId,
    legId,
    legStatus: newLegStatus,
    jobStatus:
      action === "PICKUP" ? "InProgress" : action === "DELIVER" ? "Delivered" : job.status,
    custody: custodyChange ?? leg.custody ?? null,
  };
}

function proofRecord(
  eventId: string,
  at: Timestamp,
  actorUid: string,
  geo: { lat: number; lng: number } | null,
  geoAccuracy: number | null
) {
  return { eventId, at, actorUid, geo, geoAccuracy, photoPath: null, signaturePath: null };
}

// ===========================================================================
// Oversight exceptions (Admin / company / holding-person) — record & resolve.
// The scan endpoint handles a PERSON'S execution exceptions; this covers
// oversight actions and resolution. Events are server-generated + immutable.
// No status/custody change here (recording an exception is not a transition);
// business remediation policy is deliberately left for a future phase.
// ===========================================================================
export type OversightActor = {
  uid: string;
  role: "admin" | "company" | "person";
  companyId?: string | null;
  personId?: string | null;
};

function authorizeOversight(job: DeliveryJob, leg: DeliveryLeg, actor: OversightActor): void {
  if (actor.role === "admin") return;
  if (actor.role === "company") {
    if (job.providerType === "COMPANY" && job.companyId && job.companyId === actor.companyId) return;
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // person
  if (
    actor.personId &&
    (leg.assignedPersonId === actor.personId || leg.custody?.personId === actor.personId)
  ) {
    return;
  }
  throw new ExecutionError("You are not associated with this shipment.", 403);
}

async function loadJobLeg(
  tx: Transaction,
  db: Firestore,
  jobId: string,
  legId: string
): Promise<{ jobRef: DocumentReference; job: DeliveryJob; legRef: DocumentReference; leg: DeliveryLeg }> {
  const jobRef = db.collection("deliveryJobs").doc(jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;
  const legRef = jobRef.collection("legs").doc(legId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Leg not found.", 404);
  return { jobRef, job, legRef, leg: legSnap.data() as DeliveryLeg };
}

export async function recordOversightException(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; legId: string; actor: OversightActor; code: DeliveryExceptionCode; notes?: string | null }
): Promise<{ ok: true; eventId: string }> {
  // ---- READS ----
  const { jobRef, job, legRef, leg } = await loadJobLeg(tx, db, args.jobId, args.legId);
  authorizeOversight(job, leg, args.actor);
  const code = s(args.code, 40);
  if (!EXCEPTION_CODES.has(code)) throw new ExecutionError("Invalid exception code.", 400);

  // ---- WRITES ----
  const now = Timestamp.now();
  const eventRef = db.collection("deliveryEvents").doc();
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: args.legId,
    shipmentNumber: job.shipmentNumber,
    actorUid: args.actor.uid,
    role: args.actor.role,
    providerType: leg.providerType ?? job.providerType ?? null,
    companyId: leg.companyId ?? job.companyId ?? null,
    action: "ExceptionRecorded",
    fromStage: leg.status,
    toStage: leg.status,
    fromStatus: job.status,
    toStatus: job.status,
    personId: args.actor.personId ?? leg.custody?.personId ?? null,
    exceptionCode: code as DeliveryExceptionCode,
    at: now,
    geo: null,
    notes: args.notes ? s(args.notes, 500) : null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);
  tx.set(
    legRef,
    { exception: { code, state: "Open", at: now, eventId: eventRef.id, notes: args.notes ? s(args.notes, 500) : null, resolution: null }, updatedAt: now },
    { merge: true }
  );
  tx.set(jobRef, { lastEventId: eventRef.id, lastEventAt: now, updatedAt: now }, { merge: true });
  return { ok: true, eventId: eventRef.id };
}

export async function resolveException(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; legId: string; actor: OversightActor; resolution?: string | null }
): Promise<{ ok: true; eventId: string }> {
  // ---- READS ----
  const { jobRef, job, legRef, leg } = await loadJobLeg(tx, db, args.jobId, args.legId);
  authorizeOversight(job, leg, args.actor);
  if (!leg.exception || leg.exception.state !== "Open") {
    throw new ExecutionError("No open exception to resolve.", 409);
  }

  // ---- WRITES ----
  const now = Timestamp.now();
  const eventRef = db.collection("deliveryEvents").doc();
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: args.legId,
    shipmentNumber: job.shipmentNumber,
    actorUid: args.actor.uid,
    role: args.actor.role,
    providerType: leg.providerType ?? job.providerType ?? null,
    companyId: leg.companyId ?? job.companyId ?? null,
    action: "ExceptionResolved",
    fromStage: leg.status,
    toStage: leg.status,
    fromStatus: job.status,
    toStatus: job.status,
    personId: args.actor.personId ?? null,
    exceptionCode: leg.exception.code,
    at: now,
    geo: null,
    notes: args.resolution ? s(args.resolution, 500) : null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);
  tx.set(
    legRef,
    { exception: { ...leg.exception, state: "Resolved", resolution: args.resolution ? s(args.resolution, 500) : null }, updatedAt: now },
    { merge: true }
  );
  tx.set(jobRef, { lastEventId: eventRef.id, lastEventAt: now, updatedAt: now }, { merge: true });
  return { ok: true, eventId: eventRef.id };
}
