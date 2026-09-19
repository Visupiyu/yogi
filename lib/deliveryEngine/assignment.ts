// SERVER-ONLY. Delivery Engine Phase 2B-3 — provider assignment primitives.
//
// Gives a Created DeliveryJob a provider (and, where applicable, a person) via
// four transactional operations on the job's CURRENT leg:
//   - assignYomicoPerson   (YOMICO Admin picks a YOMICO person)
//   - handoffToCompany     (YOMICO Admin hands the job to a company; NO person)
//   - assignCompanyPerson  (a company assigns one of its OWN people)
//   - rejectCompanyHandoff (a company declines a handoff)
//
// Locked invariants enforced here:
//   * providerType/companyId mutual exclusion (YOMICO => companyId null,
//     COMPANY => companyId set).
//   * Admin NEVER selects a company person (handoffToCompany takes no personId;
//     it may only FREE a previously-assigned company person on a provider
//     switch/revoke — removal, not selection).
//   * A person must be accountStatus "Active" AND availability "Available",
//     checked inside the SAME transaction, before receiving an assignment; the
//     person is set to "Busy" atomically so two concurrent assigners cannot
//     double-book them.
//   * Assignment is NOT physical custody. currentStage is untouched; status
//     never becomes "InProgress" here (that is the later execution phase).
//   * Financially neutral: no money/inventory/earnings/settlement fields.
//
// All reads and validations complete BEFORE any write (Firestore forbids a read
// after a write). Idempotent: an operation that would not change the current
// assignment writes nothing (no event, no availability churn).
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
  DeliveryCompany,
  DeliveryProviderType,
  DeliveryEvent,
  DeliveryEventRole,
} from "@/lib/deliveryEngine/types";
import { emitDeliveryNotification } from "@/lib/deliveryEngine/notifications";

// ---- Errors (routes map .status to an HTTP code) ----
export class AssignmentError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AssignmentError";
    this.status = status;
  }
}

// Job statuses from which a provider may still be (re)assigned or switched.
// Everything from physical execution onward, plus terminal states, is refused.
const PRE_EXECUTION_STATUSES: ReadonlySet<string> = new Set([
  "Created",
  "OfferedToCompany",
  "AcceptedByCompany",
  "AssignedToYomico",
  "AssignedToCompany",
  "RejectedByCompany",
]);

function assertPreExecution(job: DeliveryJob): void {
  if (!PRE_EXECUTION_STATUSES.has(job.status)) {
    throw new AssignmentError(
      `Job status "${job.status}" can no longer be reassigned.`,
      409
    );
  }
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

// ---- Pure eligibility validators ----

/** Eligible to RECEIVE a new assignment: Active AND not Offline (Available OR Busy — multi-parcel). */
export function assertPersonAssignable(person: DeliveryPerson): void {
  const accountStatus = person.accountStatus ?? (person.status === "Inactive" ? "Suspended" : "Active");
  if (accountStatus !== "Active") {
    throw new AssignmentError("That delivery person is not active.", 409);
  }
  // Multi-parcel model: a rider may hold many active jobs at once, so Busy is
  // NOT a lock. Only an off-shift (Offline) rider is refused new work.
  if (person.availability === "Offline") {
    throw new AssignmentError("That delivery person is offline (off shift).", 409);
  }
}

/** YOMICO person invariant: providerType YOMICO and NO company. */
export function assertYomicoPerson(person: DeliveryPerson): void {
  const providerType: DeliveryProviderType = person.providerType === "YOMICO" ? "YOMICO" : "COMPANY";
  if (providerType !== "YOMICO" || person.companyId) {
    throw new AssignmentError("That person is not a YOMICO delivery person.", 409);
  }
}

/** Company person invariant: belongs to exactly this company. */
export function assertCompanyPerson(person: DeliveryPerson, companyId: string): void {
  if (person.providerType !== "COMPANY" || person.companyId !== companyId) {
    throw new AssignmentError("That delivery person belongs to another company.", 403);
  }
}

/**
 * Origin Hub Person eligible to RECEIVE a shipment at a specific hub
 * (four-actor COMPANY_HUB model, Phase 1): same company, role HUB_PERSON,
 * stationed at exactly this hub, and Active. Unlike assertPersonAssignable,
 * availability is NOT gated here — a hub person works a fixed station, not a
 * one-shipment-at-a-time assignment, so Busy/Available is irrelevant to
 * whether they may receive a parcel.
 */
export function assertHubPerson(person: DeliveryPerson, companyId: string, hubId: string): void {
  if (person.providerType !== "COMPANY" || person.companyId !== companyId) {
    throw new AssignmentError("That delivery person belongs to another company.", 403);
  }
  if (person.role !== "HUB_PERSON" || !person.hubId || person.hubId !== hubId) {
    throw new AssignmentError("That person is not the origin hub person for this shipment.", 403);
  }
  const accountStatus = person.accountStatus ?? (person.status === "Inactive" ? "Suspended" : "Active");
  if (accountStatus !== "Active") {
    throw new AssignmentError("That delivery person is not active.", 409);
  }
}

/**
 * Four-actor invariant (Phase 2): a HUB_PERSON can never also act as a rider
 * on a shipment — enforces "Origin/Destination Hub Person != Rider 2" at every
 * point a company person is selected/confirmed as a delivery rider (absent
 * role defaults to RIDER, so every legacy/YOMICO person passes unaffected).
 */
export function assertRiderPerson(person: DeliveryPerson): void {
  if (person.role === "HUB_PERSON") {
    throw new AssignmentError("A hub person cannot be assigned as a delivery rider.", 409);
  }
}

// ---- Internal helpers ----

type ResolvedJob = { ref: DocumentReference; job: DeliveryJob };

async function readJob(tx: Transaction, db: Firestore, jobId: string): Promise<ResolvedJob> {
  const ref = db.collection("deliveryJobs").doc(jobId);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new AssignmentError("Delivery job not found.", 404);
  return { ref, job: snap.data() as DeliveryJob };
}

function legRef(db: Firestore, jobId: string, legId: string): DocumentReference {
  return db.collection("deliveryJobs").doc(jobId).collection("legs").doc(legId);
}

// ---------------------------------------------------------------------------
// Multi-parcel availability model. A rider may hold MANY active jobs at once,
// so availability is NOT a per-job lock:
//   Offline   = off shift (cannot receive new work)
//   Available = on shift, ZERO active jobs
//   Busy      = on shift, ONE OR MORE active jobs
// A person's active jobs span BOTH families a rider can hold: forward
// deliveryJobs and returnCollectionJobs (separate collections, disjoint ids).
// ---------------------------------------------------------------------------
const FWD_ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set([
  "AssignedToYomico", "AssignedToCompany", "InProgress",
]);
// Exported so the HTTP layer (my-return-jobs) can filter a rider's return
// queue to the SAME "still active" definition this module already enforces —
// never a second, hand-typed copy of this status list.
export const RETURN_ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set([
  "Assigned", "OutForCollection", "Collected", "CollectionFailed",
]);

// TRANSACTION-SAFE: does this person still hold an ACTIVE job OTHER than
// excludeJobId? MUST be awaited during the caller's READ phase (before any
// write) so the query joins the transaction and a concurrent assignment/
// completion serialises against it instead of racing a client-side count.
export async function hasOtherActiveJobs(
  tx: Transaction,
  db: Firestore,
  personId: string,
  excludeJobId: string
): Promise<boolean> {
  const [fwd, ret] = await Promise.all([
    tx.get(db.collection("deliveryJobs").where("assignedPersonId", "==", personId)),
    tx.get(db.collection("returnCollectionJobs").where("assignedPersonId", "==", personId)),
  ]);
  const anyFwd = fwd.docs.some(
    (d) => d.id !== excludeJobId && FWD_ACTIVE_JOB_STATUSES.has((d.data() as { status?: string }).status || "")
  );
  const anyRet = ret.docs.some(
    (d) => d.id !== excludeJobId && RETURN_ACTIVE_JOB_STATUSES.has((d.data() as { status?: string }).status || "")
  );
  return anyFwd || anyRet;
}

// Release a person who has just LOST one job: back to Available ONLY when no
// other active job remains (else stay Busy). Never overrides a manual Offline.
// hasOthers MUST come from hasOtherActiveJobs read during the READ phase.
export function releaseAfterLosingJob(
  tx: Transaction,
  ref: DocumentReference,
  person: DeliveryPerson,
  hasOthers: boolean,
  now: Timestamp
): void {
  if (person.availability === "Busy" && !hasOthers) {
    tx.set(ref, { availability: "Available", updatedAt: now }, { merge: true });
  }
}

// Free the previously-assigned person on a reassignment/removal. The active-job
// probe is READ here — every call site invokes this at the very start of its
// write phase (all prior reads done, no tx.set yet), so the internal read is
// still legal before the subsequent assignment writes.
async function releaseOldPerson(
  tx: Transaction,
  db: Firestore,
  ref: DocumentReference,
  person: DeliveryPerson,
  personId: string,
  excludeJobId: string,
  now: Timestamp
): Promise<void> {
  const hasOthers = await hasOtherActiveJobs(tx, db, personId, excludeJobId);
  releaseAfterLosingJob(tx, ref, person, hasOthers, now);
}

function writeAssignmentEvent(
  tx: Transaction,
  db: Firestore,
  args: {
    job: DeliveryJob;
    jobId: string;
    legId: string | null;
    actorUid: string;
    role: DeliveryEventRole;
    providerType: DeliveryProviderType | null;
    companyId: string | null;
    personId: string | null;
    action: string;
    fromStatus: string;
    toStatus: string;
    notes?: string | null;
    now: Timestamp;
  }
): string {
  const eventRef = db.collection("deliveryEvents").doc(); // server-generated, append-only
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: args.legId,
    shipmentNumber: args.job.shipmentNumber,
    actorUid: args.actorUid,
    role: args.role,
    providerType: args.providerType,
    companyId: args.companyId,
    action: args.action,
    // Assignment is not custody: the physical stage does not move.
    fromStage: args.job.currentStage,
    toStage: args.job.currentStage,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    personId: args.personId,
    at: args.now,
    geo: null,
    notes: args.notes ?? null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);
  return eventRef.id;
}

// ===========================================================================
// 1) Admin -> YOMICO person
// ===========================================================================
export async function assignYomicoPerson(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; personId: string; adminUid: string }
): Promise<{ changed: boolean; jobId: string; personId: string }> {
  // ---- READS ----
  const { ref: jobRef, job } = await readJob(tx, db, args.jobId);
  if (!job.currentLegId) throw new AssignmentError("Job has no current leg.", 409);
  assertPreExecution(job);

  // Idempotent: already assigned to exactly this YOMICO person.
  if (job.providerType === "YOMICO" && job.assignedPersonId === args.personId) {
    return { changed: false, jobId: args.jobId, personId: args.personId };
  }

  const lRef = legRef(db, args.jobId, job.currentLegId);
  const legSnap = await tx.get(lRef);
  if (!legSnap.exists) throw new AssignmentError("Current leg not found.", 409);

  const personRef = db.collection("deliveryPersons").doc(args.personId);
  const personSnap = await tx.get(personRef);
  if (!personSnap.exists) throw new AssignmentError("Delivery person not found.", 404);
  const person = personSnap.data() as DeliveryPerson;

  // Old person to free (a different YOMICO person, or a company person we are
  // switching away from — removal on provider switch, never selection).
  let oldRef: DocumentReference | null = null;
  let oldPerson: DeliveryPerson | null = null;
  if (job.assignedPersonId && job.assignedPersonId !== args.personId) {
    oldRef = db.collection("deliveryPersons").doc(job.assignedPersonId);
    const oldSnap = await tx.get(oldRef);
    oldPerson = oldSnap.exists ? (oldSnap.data() as DeliveryPerson) : null;
  }

  // ---- VALIDATE ----
  assertYomicoPerson(person);
  assertPersonAssignable(person);

  // ---- WRITES ----
  const now = Timestamp.now();
  if (oldRef && oldPerson) await releaseOldPerson(tx, db, oldRef, oldPerson, job.assignedPersonId as string, args.jobId, now);
  tx.set(personRef, { availability: "Busy", updatedAt: now }, { merge: true });

  tx.set(
    lRef,
    {
      providerType: "YOMICO",
      companyId: null,
      assignedPersonId: args.personId,
      status: "Assigned",
      assignedPersonName: str(person.name),
      assignedAt: now,
      assignedBy: args.adminUid,
      updatedAt: now,
    },
    { merge: true }
  );

  const eventId = writeAssignmentEvent(tx, db, {
    job,
    jobId: args.jobId,
    legId: job.currentLegId,
    actorUid: args.adminUid,
    role: "admin",
    providerType: "YOMICO",
    companyId: null,
    personId: args.personId,
    action: "AssignedToYomico",
    fromStatus: job.status,
    toStatus: "AssignedToYomico",
    now,
  });

  tx.set(
    jobRef,
    {
      providerType: "YOMICO",
      companyId: null,
      status: "AssignedToYomico",
      responsibleParty: { kind: "YOMICO", companyId: null, personId: args.personId },
      assignedPersonId: args.personId,
      assignedPersonName: str(person.name),
      assignedPersonPhone: str(person.phone, 40),
      assignedCompanyName: null,
      assignedAt: now,
      assignedBy: args.adminUid,
      lastEventId: eventId,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1 — internal, delivery-person-only signal
  // (never a customer/seller notification: Rider 1/first-mile assignment is
  // an internal handoff mechanic, per the Company Job rule in the spec).
  if (person.uid) {
    emitDeliveryNotification(tx, db, {
      type: "DELIVERY_JOB_ASSIGNED",
      recipient: { role: "delivery_person", userId: person.uid },
      eventId,
      title: "New delivery assigned",
      message: `A new delivery (shipment ${job.shipmentNumber}) has been assigned to you.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { changed: true, jobId: args.jobId, personId: args.personId };
}

// ===========================================================================
// 2) Admin -> Company handoff (NO person is chosen by Admin)
// ===========================================================================
export async function handoffToCompany(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; companyId: string; adminUid: string }
): Promise<{ changed: boolean; jobId: string; companyId: string }> {
  // ---- READS ----
  const { ref: jobRef, job } = await readJob(tx, db, args.jobId);
  if (!job.currentLegId) throw new AssignmentError("Job has no current leg.", 409);
  assertPreExecution(job);

  // Idempotent: already offered to this exact company with no person yet.
  if (
    job.providerType === "COMPANY" &&
    job.companyId === args.companyId &&
    !job.assignedPersonId &&
    job.status === "OfferedToCompany"
  ) {
    return { changed: false, jobId: args.jobId, companyId: args.companyId };
  }

  const lRef = legRef(db, args.jobId, job.currentLegId);
  const legSnap = await tx.get(lRef);
  if (!legSnap.exists) throw new AssignmentError("Current leg not found.", 409);

  const companyRef = db.collection("deliveryCompanies").doc(args.companyId);
  const companySnap = await tx.get(companyRef);
  if (!companySnap.exists) throw new AssignmentError("Delivery company not found.", 404);
  const company = companySnap.data() as DeliveryCompany;

  // A person currently on the job (YOMICO person, or a company person we are
  // switching away from) is freed — removal, never selection.
  let oldRef: DocumentReference | null = null;
  let oldPerson: DeliveryPerson | null = null;
  if (job.assignedPersonId) {
    oldRef = db.collection("deliveryPersons").doc(job.assignedPersonId);
    const oldSnap = await tx.get(oldRef);
    oldPerson = oldSnap.exists ? (oldSnap.data() as DeliveryPerson) : null;
  }

  // ---- VALIDATE ----
  if (company.status !== "Active") {
    throw new AssignmentError("That delivery company is not active.", 409);
  }

  // ---- WRITES ----
  const now = Timestamp.now();
  if (oldRef && oldPerson) await releaseOldPerson(tx, db, oldRef, oldPerson, job.assignedPersonId as string, args.jobId, now);

  tx.set(
    lRef,
    {
      providerType: "COMPANY",
      companyId: args.companyId,
      assignedPersonId: null,
      status: "LegCreated",
      assignedPersonName: null,
      assignedAt: null,
      assignedBy: args.adminUid,
      updatedAt: now,
    },
    { merge: true }
  );

  const eventId = writeAssignmentEvent(tx, db, {
    job,
    jobId: args.jobId,
    legId: job.currentLegId,
    actorUid: args.adminUid,
    role: "admin",
    providerType: "COMPANY",
    companyId: args.companyId,
    personId: null,
    action: "OfferedToCompany",
    fromStatus: job.status,
    toStatus: "OfferedToCompany",
    now,
  });

  tx.set(
    jobRef,
    {
      providerType: "COMPANY",
      companyId: args.companyId,
      status: "OfferedToCompany",
      responsibleParty: { kind: "COMPANY", companyId: args.companyId, personId: null },
      assignedPersonId: null,
      assignedPersonName: null,
      assignedPersonPhone: null,
      assignedCompanyName: str(company.name),
      assignedAt: now,
      assignedBy: args.adminUid,
      lastEventId: eventId,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { changed: true, jobId: args.jobId, companyId: args.companyId };
}

// ===========================================================================
// 2a) Company -> ACCEPT a handoff (Phase 2A)
// Explicit acceptance step: the company acknowledges the offer BEFORE assigning
// one of its own people. No leg / person / custody / stage change — this only
// advances the job OfferedToCompany -> AcceptedByCompany so assignment can
// follow. Rejection is available from OfferedToCompany only (see
// rejectCompanyHandoff); once accepted or assigned the job can no longer be
// rejected. Idempotent: re-accepting an accepted job is a no-op.
// ===========================================================================
export async function acceptCompanyHandoff(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; companyId: string; actorUid: string }
): Promise<{ changed: boolean; jobId: string }> {
  // ---- READS ----
  const { ref: jobRef, job } = await readJob(tx, db, args.jobId);
  if (!job.currentLegId) throw new AssignmentError("Job has no current leg.", 409);

  // Ownership: the job must belong to THIS company.
  if (job.providerType !== "COMPANY" || job.companyId !== args.companyId) {
    throw new AssignmentError("This job is not assigned to your company.", 403);
  }

  // Idempotent: already accepted (and not yet assigned) is a no-op success.
  if (job.status === "AcceptedByCompany") {
    return { changed: false, jobId: args.jobId };
  }

  // Only an outstanding offer may be accepted. Anything else (already assigned,
  // in progress, rejected, terminal, …) is refused — acceptance is the FIRST
  // company response to a fresh handoff.
  if (job.status !== "OfferedToCompany") {
    throw new AssignmentError(`Job status "${job.status}" cannot be accepted.`, 409);
  }

  // ---- WRITES ----
  // Acceptance is not custody and not assignment: no leg, person, responsibleParty
  // or stage change. Only the job status advances, with an append-only event.
  const now = Timestamp.now();
  const eventId = writeAssignmentEvent(tx, db, {
    job,
    jobId: args.jobId,
    legId: job.currentLegId,
    actorUid: args.actorUid,
    role: "company",
    providerType: "COMPANY",
    companyId: args.companyId,
    personId: null,
    action: "AcceptedByCompany",
    fromStatus: job.status,
    toStatus: "AcceptedByCompany",
    now,
  });

  tx.set(
    jobRef,
    {
      status: "AcceptedByCompany",
      lastEventId: eventId,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { changed: true, jobId: args.jobId };
}

// ===========================================================================
// 3) Company -> its OWN person
// ===========================================================================
export async function assignCompanyPerson(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; personId: string; companyId: string; actorUid: string }
): Promise<{ changed: boolean; jobId: string; personId: string }> {
  // ---- READS ----
  const { ref: jobRef, job } = await readJob(tx, db, args.jobId);
  if (!job.currentLegId) throw new AssignmentError("Job has no current leg.", 409);

  // Ownership: the job must belong to THIS company.
  if (job.providerType !== "COMPANY" || job.companyId !== args.companyId) {
    throw new AssignmentError("This job is not assigned to your company.", 403);
  }
  // Phase 2A: the company must ACCEPT the offer before it can assign one of its
  // own people, so OfferedToCompany no longer jumps straight to AssignedToCompany.
  // AssignedToCompany stays allowed so an already-assigned job can be reassigned.
  if (job.status !== "AcceptedByCompany" && job.status !== "AssignedToCompany") {
    throw new AssignmentError(
      job.status === "OfferedToCompany"
        ? "Accept this handoff before assigning a delivery person."
        : `Job status "${job.status}" cannot be assigned by the company.`,
      409
    );
  }

  // Idempotent: already assigned to exactly this person.
  if (job.status === "AssignedToCompany" && job.assignedPersonId === args.personId) {
    return { changed: false, jobId: args.jobId, personId: args.personId };
  }

  const lRef = legRef(db, args.jobId, job.currentLegId);
  const legSnap = await tx.get(lRef);
  if (!legSnap.exists) throw new AssignmentError("Current leg not found.", 409);

  const personRef = db.collection("deliveryPersons").doc(args.personId);
  const personSnap = await tx.get(personRef);
  if (!personSnap.exists) throw new AssignmentError("Delivery person not found.", 404);
  const person = personSnap.data() as DeliveryPerson;

  let oldRef: DocumentReference | null = null;
  let oldPerson: DeliveryPerson | null = null;
  if (job.assignedPersonId && job.assignedPersonId !== args.personId) {
    oldRef = db.collection("deliveryPersons").doc(job.assignedPersonId);
    const oldSnap = await tx.get(oldRef);
    oldPerson = oldSnap.exists ? (oldSnap.data() as DeliveryPerson) : null;
  }

  // ---- VALIDATE ----
  assertCompanyPerson(person, args.companyId);
  assertRiderPerson(person); // never a HUB_PERSON (else 409) — four-actor invariant (Phase 5)
  assertPersonAssignable(person);

  // ---- WRITES ----
  const now = Timestamp.now();
  if (oldRef && oldPerson) await releaseOldPerson(tx, db, oldRef, oldPerson, job.assignedPersonId as string, args.jobId, now);
  tx.set(personRef, { availability: "Busy", updatedAt: now }, { merge: true });

  tx.set(
    lRef,
    {
      providerType: "COMPANY",
      companyId: args.companyId,
      assignedPersonId: args.personId,
      status: "Assigned",
      assignedPersonName: str(person.name),
      assignedAt: now,
      assignedBy: args.actorUid,
      updatedAt: now,
    },
    { merge: true }
  );

  const eventId = writeAssignmentEvent(tx, db, {
    job,
    jobId: args.jobId,
    legId: job.currentLegId,
    actorUid: args.actorUid,
    role: "company",
    providerType: "COMPANY",
    companyId: args.companyId,
    personId: args.personId,
    action: "AssignedToCompany",
    fromStatus: job.status,
    toStatus: "AssignedToCompany",
    now,
  });

  tx.set(
    jobRef,
    {
      status: "AssignedToCompany",
      responsibleParty: { kind: "COMPANY", companyId: args.companyId, personId: args.personId },
      assignedPersonId: args.personId,
      assignedPersonName: str(person.name),
      assignedPersonPhone: str(person.phone, 40),
      assignedAt: now,
      assignedBy: args.actorUid,
      lastEventId: eventId,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1 — internal, delivery-person-only signal
  // (never a customer/seller notification — see the note on assignYomicoPerson).
  if (person.uid) {
    emitDeliveryNotification(tx, db, {
      type: "DELIVERY_JOB_ASSIGNED",
      recipient: { role: "delivery_person", userId: person.uid },
      eventId,
      title: "New delivery assigned",
      message: `A new delivery (shipment ${job.shipmentNumber}) has been assigned to you.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { changed: true, jobId: args.jobId, personId: args.personId };
}

// ===========================================================================
// 4) Company -> reject handoff
// ===========================================================================
export async function rejectCompanyHandoff(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; companyId: string; actorUid: string; reason?: string }
): Promise<{ changed: boolean; jobId: string }> {
  // ---- READS ----
  const { ref: jobRef, job } = await readJob(tx, db, args.jobId);
  if (!job.currentLegId) throw new AssignmentError("Job has no current leg.", 409);

  if (job.providerType !== "COMPANY" || job.companyId !== args.companyId) {
    throw new AssignmentError("This job is not assigned to your company.", 403);
  }
  // Approved state machine: a company may decline only an OUTSTANDING OFFER.
  // Once it has accepted (AcceptedByCompany) or assigned (AssignedToCompany) the
  // job it can no longer reject — there is no reject/cancel after acceptance.
  if (job.status !== "OfferedToCompany") {
    throw new AssignmentError(`Job status "${job.status}" cannot be rejected.`, 409);
  }

  const lRef = legRef(db, args.jobId, job.currentLegId);
  const legSnap = await tx.get(lRef);
  if (!legSnap.exists) throw new AssignmentError("Current leg not found.", 409);

  let oldRef: DocumentReference | null = null;
  let oldPerson: DeliveryPerson | null = null;
  if (job.assignedPersonId) {
    oldRef = db.collection("deliveryPersons").doc(job.assignedPersonId);
    const oldSnap = await tx.get(oldRef);
    oldPerson = oldSnap.exists ? (oldSnap.data() as DeliveryPerson) : null;
  }

  // ---- WRITES ----
  const now = Timestamp.now();
  if (oldRef && oldPerson) await releaseOldPerson(tx, db, oldRef, oldPerson, job.assignedPersonId as string, args.jobId, now);

  // Provider is removed; the job returns to an unassigned state awaiting a new
  // Admin decision, with the rejection recorded on its status + the event.
  tx.set(
    lRef,
    {
      providerType: null,
      companyId: null,
      assignedPersonId: null,
      status: "LegCreated",
      assignedPersonName: null,
      assignedAt: null,
      assignedBy: args.actorUid,
      updatedAt: now,
    },
    { merge: true }
  );

  const eventId = writeAssignmentEvent(tx, db, {
    job,
    jobId: args.jobId,
    legId: job.currentLegId,
    actorUid: args.actorUid,
    role: "company",
    providerType: null,
    companyId: args.companyId,
    personId: null,
    action: "RejectedByCompany",
    fromStatus: job.status,
    toStatus: "RejectedByCompany",
    notes: args.reason ? str(args.reason, 500) : null,
    now,
  });

  tx.set(
    jobRef,
    {
      providerType: null,
      companyId: null,
      status: "RejectedByCompany",
      responsibleParty: null,
      assignedPersonId: null,
      assignedPersonName: null,
      assignedPersonPhone: null,
      assignedCompanyName: null,
      assignedAt: now,
      assignedBy: args.actorUid,
      lastEventId: eventId,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { changed: true, jobId: args.jobId };
}

// ===========================================================================
// 5) Rider -> ACCEPT / REJECT an assignment (Rider Assignment Response)
// A rider responds to a COMPANY assignment on the SAME Company Job — an action
// on the assigned PICKUP leg/person, never a new job and never a company-level
// reject. Accept advances the pickup leg Assigned -> Started (job.status stays
// AssignedToCompany); PICKUP already accepts a "Started" leg, so nothing else
// changes. Reject releases the rider (pickup leg -> LegCreated, job ->
// AcceptedByCompany, company ownership KEPT) so the company can assign another
// rider via assignCompanyPerson. Scoped to the PICKUP leg only — never a
// FinalMile leg (whose "Assigned" status gates the destination handover).
// ===========================================================================

// Pickup-leg statuses that mean physical execution has begun (past acceptance).
// Accept is a safe no-op from these; reject is refused (custody has moved).
const EXECUTION_LEG_STATUSES: ReadonlySet<string> = new Set([
  "PickedUp", "InTransit", "ArrivedAtStage", "HandoverInitiated",
  "HandoverConfirmed", "OutForDelivery", "Delivered", "Failed", "Rescheduled",
]);

export async function acceptRiderAssignment(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; personId: string; actorUid: string }
): Promise<{ changed: boolean; jobId: string }> {
  // ---- READS ----
  const { ref: jobRef, job } = await readJob(tx, db, args.jobId);
  if (!job.currentLegId) throw new AssignmentError("Job has no current leg.", 409);

  // Authorization: only the currently-assigned rider may respond, and only on a
  // COMPANY-provider job. Ownership (companyId/providerType) is never changed.
  if (!job.assignedPersonId) {
    throw new AssignmentError("No rider is assigned to this job.", 409);
  }
  if (job.assignedPersonId !== args.personId) {
    throw new AssignmentError("This assignment is not yours.", 403);
  }
  if (job.providerType !== "COMPANY") {
    throw new AssignmentError("Rider acceptance applies only to company assignments.", 409);
  }

  const lRef = legRef(db, args.jobId, job.currentLegId);
  const legSnap = await tx.get(lRef);
  if (!legSnap.exists) throw new AssignmentError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Scope: the PICKUP leg only. Never touch a FinalMile leg (its "Assigned"
  // status gates the destination handover) or any other leg.
  if (leg.type !== "Pickup") {
    throw new AssignmentError("Rider acceptance applies only to the pickup assignment.", 409);
  }

  // Idempotent: already accepted.
  if (leg.status === "Started") {
    return { changed: false, jobId: args.jobId };
  }
  // Already executing (picked up or beyond): acceptance is moot -> safe no-op.
  if (job.status === "InProgress" || EXECUTION_LEG_STATUSES.has(leg.status)) {
    return { changed: false, jobId: args.jobId };
  }
  // Otherwise the only acceptable state is a fresh company assignment.
  if (job.status !== "AssignedToCompany" || leg.status !== "Assigned") {
    throw new AssignmentError(`This assignment cannot be accepted from status "${job.status}" / leg "${leg.status}".`, 409);
  }

  // ---- WRITES ----
  // Acceptance is not custody: only the pickup leg advances Assigned -> Started.
  // job.status, assignedPersonId, responsibleParty, companyId and currentStage
  // all stay exactly as the company set them.
  const now = Timestamp.now();
  tx.set(lRef, { status: "Started", updatedAt: now }, { merge: true });

  const eventId = writeAssignmentEvent(tx, db, {
    job,
    jobId: args.jobId,
    legId: job.currentLegId,
    actorUid: args.actorUid,
    role: "person",
    providerType: "COMPANY",
    companyId: job.companyId ?? null,
    personId: args.personId,
    action: "RiderAcceptedAssignment",
    fromStatus: "AssignedToCompany",
    toStatus: "AssignedToCompany",
    now,
  });

  // Link the event on the job for audit; status/assignment are untouched.
  tx.set(jobRef, { lastEventId: eventId, lastEventAt: now, updatedAt: now }, { merge: true });

  return { changed: true, jobId: args.jobId };
}

export async function rejectRiderAssignment(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; personId: string; actorUid: string; reason?: string }
): Promise<{ changed: boolean; jobId: string }> {
  // ---- READS ----
  const { ref: jobRef, job } = await readJob(tx, db, args.jobId);
  if (!job.currentLegId) throw new AssignmentError("Job has no current leg.", 409);

  if (!job.assignedPersonId) {
    throw new AssignmentError("No rider is assigned to this job.", 409);
  }
  if (job.assignedPersonId !== args.personId) {
    throw new AssignmentError("This assignment is not yours.", 403);
  }
  if (job.providerType !== "COMPANY") {
    throw new AssignmentError("Rider rejection applies only to company assignments.", 409);
  }
  if (job.status !== "AssignedToCompany") {
    throw new AssignmentError(`This assignment cannot be rejected from status "${job.status}".`, 409);
  }

  const lRef = legRef(db, args.jobId, job.currentLegId);
  const legSnap = await tx.get(lRef);
  if (!legSnap.exists) throw new AssignmentError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  if (leg.type !== "Pickup") {
    throw new AssignmentError("Rider rejection applies only to the pickup assignment.", 409);
  }
  // Reject is only allowed BEFORE pickup/custody. Once execution has begun the
  // rider must use the execution/exception flow, not release the assignment.
  if (leg.status !== "Assigned" && leg.status !== "Started") {
    throw new AssignmentError("This assignment can no longer be rejected (pickup has begun).", 409);
  }

  // The assigned rider (== caller) is freed. Read the person doc so availability
  // can be released in the write phase (its active-job probe is the last read).
  const personRef = db.collection("deliveryPersons").doc(args.personId);
  const personSnap = await tx.get(personRef);
  const person = personSnap.exists ? (personSnap.data() as DeliveryPerson) : null;

  // ---- WRITES ----
  const now = Timestamp.now();
  if (person) await releaseOldPerson(tx, db, personRef, person, args.personId, args.jobId, now);

  // Pickup leg returns to an unassigned-but-company-owned state so the company
  // can assign another rider. providerType/companyId are KEPT (not a handoff).
  tx.set(
    lRef,
    {
      providerType: "COMPANY",
      companyId: job.companyId ?? null,
      assignedPersonId: null,
      status: "LegCreated",
      assignedPersonName: null,
      assignedAt: null,
      assignedBy: args.actorUid,
      updatedAt: now,
    },
    { merge: true }
  );

  const eventId = writeAssignmentEvent(tx, db, {
    job,
    jobId: args.jobId,
    legId: job.currentLegId,
    actorUid: args.actorUid,
    role: "person",
    providerType: "COMPANY",
    companyId: job.companyId ?? null,
    personId: args.personId,
    action: "RiderRejectedAssignment",
    fromStatus: "AssignedToCompany",
    toStatus: "AcceptedByCompany",
    notes: args.reason ? str(args.reason, 500) : null,
    now,
  });

  // Job returns to AcceptedByCompany (company still owns it) with no person.
  // NOT RejectedByCompany; companyId + assignedCompanyName are KEPT.
  tx.set(
    jobRef,
    {
      status: "AcceptedByCompany",
      responsibleParty: { kind: "COMPANY", companyId: job.companyId ?? null, personId: null },
      assignedPersonId: null,
      assignedPersonName: null,
      assignedPersonPhone: null,
      assignedAt: now,
      assignedBy: args.actorUid,
      lastEventId: eventId,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { changed: true, jobId: args.jobId };
}
