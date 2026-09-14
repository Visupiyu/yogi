// SERVER-ONLY. COMPANY_HUB journey — destination-hub handover (four-actor
// model, Phase 2 — step 2 of 2, following finalMileAssign.ts's selection).
//
//   [FINAL-MILE PERSON selected] → DESTINATION HUB PERSON releases → RIDER 2
//
// Two SEPARATE authenticated physical actors, TWO transactions:
//   1) applyDestinationHandoverInitiate — the Destination Hub Person currently
//      responsible for this job (job.responsibleParty) declares "I am handing
//      this shipment to Rider 2." Custody does NOT move yet: the parcel is
//      still parked at the hub.
//   2) applyDestinationHandoverConfirm  — Rider 2 (the SPECIFIC person the
//      dispatcher already selected in finalMileAssign.ts — leg.assignedPersonId
//      is the sole source of truth for who may confirm; no separate
//      "toPersonId" is introduced) declares "I received this shipment." THIS
//      is what moves custody onto Rider 2 and ends the Destination Hub
//      Person's responsibility for this job. The Company Job stays InProgress
//      throughout and is never Delivered here.
//
// Neither step is part of applyScan (the person-driven, single-leg scan FSM):
// keeping that path, and therefore the YOMICO DIRECT flow, byte-for-byte
// unchanged. Each step is atomic: every read happens before any write. After
// confirm, the FinalMile leg is deliberately reset to status "Assigned" (now
// WITH custody) — exactly the hybrid state execution.ts's OUT_FOR_DELIVERY
// transition already documents and accepts for a COMPANY_HUB final-mile leg,
// so applyScan needs no changes at all for Rider 2 to depart/deliver later.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { assertHubPerson, assertCompanyPerson, assertRiderPerson } from "@/lib/deliveryEngine/assignment";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryPerson,
  DeliveryEvent,
  CustodyState,
  DestinationHandover,
} from "@/lib/deliveryEngine/types";
import { emitDeliveryNotification } from "@/lib/deliveryEngine/notifications";

function destinationHandoverInitiateEventId(jobId: string): string {
  return `${jobId}__destination_handover_initiate`;
}
function destinationHandoverConfirmEventId(jobId: string): string {
  return `${jobId}__destination_handover_confirm`;
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
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

// ===========================================================================
// 1) Destination Hub Person -> "I am handing this shipment to Rider 2."
// ===========================================================================

// The actor is the Destination Hub Person currently RESPONSIBLE for this job
// (job.responsibleParty), not merely any hub person at the same hub.
export type DestinationHandoverInitiateActor = { uid: string; companyId: string; personId: string; hubId: string };

export type DestinationHandoverInitiateResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "HandoverInitiated";
  hubId: string;
  currentLegId: string;
  toPersonId: string;
};

export async function applyDestinationHandoverInitiate(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; actor: DestinationHandoverInitiateActor }
): Promise<DestinationHandoverInitiateResult> {
  const { actor } = args;

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Payment Lifecycle V1 — a Cancelled/Returned order's job must not keep
  // progressing through this handover (see execution.ts's identical guard).
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
  }
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Destination-hub handover is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency: authorized, never unconditional — only the ORIGINAL initiator
  // (event.personId) may receive the safe no-op.
  const eventRef = db.collection("deliveryEvents").doc(destinationHandoverInitiateEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    const existing = eventSnap.data() as DeliveryEvent;
    if (existing.personId !== actor.personId) {
      throw new ExecutionError("You are not the hub person responsible for this shipment.", 403);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "HandoverInitiated",
      hubId: actor.hubId,
      currentLegId: job.currentLegId ?? currentLegId,
      toPersonId: typeof leg.assignedPersonId === "string" ? leg.assignedPersonId : "",
    };
  }

  // State preconditions: Rider 2 must already be SELECTED (finalMileAssign.ts)
  // and the handover must not already be underway. Rejects pre-selection
  // states, already-initiated/confirmed, terminal, etc.
  if (job.currentStage !== "FinalMileAssigned" || leg.type !== "FinalMile" || leg.status !== "Assigned") {
    throw new ExecutionError("This shipment is not awaiting a destination-hub handover.", 409);
  }
  const toPersonId = leg.assignedPersonId;
  if (!toPersonId) throw new ExecutionError("No final-mile rider is selected for this shipment.", 409);

  // The actor MUST be the hub person CURRENTLY responsible for this job (set by
  // the destination-hub receipt) — not merely any hub person at the same hub.
  if (
    !job.responsibleParty ||
    job.responsibleParty.kind !== "COMPANY" ||
    job.responsibleParty.personId !== actor.personId
  ) {
    throw new ExecutionError("You are not the hub person responsible for this shipment.", 403);
  }
  // Sanity: the parcel must still be physically at THIS actor's own hub.
  if (job.currentHubId !== actor.hubId) {
    throw new ExecutionError("This shipment is not at your hub.", 403);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || cust.personId !== null || cust.hubId !== actor.hubId) {
    throw new ExecutionError("Shipment is not currently held at this hub.", 409);
  }

  // Re-validate the initiating person against the authoritative record: same
  // company, role HUB_PERSON, stationed at this hub, Active. Never trusts
  // companyId/hubId/role from the client — this reads the person doc fresh.
  const hubPersonRef = db.collection("deliveryPersons").doc(actor.personId);
  const hubPersonSnap = await tx.get(hubPersonRef);
  if (!hubPersonSnap.exists) throw new ExecutionError("Delivery person not found.", 404);
  const hubPerson = hubPersonSnap.data() as DeliveryPerson;
  assertHubPerson(hubPerson, actor.companyId, actor.hubId);

  // Four-actor invariant: the hub person may never also be Rider 2.
  if (actor.personId === toPersonId) {
    throw new ExecutionError("The releasing hub person must be different from Rider 2.", 409);
  }

  // Re-validate Rider 2 is STILL the correct, eligible rider at the moment of
  // initiation — not just trusted blindly from leg.assignedPersonId (which was
  // only set once, at selection time, and could in principle be stale if the
  // person record changed company/role since). Never a HUB_PERSON, and must
  // still belong to this company. Availability/Active are NOT re-checked here
  // — Rider 2 is expected to be Busy since selection, and that is not a
  // rejection condition for a handover they were already assigned.
  const rider2Ref = db.collection("deliveryPersons").doc(toPersonId);
  const rider2Snap = await tx.get(rider2Ref);
  if (!rider2Snap.exists) throw new ExecutionError("The assigned final-mile rider was not found.", 404);
  const rider2 = rider2Snap.data() as DeliveryPerson;
  assertCompanyPerson(rider2, actor.companyId);
  assertRiderPerson(rider2);

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  const handover: DestinationHandover = {
    state: "Initiated",
    hubId: actor.hubId,
    fromPersonId: actor.personId,
    fromPersonName: str(hubPerson.name),
    initiatedAt: now,
    initiatedEventId: eventRef.id,
    confirmedByPersonId: null,
    confirmedAt: null,
    confirmedEventId: null,
  };

  // 1) The FinalMile leg records the handover as initiated. Custody is
  //    UNCHANGED — the parcel is still physically at the hub until Rider 2
  //    confirms.
  tx.set(legRef, { status: "HandoverInitiated", destinationHandover: handover, updatedAt: now }, { merge: true });

  // 2) Append-only event (deterministic id -> idempotent). Person actor.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: currentLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "person",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "DestinationHandoverInitiated",
    fromStage: "Assigned",
    toStage: "HandoverInitiated",
    fromStatus: job.status,
    toStatus: job.status, // unchanged — custody has not moved yet
    personId: actor.personId,
    handoverRole: "outgoing",
    custodyToKind: null,
    hubId: actor.hubId,
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 3) Job touch only (audit trail). currentStage/custody/currentHubId/
  //    responsibleParty/assignedPersonId are all UNTOUCHED — nothing about the
  //    job's accountable party changes until Rider 2 confirms.
  tx.set(jobRef, { lastEventId: eventRef.id, lastEventAt: now, updatedAt: now }, { merge: true });

  return { ok: true, jobId: args.jobId, stage: "HandoverInitiated", hubId: actor.hubId, currentLegId, toPersonId };
}

// ===========================================================================
// 2) Rider 2 -> "I received this shipment."
// ===========================================================================

// The actor is Rider 2 — resolved server-side (resolveDeliveryActor). No
// hubId: a rider is not stationed at a hub. Authorization is that this EXACT
// person is leg.assignedPersonId (the dispatcher's selection) — the sole
// source of truth; no separate "toPersonId" is trusted or introduced.
export type DestinationHandoverConfirmActor = { uid: string; companyId: string; personId: string };

export type DestinationHandoverConfirmResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "FinalMileAssigned";
  hubId: string;
  currentLegId: string;
  riderId: string;
};

export async function applyDestinationHandoverConfirm(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; actor: DestinationHandoverConfirmActor }
): Promise<DestinationHandoverConfirmResult> {
  const { actor } = args;

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Payment Lifecycle V1 — a Cancelled/Returned order's job must not keep
  // progressing through this handover (see execution.ts's identical guard).
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
  }
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Destination-hub handover is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency: authorized, never unconditional — only the ORIGINAL confirmer
  // (event.personId) may receive the safe no-op.
  const eventRef = db.collection("deliveryEvents").doc(destinationHandoverConfirmEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    const existing = eventSnap.data() as DeliveryEvent;
    if (existing.personId !== actor.personId) {
      throw new ExecutionError("This shipment was already received by another rider.", 403);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "FinalMileAssigned",
      hubId: typeof job.destinationHubId === "string" ? job.destinationHubId : "",
      currentLegId: job.currentLegId ?? currentLegId,
      riderId: actor.personId,
    };
  }

  // State preconditions: the Destination Hub Person must have already
  // initiated the handover on this exact FinalMile leg.
  if (leg.type !== "FinalMile" || leg.status !== "HandoverInitiated" || leg.destinationHandover?.state !== "Initiated") {
    throw new ExecutionError("This shipment is not awaiting your receipt.", 409);
  }
  const handoverIn = leg.destinationHandover;
  const hubId = handoverIn.hubId;

  // Defense in depth: the shipment must STILL be physically parked at the
  // destination hub (no person holding it) — custody was never touched by
  // initiate, so this can only fail if something else has mutated the leg
  // between initiate and confirm, which the leg.status/destinationHandover
  // check above should already have caught. Verified independently anyway.
  const custBefore = leg.custody;
  if (!custBefore || custBefore.holderKind !== "COMPANY" || custBefore.personId !== null || custBefore.hubId !== hubId) {
    throw new ExecutionError("Shipment is not currently held at the destination hub.", 409);
  }

  // The receiving actor must be the EXACT person the dispatcher selected — the
  // leg's own assignedPersonId is the sole source of truth (no client-supplied
  // "toPersonId" is ever trusted).
  if (leg.assignedPersonId !== actor.personId) {
    throw new ExecutionError("You are not the final-mile rider selected for this shipment.", 403);
  }
  if (actor.personId === handoverIn.fromPersonId) {
    throw new ExecutionError("The receiving rider must be different from the releasing hub person.", 409);
  }

  // Re-validate Rider 2 against the authoritative record: same company, never
  // a HUB_PERSON, Active. Availability is deliberately NOT re-checked here —
  // Rider 2 is expected to already be Busy (set at selection time), and that
  // is not a rejection condition for confirming a handover they were already
  // assigned.
  const riderRef = db.collection("deliveryPersons").doc(actor.personId);
  const riderSnap = await tx.get(riderRef);
  if (!riderSnap.exists) throw new ExecutionError("Delivery person not found.", 404);
  const rider = riderSnap.data() as DeliveryPerson;
  assertCompanyPerson(rider, actor.companyId);
  assertRiderPerson(rider);
  const accountStatus = rider.accountStatus ?? (rider.status === "Inactive" ? "Suspended" : "Active");
  if (accountStatus !== "Active") throw new ExecutionError("That delivery person is not active.", 409);

  // Delivery Notification System V1 — the outgoing Destination Hub Person's
  // uid, for a courtesy "your handover is complete" signal.
  let outgoingHubPersonUid: string | null = null;
  const outgoingHubPersonSnap = await tx.get(db.collection("deliveryPersons").doc(handoverIn.fromPersonId));
  if (outgoingHubPersonSnap.exists) {
    const uid = (outgoingHubPersonSnap.data() as DeliveryPerson).uid;
    outgoingHubPersonUid = typeof uid === "string" && uid ? uid : null;
  }

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody moves onto Rider 2 — no longer at the hub (hubId null).
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: actor.personId,
    companyId: actor.companyId,
    hubId: null,
    since: now,
    sinceEventId: eventRef.id,
  };
  const handoverOut: DestinationHandover = {
    ...handoverIn,
    state: "Confirmed",
    confirmedByPersonId: actor.personId,
    confirmedAt: now,
    confirmedEventId: eventRef.id,
  };

  // 1) The FinalMile leg is reset to "Assigned" — now WITH custody. This is
  //    exactly the hybrid state execution.ts's OUT_FOR_DELIVERY transition
  //    already documents and accepts for a COMPANY_HUB final-mile leg, so
  //    Rider 2's later OUT_FOR_DELIVERY/DELIVER scans need no changes at all.
  tx.set(legRef, { status: "Assigned", custody, destinationHandover: handoverOut, updatedAt: now }, { merge: true });

  // 2) Append-only event (deterministic id -> idempotent). Rider 2 is the
  //    actor; the releasing Destination Hub Person's identity is preserved via
  //    their own DestinationHandoverInitiated event and cross-referenced here.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: currentLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "person",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "DestinationHandoverConfirmed",
    fromStage: "HandoverInitiated",
    toStage: "Assigned",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — the Company Job remains active
    personId: actor.personId,
    handoverRole: "incoming",
    custodyToKind: "COMPANY",
    hubId,
    at: now,
    geo: null,
    notes: `Received from hub person ${handoverIn.fromPersonId}.`,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 3) Advance the job: custody -> Rider 2, no longer at any hub, and
  //    responsibleParty now names Rider 2 — the Destination Hub Person's
  //    responsibility for this job formally ends here. currentStage stays
  //    "FinalMileAssigned" (still accurate: a final-mile rider IS assigned and
  //    now also physically carrying it); assignedPersonId/Name/Phone were
  //    already Rider 2 since selection, so they are unchanged. Rider 2's
  //    availability was already set Busy at selection — no change needed.
  tx.set(
    jobRef,
    {
      custody,
      currentHubId: null,
      responsibleParty: { kind: "COMPANY", companyId: actor.companyId, personId: actor.personId },
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1 — internal, delivery-person-only signal.
  if (outgoingHubPersonUid) {
    emitDeliveryNotification(tx, db, {
      type: "DELIVERY_STATE_CHANGED",
      recipient: { role: "delivery_person", userId: outgoingHubPersonUid },
      eventId: eventRef.id,
      title: "Handover confirmed",
      message: `Shipment ${job.shipmentNumber} was received by the assigned rider — your handover is complete.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return {
    ok: true,
    jobId: args.jobId,
    stage: "FinalMileAssigned",
    hubId: typeof job.destinationHubId === "string" ? job.destinationHubId : hubId,
    currentLegId,
    riderId: actor.personId,
  };
}
