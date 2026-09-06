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

/** A person eligible to RECEIVE a new assignment: Active account AND Available. */
export function assertPersonAssignable(person: DeliveryPerson): void {
  const accountStatus = person.accountStatus ?? (person.status === "Inactive" ? "Suspended" : "Active");
  if (accountStatus !== "Active") {
    throw new AssignmentError("That delivery person is not active.", 409);
  }
  if (person.availability !== "Available") {
    throw new AssignmentError("That delivery person is not available.", 409);
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

// Free a previously-assigned person: only flip Busy -> Available, so a person
// who has manually gone Offline keeps that choice. Reads must already be done.
function freeIfBusy(tx: Transaction, ref: DocumentReference, person: DeliveryPerson, now: Timestamp): void {
  if (person.availability === "Busy") {
    tx.set(ref, { availability: "Available", updatedAt: now }, { merge: true });
  }
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
  if (oldRef && oldPerson) freeIfBusy(tx, oldRef, oldPerson, now);
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
  if (oldRef && oldPerson) freeIfBusy(tx, oldRef, oldPerson, now);

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
  if (job.status !== "OfferedToCompany" && job.status !== "AssignedToCompany") {
    throw new AssignmentError(`Job status "${job.status}" cannot be assigned by the company.`, 409);
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
  assertPersonAssignable(person);

  // ---- WRITES ----
  const now = Timestamp.now();
  if (oldRef && oldPerson) freeIfBusy(tx, oldRef, oldPerson, now);
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
  if (job.status !== "OfferedToCompany" && job.status !== "AssignedToCompany") {
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
  if (oldRef && oldPerson) freeIfBusy(tx, oldRef, oldPerson, now);

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
