// SERVER-ONLY. COMPANY_HUB journey — transit / line-haul → destination hub.
//
//   … → TRANSIT / LINE-HAUL → [DESTINATION HUB]   ← this transition
//
// The line-haul person who currently HOLDS the parcel receives it into the
// company's DESTINATION hub. This is a PHYSICAL custody transition (person in
// transit → destination hub, a custody LOCATION), not an ownership change, and
// is NOT part of applyScan — keeping the scan FSM and the YOMICO DIRECT path
// byte-for-byte unchanged. It is atomic: completing the LineHaul leg, creating
// the destination-hub leg, advancing currentLegId, moving custody to the hub,
// and appending the event all happen in the caller's single transaction.
//
// DESTINATION ROUTING: there is no persisted destination-routing source in the
// model today, so a destination hub is NEVER auto-selected/guessed. It must be
// explicitly provided by the authorized receiving actor and is fully validated
// here (exists, same company, Active, not the origin hub). Final-mile assignment,
// out-for-delivery and delivery are later slices and are NOT performed here.
import type { Transaction, Firestore, DocumentReference } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { deliveryLegId } from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryHub,
  DeliveryPerson,
  DeliveryEvent,
  CustodyState,
} from "@/lib/deliveryEngine/types";

// Deterministic id → one destination-hub-receipt event per job; retry idempotent.
function destinationHubReceiptEventId(jobId: string): string {
  return `${jobId}__destination_hub_receipt`;
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

export type DestinationHubReceiptActor = { uid: string; companyId: string; personId: string };

export type DestinationHubReceiptResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "AtDestinationHub";
  hubId: string;
  currentLegId: string;
};

export async function applyDestinationHubReceipt(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; hubId: string; actor: DestinationHubReceiptActor }
): Promise<DestinationHubReceiptResult> {
  const { actor } = args;
  const requestedHubId = typeof args.hubId === "string" ? args.hubId.trim() : "";
  if (!requestedHubId) throw new ExecutionError("Destination hub is required.", 400);

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
  // Physical model: DIRECT can never reach a destination hub.
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Destination-hub receipt is not valid for this delivery model.", 409);
  }

  // PHYSICAL-CUSTODY AUTHORIZATION (before idempotency): only the server-assigned
  // delivery person — the line-haul person carrying the shipment — may receive
  // it. Same company + Active + providerType COMPANY is NOT sufficient. This is
  // the persisted assignment (assignedPersonId), which survives the transition,
  // so an idempotent replay can be authorized even after custody moved to the hub
  // (where custody.personId becomes null). Not reinterpreted as a hub assignee.
  if (!job.assignedPersonId || job.assignedPersonId !== actor.personId) {
    throw new ExecutionError("You are not the assigned delivery person for this shipment.", 403);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency — authorized, never unconditional. The assignment gate above
  // already rejected non-assigned persons; this additionally pins the no-op to
  // the ORIGINAL receiving actor recorded on the event.
  const eventRef = db.collection("deliveryEvents").doc(destinationHubReceiptEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    const existing = eventSnap.data() as DeliveryEvent;
    if (existing.personId !== actor.personId) {
      throw new ExecutionError("You are not the receiving person for this shipment.", 403);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "AtDestinationHub",
      hubId: typeof job.destinationHubId === "string" ? job.destinationHubId : requestedHubId,
      currentLegId: job.currentLegId ?? currentLegId,
    };
  }

  // Precondition: the job must be IN TRANSIT on a LineHaul leg, physically held
  // by this actor. Rejects pre-transit states, already-received, terminal, etc.
  if (job.currentStage !== "InTransit" || leg.type !== "LineHaul" || leg.status !== "InTransit") {
    throw new ExecutionError("Shipment is not in transit awaiting destination-hub receipt.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || cust.personId !== actor.personId || cust.companyId !== actor.companyId) {
    throw new ExecutionError("You do not currently hold this shipment in transit.", 403);
  }

  // Validate the REQUESTED destination hub (never auto-selected). It must exist,
  // belong to this company, be Active, and not be the origin hub.
  const hubRef = db.collection("deliveryHubs").doc(requestedHubId);
  const hubSnap = await tx.get(hubRef);
  if (!hubSnap.exists) throw new ExecutionError("Destination hub not found.", 404);
  const hub = hubSnap.data() as DeliveryHub;
  if (hub.companyId !== actor.companyId) throw new ExecutionError("That hub belongs to another company.", 403);
  if (hub.status !== "Active") throw new ExecutionError("That hub is not active.", 409);
  if (job.originHubId && job.originHubId === requestedHubId) {
    throw new ExecutionError("The destination hub cannot be the origin hub.", 409);
  }
  const destHubId = requestedHubId;
  const destHubName = typeof hub.name === "string" && hub.name ? hub.name : "Destination hub";

  // Read the acting line-haul person (release Busy→Available after the handoff).
  const personRef: DocumentReference = db.collection("deliveryPersons").doc(actor.personId);
  const personSnap = await tx.get(personRef);
  const person = personSnap.exists ? (personSnap.data() as DeliveryPerson) : null;

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody now parked at the destination hub (location, not a person).
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: null,
    companyId: actor.companyId,
    hubId: destHubId,
    since: now,
    sinceEventId: eventRef.id,
  };

  // 1) Complete the LineHaul leg — it has arrived at the destination hub; move
  //    its custody to the hub. It is no longer the current leg.
  tx.set(legRef, { status: "ArrivedAtStage", custody, updatedAt: now }, { merge: true });

  // 2) Create the destination-hub leg (received/held at the destination hub,
  //    awaiting a later final-mile slice). No final-mile person is assigned.
  const sequence = (typeof leg.sequence === "number" ? leg.sequence : 3) + 1;
  const newLegId = deliveryLegId(args.jobId, sequence);
  const newLeg: DeliveryLeg = {
    jobId: args.jobId,
    shipmentNumber: job.shipmentNumber,
    sequence,
    type: "HubIntake", // received into a hub (the destination hub here)
    providerType: "COMPANY",
    companyId: actor.companyId,
    assignedPersonId: null, // NO final-mile assignment in this slice
    status: "ArrivedAtStage", // received at the destination hub; held pending final-mile
    from: { stage: destHubName },
    to: { stage: "" }, // final-mile not yet known — never fabricated
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
    action: "DestinationHubReceipt",
    fromStage: "InTransit",
    toStage: "AtDestinationHub",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — ownership/job status unchanged
    personId: actor.personId,
    custodyToKind: "COMPANY",
    hubId: destHubId, // the destination hub received INTO (audit)
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) Release the line-haul person (only Busy→Available; never clobber Offline).
  if (person && person.availability === "Busy") {
    tx.set(personRef, { availability: "Available", updatedAt: now }, { merge: true });
  }

  // 5) Advance the job: currentLegId → destination-hub leg, at-destination-hub
  //    stage, custody at the hub; record the destination hub. originHubId kept.
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "AtDestinationHub",
      custody,
      currentHubId: destHubId,
      destinationHubId: destHubId,
      destinationHubReceivedAt: now,
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, jobId: args.jobId, stage: "AtDestinationHub", hubId: destHubId, currentLegId: newLegId };
}
