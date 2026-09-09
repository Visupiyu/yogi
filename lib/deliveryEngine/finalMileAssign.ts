// SERVER-ONLY. COMPANY_HUB journey — destination hub → final-mile person.
//
//   … → DESTINATION HUB → [FINAL-MILE PERSON]   ← this transition
//
// The company DISPATCHER (the server-authoritative company actor — the same
// authority the existing pre-execution assignment primitive, assignCompanyPerson,
// already trusts to select the company's own people) assigns an eligible company
// delivery person to carry the parcel from the destination hub to the customer,
// and custody is handed from the hub (a location) to that person. Two distinct
// parties are involved, and NEITHER is client-controlled: the INITIATING actor
// is the authenticated company dispatcher (resolved server-side), and the
// RECEIVING person is validated against the company's own roster + eligibility.
//
// This is ASSIGNMENT + a hub→person custody handover performed atomically — NOT
// departure. OutForDelivery, final-mile departure and customer delivery are later
// slices and are NOT performed here; job.status stays InProgress.
//
// WHY A NEW OPERATION (not assignCompanyPerson): the existing company-assign
// primitive is gated to PRE-EXECUTION statuses (OfferedToCompany / AssignedTo
// Company) and operates on the job's initial/current leg; it refuses an
// InProgress job and would overwrite the original assignment semantics. There is
// also no hub→person handoff primitive (LegHandover requires a non-null
// fromPersonId, so a hub cannot be the source). So this creates the smallest
// dedicated operation, REUSING the existing eligibility validators
// (assertCompanyPerson + assertPersonAssignable) and the existing company
// dispatcher authority, without modifying assignCompanyPerson, the scan FSM, or
// the YOMICO DIRECT path. job.assignedPersonId is NEVER used to authorize the new
// final-mile person — the dispatcher's selection + eligibility is the authority.
import type { Transaction, Firestore, DocumentReference } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { assertCompanyPerson, assertPersonAssignable } from "@/lib/deliveryEngine/assignment";
import { deliveryLegId } from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryPerson,
  DeliveryEvent,
  CustodyState,
} from "@/lib/deliveryEngine/types";

// Deterministic id → one final-mile-assignment event per job; retry idempotent.
function finalMileAssignmentEventId(jobId: string): string {
  return `${jobId}__final_mile_assignment`;
}

// Physical model. Faithful copy of execution.ts deliveryModelOf (source of truth)
// so this file makes no change to, and needs no import from, the DIRECT-critical
// execution module. COMPANY_HUB iff an external company owns it.
function isCompanyHub(job: DeliveryJob): boolean {
  const explicit = (job as { deliveryModel?: unknown }).deliveryModel;
  if (explicit === "YOMICO_DIRECT") return false;
  if (explicit === "COMPANY_HUB") return true;
  return job.providerType === "COMPANY";
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

// The INITIATING actor is the company dispatcher (role "company"): uid + the
// company it owns. It has NO personId — it is not a delivery person. The
// final-mile person is passed separately and validated against this company.
export type FinalMileAssignActor = { uid: string; companyId: string };

export type FinalMileAssignResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "FinalMileAssigned";
  personId: string;
  currentLegId: string;
};

export async function applyFinalMileAssignment(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; personId: string; actor: FinalMileAssignActor }
): Promise<FinalMileAssignResult> {
  const { actor } = args;
  const finalMilePersonId = typeof args.personId === "string" ? args.personId.trim() : "";
  if (!finalMilePersonId) throw new ExecutionError("A final-mile delivery person is required.", 400);

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  // Ownership (provider/company) — never from the client body. Rejects another
  // company's job BEFORE any idempotent success. The dispatcher may only act on
  // its OWN company's jobs.
  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Physical model: DIRECT never has a destination hub or a final-mile leg.
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Final-mile assignment is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency — authorized, never unconditional. The authorizing actor here is
  // the company dispatcher, already proven to own this job (company-scope checked
  // above, before this branch). A replay that names the SAME assigned person is a
  // no-op success; naming a DIFFERENT person is NOT a silent success — it is a
  // reassignment, which this minimal slice rejects (avoids custody churn), so an
  // existing event can never be used to quietly assign someone else.
  const eventRef = db.collection("deliveryEvents").doc(finalMileAssignmentEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    const existing = eventSnap.data() as DeliveryEvent;
    if (existing.personId !== finalMilePersonId) {
      throw new ExecutionError("A final-mile person is already assigned to this shipment.", 409);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "FinalMileAssigned",
      personId: finalMilePersonId,
      currentLegId: job.currentLegId ?? currentLegId,
    };
  }

  // Precondition: the job must be received and held AT THE DESTINATION HUB on the
  // destination HubIntake leg, with custody parked at the hub (no person). Rejects
  // pre-destination states, already-assigned final-mile, terminal, etc.
  if (job.currentStage !== "AtDestinationHub" || leg.type !== "HubIntake" || leg.status !== "ArrivedAtStage") {
    throw new ExecutionError("Shipment is not at the destination hub awaiting final-mile assignment.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || cust.personId !== null || cust.companyId !== actor.companyId || !cust.hubId) {
    throw new ExecutionError("Shipment is not currently held at this company's destination hub.", 409);
  }
  const destHubId = cust.hubId;
  const destHubName = typeof leg.from?.stage === "string" && leg.from.stage ? leg.from.stage : "Destination hub";

  // Validate the REQUESTED final-mile person against the company roster +
  // eligibility — REUSING the existing assignment validators. Being the same
  // company + Active is NOT sufficient on its own: the dispatcher must select a
  // person who belongs to THIS company AND is Active AND currently Available
  // (the coarse availability mutex that prevents double-booking).
  const personRef: DocumentReference = db.collection("deliveryPersons").doc(finalMilePersonId);
  const personSnap = await tx.get(personRef);
  if (!personSnap.exists) throw new ExecutionError("Delivery person not found.", 404);
  const person = personSnap.data() as DeliveryPerson;
  assertCompanyPerson(person, actor.companyId); // belongs to this company (else 403)
  assertPersonAssignable(person); // Active account AND Available (else 409)

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody handed from the hub to the final-mile person (atomic — no split
  // custody). holderKind stays COMPANY; it is now in a person's hands, so hubId
  // is null.
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: finalMilePersonId,
    companyId: actor.companyId,
    hubId: null,
    since: now,
    sinceEventId: eventRef.id,
  };

  // 1) Complete the destination-hub leg — it has handed the parcel to the
  //    final-mile person. It is no longer the current leg.
  tx.set(legRef, { status: "HandoverConfirmed", custody, updatedAt: now }, { merge: true });

  // 2) Create the final-mile leg: assigned to the final-mile person, custody with
  //    that person, awaiting departure (NOT yet out for delivery). The destination
  //    is the customer — known, not fabricated.
  const sequence = (typeof leg.sequence === "number" ? leg.sequence : 4) + 1;
  const newLegId = deliveryLegId(args.jobId, sequence);
  const newLeg: DeliveryLeg = {
    jobId: args.jobId,
    shipmentNumber: job.shipmentNumber,
    sequence,
    type: "FinalMile",
    providerType: "COMPANY",
    companyId: actor.companyId,
    assignedPersonId: finalMilePersonId,
    status: "Assigned", // person assigned + holds custody; awaiting OutForDelivery
    from: { stage: destHubName },
    to: { stage: "Customer" }, // final mile goes to the customer — a real fact
    assignedPersonName: str(person.name),
    assignedAt: now,
    assignedBy: actor.uid,
    custody,
    handover: null,
    proof: null,
    exception: null,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  tx.set(jobRef.collection("legs").doc(newLegId), newLeg);

  // 3) Append-only event (deterministic id → idempotent). Company (dispatcher)
  //    actor; the assigned final-mile person is recorded as personId.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: newLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "company",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "FinalMileAssignment",
    fromStage: "AtDestinationHub",
    toStage: "FinalMileAssigned",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — ownership/job status unchanged
    personId: finalMilePersonId,
    custodyToKind: "COMPANY",
    hubId: destHubId, // the destination hub the parcel was handed out FROM (audit)
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) The final-mile person now holds the parcel → Busy (atomic with the
  //    assignment; assertPersonAssignable already required Available, so this
  //    cannot double-book). Mirrors assignCompanyPerson's Busy transition.
  tx.set(personRef, { availability: "Busy", updatedAt: now }, { merge: true });

  // 5) Advance the job: currentLegId → final-mile leg, final-mile-assigned stage,
  //    custody with the person (not at a hub → currentHubId null). The assignment
  //    snapshot now mirrors the current (final-mile) leg's person. destinationHubId
  //    kept for audit. status stays InProgress (NOT OutForDelivery / terminal).
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "FinalMileAssigned",
      custody,
      currentHubId: null,
      responsibleParty: { kind: "COMPANY", companyId: actor.companyId, personId: finalMilePersonId },
      assignedPersonId: finalMilePersonId,
      assignedPersonName: str(person.name),
      assignedPersonPhone: str(person.phone, 40),
      assignedAt: now,
      assignedBy: actor.uid,
      finalMileAssignedAt: now,
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, jobId: args.jobId, stage: "FinalMileAssigned", personId: finalMilePersonId, currentLegId: newLegId };
}
