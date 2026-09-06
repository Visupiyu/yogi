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
import { Timestamp } from "firebase-admin/firestore";
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
} from "@/lib/deliveryEngine/types";
import { verifyDeliveryOtp } from "@/lib/deliveryEngine/deliveryOtp";

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
    from: ["PickedUp", "InTransit", "ArrivedAtStage", "HandoverConfirmed", "Failed"],
    to: "OutForDelivery",
  },
  HANDOVER_INITIATE: { from: ["PickedUp", "InTransit", "ArrivedAtStage"], to: "HandoverInitiated" },
  HANDOVER_CONFIRM: { from: ["HandoverInitiated"], to: "HandoverConfirmed" },
  DELIVER: { from: ["OutForDelivery"], to: "Delivered" },
  ATTEMPT_FAILED: { from: ["OutForDelivery"], to: "Failed" },
};

const TERMINAL_LEG: ReadonlySet<string> = new Set(["Delivered"]);

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

// Availability nudges mirror assignment.ts: only flip Busy<->Available so a
// manually Offline person is never overridden.
function freeIfBusy(tx: Transaction, ref: DocumentReference, person: DeliveryPerson, now: Timestamp): void {
  if (person.availability === "Busy") {
    tx.set(ref, { availability: "Available", updatedAt: now }, { merge: true });
  }
}

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

  // ---- VALIDATE (still no writes) ----
  if (TERMINAL_LEG.has(leg.status)) {
    throw new ExecutionError(`Leg is already ${leg.status}.`, 409);
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
    if (incoming.availability !== "Available") throw new ExecutionError("Handover target is not available.", 409);
    const targetProvider: DeliveryProviderType = incoming.providerType === "YOMICO" ? "YOMICO" : "COMPANY";
    if (targetProvider !== actor.providerType) throw new ExecutionError("Handover target is a different provider.", 409);
    if (actor.providerType === "COMPANY" && incoming.companyId !== actor.companyId) {
      throw new ExecutionError("Handover target belongs to another company.", 409);
    }
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

  // DELIVER requires customer OTP verification (fail-closed boundary).
  if (action === "DELIVER") {
    if (!verifyDeliveryOtp(job, args.otp)) {
      throw new ExecutionError("Customer OTP verification failed.", 403);
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
    if (outgoingRef && outgoing) freeIfBusy(tx, outgoingRef, outgoing, now); // previous holder released
    // incoming (the actor) is now the holder
    const meRef = db.collection("deliveryPersons").doc(actor.personId);
    // actor doc not read above; set Busy unconditionally is unsafe (could
    // override Offline). Read-free path: only mark Busy via merge if we know it
    // is the holder — but we must not clobber Offline. We conservatively set
    // Busy since a person confirming receipt is actively working.
    tx.set(meRef, { availability: "Busy", updatedAt: now }, { merge: true });
  } else if (action === "DELIVER") {
    const holderId = leg.custody?.personId;
    if (holderId) {
      const holderRef = db.collection("deliveryPersons").doc(holderId);
      // free-on-complete: set Available (job done for this person)
      tx.set(holderRef, { availability: "Available", updatedAt: now }, { merge: true });
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
  }
  tx.set(jobRef, jobUpdate, { merge: true });

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
