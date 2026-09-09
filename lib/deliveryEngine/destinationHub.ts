// SERVER-ONLY. COMPANY_HUB journey — COMPANY-MANAGED transit → destination hub.
//
//   … → COMPANY TRANSIT / LINE-HAUL → [DESTINATION HUB]   ← this transition
//
// The company receives the shipment — arriving via its OWN internal transport —
// into one of its destination hubs. Custody was already at the COMPANY level
// (holderKind COMPANY, personId null) throughout company transit and simply
// becomes parked at the destination hub (a custody LOCATION). No individual
// delivery person is involved: company transit is company-managed, never a rider
// task, so there is no person to release here.
//
// It is a company DISPATCHER action (role "company"), not a rider scan, so it is
// deliberately NOT part of applyScan — the scan FSM and the YOMICO DIRECT path
// stay byte-for-byte unchanged. It is atomic: completing the transit leg,
// creating the destination-hub leg, advancing currentLegId, parking custody at
// the hub, and appending the event all happen in the caller's single transaction.
//
// DESTINATION ROUTING: there is no persisted destination-routing source, so a
// destination hub is NEVER auto-selected/guessed. It must be explicitly provided
// by the authorized company and is fully validated here (exists, same company,
// Active, not the origin hub). Final-mile assignment is a separate step and is
// NOT performed here.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { deliveryLegId } from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryHub,
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

// The actor is the company DISPATCHER (role "company"): uid + the company it owns.
// It has NO personId — company transit / hub receipt is not a person's custody.
export type DestinationHubReceiptActor = { uid: string; companyId: string };

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
  // company's job BEFORE any idempotent success. This is the authorization for a
  // COMPANY-MANAGED receipt: the owning company receives its own shipment.
  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Physical model: DIRECT can never reach a destination hub.
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Destination-hub receipt is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency — authorized, never unconditional. Company ownership was already
  // verified above, so a replay by the owning company is a safe no-op; no
  // per-person pin is needed (no person is involved in company transit).
  const eventRef = db.collection("deliveryEvents").doc(destinationHubReceiptEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "AtDestinationHub",
      hubId: typeof job.destinationHubId === "string" ? job.destinationHubId : requestedHubId,
      currentLegId: job.currentLegId ?? currentLegId,
    };
  }

  // Precondition: the job must be IN COMPANY TRANSIT on a LineHaul leg with
  // custody at the COMPANY level (no person). Rejects pre-transit states,
  // already-received, terminal, etc.
  if (job.currentStage !== "InTransit" || leg.type !== "LineHaul" || leg.status !== "InTransit") {
    throw new ExecutionError("Shipment is not in transit awaiting destination-hub receipt.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || cust.personId !== null || cust.companyId !== actor.companyId) {
    throw new ExecutionError("Shipment is not currently in this company's transit.", 409);
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

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody now parked at the destination hub (company location, not a person).
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: null,
    companyId: actor.companyId,
    hubId: destHubId,
    since: now,
    sinceEventId: eventRef.id,
  };

  // 1) Complete the LineHaul (company-transit) leg — it has arrived at the
  //    destination hub; park its custody at the hub. No longer the current leg.
  tx.set(legRef, { status: "ArrivedAtStage", custody, updatedAt: now }, { merge: true });

  // 2) Create the destination-hub leg (received/held at the destination hub,
  //    awaiting final-mile assignment). No final-mile person is assigned here.
  const sequence = (typeof leg.sequence === "number" ? leg.sequence : 3) + 1;
  const newLegId = deliveryLegId(args.jobId, sequence);
  const newLeg: DeliveryLeg = {
    jobId: args.jobId,
    shipmentNumber: job.shipmentNumber,
    sequence,
    type: "HubIntake", // received into a hub (the destination hub here)
    providerType: "COMPANY",
    companyId: actor.companyId,
    assignedPersonId: null, // final-mile rider is assigned in a later step
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

  // 3) Append-only event (deterministic id → idempotent). Company (dispatcher)
  //    actor; no person — company-managed receipt.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: newLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "company",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "DestinationHubReceipt",
    fromStage: "InTransit",
    toStage: "AtDestinationHub",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — ownership/job status unchanged
    personId: null, // company-managed receipt is not a person's custody
    custodyToKind: "COMPANY",
    hubId: destHubId, // the destination hub received INTO (audit)
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) Advance the job: currentLegId → destination-hub leg, at-destination-hub
  //    stage, custody parked at the hub; record the destination hub. originHubId
  //    kept. No person assignment (final-mile assigns Rider 2 next).
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
