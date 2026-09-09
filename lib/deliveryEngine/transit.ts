// SERVER-ONLY. COMPANY_HUB journey — origin hub → transit / line-haul.
//
//   … → ORIGIN HUB → [TRANSIT / LINE-HAUL]   ← this transition
//
// A company line-haul delivery person departs the origin hub carrying the parcel
// into transit. This is a PHYSICAL custody transition: custody moves from the
// origin hub (company, no person) to the acting company PERSON who now carries
// it. It is NOT part of applyScan (keeps the person-scan FSM, and therefore the
// YOMICO DIRECT path, byte-for-byte unchanged) and is atomic: completing the
// hub-intake leg, creating the LineHaul leg, advancing currentLegId, moving
// custody, and appending the event all happen in the caller's single transaction.
//
// The destination hub is NOT known or fabricated here — this represents "in
// transit from the origin hub". Destination-hub receipt / final-mile are later
// slices. Authorization is checked BEFORE any idempotent success (mirrors the
// origin-hub-intake slice): an unauthorized or non-original actor never gets a
// successful no-op merely because the event exists.
import type { Transaction, Firestore, DocumentReference } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { deliveryLegId } from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryPerson,
  DeliveryEvent,
  CustodyState,
} from "@/lib/deliveryEngine/types";

// Deterministic id → one transit-departure event per job; a retry is idempotent.
function transitDepartureEventId(jobId: string): string {
  return `${jobId}__transit_departure`;
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

export type TransitDepartureActor = { uid: string; companyId: string; personId: string };

export type TransitDepartureResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "InTransit";
  currentLegId: string;
};

export async function applyTransitDeparture(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; actor: TransitDepartureActor }
): Promise<TransitDepartureResult> {
  const { actor } = args;

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  // Ownership (provider/company) — never from the client body. Rejects another
  // company's job BEFORE any idempotent success.
  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Physical model: DIRECT can never enter transit.
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Transit is not valid for this delivery model.", 409);
  }

  // PHYSICAL-CUSTODY AUTHORIZATION (before idempotency): the acting person must
  // be the job's SERVER-ASSIGNED company delivery person — persisted evidence
  // written only by the sanctioned company assignment flow (assignCompanyPerson,
  // which also survives pickup/intake unchanged). Being the same company + Active
  // + providerType COMPANY is NOT sufficient: an arbitrary company person can
  // never acquire transit custody without this assignment. (A future slice may
  // add per-leg line-haul (re)assignment; until then the assigned person carries
  // the shipment through pickup → origin hub → transit.)
  if (!job.assignedPersonId || job.assignedPersonId !== actor.personId) {
    throw new ExecutionError("You are not the assigned delivery person for this shipment.", 403);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency — authorized, never unconditional. Only the ORIGINAL line-haul
  // person who departed (recorded as event.personId) may receive the no-op
  // success. A different same-company person is rejected here; other-company /
  // DIRECT were already rejected above.
  const eventRef = db.collection("deliveryEvents").doc(transitDepartureEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    const existing = eventSnap.data() as DeliveryEvent;
    if (existing.personId !== actor.personId) {
      throw new ExecutionError("You are not the line-haul person for this shipment.", 403);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "InTransit",
      currentLegId: job.currentLegId ?? currentLegId,
    };
  }

  // Precondition: the job must be AT THE ORIGIN HUB and not already advanced.
  // (Rejects pre-intake states, already-in-transit, terminal/delivered, etc.)
  if (job.currentStage !== "AtOriginHub" || leg.type !== "HubIntake" || leg.status !== "ArrivedAtStage") {
    throw new ExecutionError("Shipment is not at the origin hub awaiting transit.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || cust.personId !== null || cust.companyId !== actor.companyId || !cust.hubId) {
    throw new ExecutionError("Shipment is not currently held at this company's origin hub.", 409);
  }
  const originHubId = typeof job.currentHubId === "string" && job.currentHubId ? job.currentHubId : cust.hubId;
  const originHubName = typeof leg.from?.stage === "string" && leg.from.stage ? leg.from.stage : "Origin hub";

  // Read the acting line-haul person (for the denormalised name + availability).
  const personRef: DocumentReference = db.collection("deliveryPersons").doc(actor.personId);
  const personSnap = await tx.get(personRef);
  const person = personSnap.exists ? (personSnap.data() as DeliveryPerson) : null;

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody now with the line-haul person, carrying it in transit (no hub holds
  // it — it has LEFT the origin hub; destination hub is not yet known).
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: actor.personId,
    companyId: actor.companyId,
    hubId: null,
    since: now,
    sinceEventId: eventRef.id,
  };

  // 1) The HubIntake leg is departed — it stops being current (its historical
  //    "ArrivedAtStage" at the origin hub remains true); just stamp updatedAt.
  tx.set(legRef, { updatedAt: now }, { merge: true });

  // 2) Create the LineHaul leg: the transit segment, in transit, held by the
  //    line-haul person. Destination stage is left blank (unknown, not faked).
  const sequence = (typeof leg.sequence === "number" ? leg.sequence : 2) + 1;
  const newLegId = deliveryLegId(args.jobId, sequence);
  const newLeg: DeliveryLeg = {
    jobId: args.jobId,
    shipmentNumber: job.shipmentNumber,
    sequence,
    type: "LineHaul",
    providerType: "COMPANY",
    companyId: actor.companyId,
    assignedPersonId: actor.personId,
    status: "InTransit",
    from: { stage: originHubName }, // departed this origin hub
    to: { stage: "" }, // destination hub not yet known — never fabricated
    assignedPersonName: person && typeof person.name === "string" ? person.name.slice(0, 200) : null,
    custody,
    handover: null,
    proof: null,
    exception: null,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  tx.set(jobRef.collection("legs").doc(newLegId), newLeg);

  // 3) Append-only event (deterministic id → idempotent).
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: newLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "person",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "TransitDeparture",
    fromStage: "AtOriginHub",
    toStage: "InTransit",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — job ownership/status unchanged
    personId: actor.personId,
    custodyToKind: "COMPANY",
    hubId: originHubId, // the hub departed FROM (audit)
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) The line-haul person is now actively carrying the parcel → Busy (mirrors
  //    execution.ts HANDOVER_CONFIRM: a person holding custody is Busy).
  tx.set(personRef, { availability: "Busy", updatedAt: now }, { merge: true });

  // 5) Advance the job: currentLegId → LineHaul leg, in-transit stage, custody
  //    with the person; preserve the origin hub; it is no longer AT a hub.
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "InTransit",
      custody,
      originHubId,
      currentHubId: null,
      transitStartedAt: now,
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, jobId: args.jobId, stage: "InTransit", currentLegId: newLegId };
}
