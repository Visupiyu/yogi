// SERVER-ONLY. COMPANY_HUB journey — origin-hub intake (first physical slice).
//
//   SELLER → COMPANY PERSON → [ORIGIN COMPANY HUB]   ← this transition
//
// After a company first-mile person has PICKED UP the parcel, the owning company
// receives it into one of ITS OWN hubs. This is a custody transition to a
// physical LOCATION (the hub), not to a human actor. It is intentionally NOT
// part of applyScan (the person-driven, single-leg scan FSM) — keeping that path,
// and therefore the YOMICO DIRECT flow, byte-for-byte unchanged. It is atomic:
// completing the Pickup leg, creating the next (HubIntake) leg, advancing
// currentLegId, parking custody at the hub, and appending the event all happen
// in the caller's single transaction, so a failure can never leave a half-moved
// job. It does NOT fabricate transit / destination-hub / final-mile / delivery.
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

// Deterministic id → one origin-hub-intake event per job; a retry is idempotent.
function originHubIntakeEventId(jobId: string): string {
  return `${jobId}__origin_hub_intake`;
}

// Physical model. Faithful copy of execution.ts deliveryModelOf (the source of
// truth) so this file needs no import from, and makes no change to, the
// DIRECT-critical execution module. COMPANY_HUB iff an external company owns it.
function isCompanyHub(job: DeliveryJob): boolean {
  const explicit = (job as { deliveryModel?: unknown }).deliveryModel;
  if (explicit === "YOMICO_DIRECT") return false;
  if (explicit === "COMPANY_HUB") return true;
  return job.providerType === "COMPANY";
}

// The actor is the COMPANY delivery PERSON who currently physically holds the
// shipment — NOT the company owner. Company ownership ≠ physical custody: the
// owner may not receive a parcel into the hub merely by owning the job; only the
// custody-holding first-mile person can. (A hub is still a custody LOCATION, not
// a new operator role — no new role is introduced.)
export type OriginHubIntakeActor = { uid: string; companyId: string; personId: string };

export type OriginHubIntakeResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "AtOriginHub";
  hubId: string;
  currentLegId: string;
};

export async function applyOriginHubIntake(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; hubId?: string | null; actor: OriginHubIntakeActor }
): Promise<OriginHubIntakeResult> {
  const { actor } = args;

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  // Ownership (provider/company), never from the client body.
  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Physical model: DIRECT can never undergo hub intake.
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Origin-hub intake is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency: the one-time intake event already exists → no-op replay. But the
  // no-op success is AUTHORIZED, never unconditional: only the ORIGINAL custody
  // holder who performed the intake (recorded as event.personId) may receive it.
  // After intake the current leg is the HubIntake leg (custody.personId = null),
  // so the live custody check below can't gate this — we gate on the persisted
  // event actor instead. A different same-company person (not the holder) is
  // rejected here and never gets a successful no-op; other-company persons and
  // the company owner were already rejected above / at the route role guard.
  const eventRef = db.collection("deliveryEvents").doc(originHubIntakeEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    const existing = eventSnap.data() as DeliveryEvent;
    if (existing.personId !== actor.personId) {
      throw new ExecutionError("You do not currently hold this shipment.", 403);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "AtOriginHub",
      hubId: typeof job.currentHubId === "string" ? job.currentHubId : "",
      currentLegId: job.currentLegId ?? currentLegId,
    };
  }

  // State/custody preconditions: must be the picked-up first-mile Pickup leg,
  // held by one of this company's people. Rejects Created/Assigned (not PickedUp),
  // seller custody, terminal/Delivered (leg ≠ PickedUp), already-advanced legs.
  if (leg.type !== "Pickup" || leg.status !== "PickedUp") {
    throw new ExecutionError("Shipment is not awaiting origin-hub intake.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || !cust.personId || cust.companyId !== actor.companyId) {
    throw new ExecutionError("Shipment is not currently held by a company delivery person.", 409);
  }
  // The actor MUST be the person currently holding the shipment. Company
  // ownership does not grant hub-intake — only the custody holder may perform it.
  if (cust.personId !== actor.personId) {
    throw new ExecutionError("You do not currently hold this shipment.", 403);
  }
  const firstMilePersonId = cust.personId; // === actor.personId (verified above)

  // Resolve the origin hub (explicit hubId, else derive the company's single
  // active hub). Company-scoped: hub.companyId MUST equal the actor's company.
  let hubId: string;
  let hubName: string;
  if (typeof args.hubId === "string" && args.hubId.trim()) {
    hubId = args.hubId.trim();
    const hubRef = db.collection("deliveryHubs").doc(hubId);
    const hubSnap = await tx.get(hubRef);
    if (!hubSnap.exists) throw new ExecutionError("Hub not found.", 404);
    const hub = hubSnap.data() as DeliveryHub;
    if (hub.companyId !== actor.companyId) throw new ExecutionError("That hub belongs to another company.", 403);
    if (hub.status !== "Active") throw new ExecutionError("That hub is not active.", 409);
    hubName = typeof hub.name === "string" ? hub.name : "Origin hub";
  } else {
    // Derive: this company's active hubs. Single-field query (no composite index);
    // active filtered in memory.
    const hubsSnap = await tx.get(db.collection("deliveryHubs").where("companyId", "==", actor.companyId));
    const active = hubsSnap.docs.filter((d) => (d.data() as DeliveryHub).status === "Active");
    if (active.length === 0) throw new ExecutionError("Your company has no active hub configured.", 409);
    if (active.length > 1) throw new ExecutionError("Multiple hubs exist — specify hubId.", 400);
    hubId = active[0].id;
    hubName = typeof (active[0].data() as DeliveryHub).name === "string" ? (active[0].data() as DeliveryHub).name : "Origin hub";
  }

  // Read the first-mile person (to release Busy→Available after the handoff).
  let personRef: DocumentReference | null = null;
  let person: DeliveryPerson | null = null;
  personRef = db.collection("deliveryPersons").doc(firstMilePersonId);
  const personSnap = await tx.get(personRef);
  person = personSnap.exists ? (personSnap.data() as DeliveryPerson) : null;

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody parked at the company hub (location, not a person).
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: null,
    companyId: actor.companyId,
    hubId,
    since: now,
    sinceEventId: eventRef.id,
  };

  // 1) Complete the Pickup leg (first-mile arrived at the origin hub) and move its
  //    custody to the hub. It is no longer the current leg.
  tx.set(legRef, { status: "ArrivedAtStage", custody, updatedAt: now }, { merge: true });

  // 2) Create the next leg (HubIntake): the parcel is received and held at the
  //    origin hub, awaiting a later transit slice. NOT transit/destination/final-mile.
  const sequence = (typeof leg.sequence === "number" ? leg.sequence : 1) + 1;
  const newLegId = deliveryLegId(args.jobId, sequence);
  const newLeg: DeliveryLeg = {
    jobId: args.jobId,
    shipmentNumber: job.shipmentNumber,
    sequence,
    type: "HubIntake",
    providerType: "COMPANY",
    companyId: actor.companyId,
    assignedPersonId: null,
    status: "ArrivedAtStage", // received at the hub stage; held pending transit
    from: { stage: hubName },
    to: { stage: "Transit" },
    custody,
    handover: null,
    proof: null,
    exception: null,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  tx.set(jobRef.collection("legs").doc(newLegId), newLeg);

  // 3) Append-only event (deterministic id → idempotent). Company actor.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: newLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "company",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "OriginHubIntake",
    fromStage: "PickedUp",
    toStage: "AtOriginHub",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — ownership/job status is unchanged
    personId: firstMilePersonId,
    custodyToKind: "COMPANY",
    hubId,
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) Free the first-mile person (only Busy→Available; never clobber Offline).
  if (personRef && person && person.availability === "Busy") {
    tx.set(personRef, { availability: "Available", updatedAt: now }, { merge: true });
  }

  // 5) Advance the job: currentLegId → new leg, custody at hub, denormalised
  //    tracking fields. status stays InProgress (NOT terminal).
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "AtOriginHub",
      custody,
      currentHubId: hubId,
      originHubIntakeAt: now,
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, jobId: args.jobId, stage: "AtOriginHub", hubId, currentLegId: newLegId };
}
