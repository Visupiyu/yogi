// SERVER-ONLY. COMPANY_HUB journey — origin-hub handover (four-actor model,
// Phase 1 of 4).
//
//   SELLER → RIDER 1 → [ORIGIN HUB PERSON receives]   ← this transition
//
// Two SEPARATE authenticated physical actors, TWO transactions:
//   1) applyOriginHubHandoverInitiate — Rider 1 (the current custody holder)
//      declares "I am handing this shipment to the Origin Hub." Custody does
//      NOT move yet: Rider 1 still physically holds the parcel.
//   2) applyOriginHubReceiptConfirm  — a DIFFERENT authenticated actor, the
//      Origin Hub Person stationed at that exact hub, declares "I received
//      this shipment." THIS is what moves custody to COMPANY at the hub,
//      completes Rider 1's task (Busy -> Available), and creates the next
//      (HubIntake) leg. The Company Job stays InProgress throughout — it is
//      never Delivered and never disappears from the Company Console.
//
// Neither step is part of applyScan (the person-driven, single-leg scan FSM):
// keeping that path, and therefore the YOMICO DIRECT flow, byte-for-byte
// unchanged. Each step is atomic: every read happens before any write, and a
// failure can never leave a half-moved job. Destination-hub / final-mile /
// Rider 2 are explicitly OUT of scope here — nothing below creates or implies
// that state.
import type { Transaction, Firestore, DocumentReference } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { assertHubPerson, hasOtherActiveJobs, releaseAfterLosingJob } from "@/lib/deliveryEngine/assignment";
import { deliveryLegId } from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryHub,
  DeliveryPerson,
  DeliveryEvent,
  CustodyState,
  OriginHubHandover,
} from "@/lib/deliveryEngine/types";
import { emitDeliveryNotification, readCustomerUid, readHubPersonRecipients } from "@/lib/deliveryEngine/notifications";

function originHubHandoverInitiateEventId(jobId: string): string {
  return `${jobId}__origin_hub_handover_initiate`;
}
function originHubReceiptConfirmEventId(jobId: string): string {
  return `${jobId}__origin_hub_receipt_confirm`;
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
// 1) Rider 1 -> "I am handing this shipment to the Origin Hub."
// ===========================================================================

// The actor is the COMPANY delivery PERSON who currently physically holds the
// shipment (Rider 1) — NOT the company owner. Company ownership ≠ physical
// custody: only the custody-holding person may initiate a handover.
export type OriginHubHandoverInitiateActor = { uid: string; companyId: string; personId: string };

export type OriginHubHandoverInitiateResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "HandoverInitiated";
  hubId: string;
  currentLegId: string;
};

export async function applyOriginHubHandoverInitiate(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; hubId?: string | null; actor: OriginHubHandoverInitiateActor }
): Promise<OriginHubHandoverInitiateResult> {
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
  // Payment Lifecycle V1 — a Cancelled/Returned order's job must not keep
  // progressing through the hub network (see execution.ts's identical guard).
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
  }
  // Physical model: DIRECT can never undergo an origin-hub handover.
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Origin-hub handover is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency: the one-time initiate event already exists -> no-op replay,
  // but AUTHORIZED, never unconditional: only the ORIGINAL initiator (recorded
  // as event.personId) may receive the safe no-op. A different same-company
  // person is rejected; other-company persons were already rejected above.
  const eventRef = db.collection("deliveryEvents").doc(originHubHandoverInitiateEventId(args.jobId));
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
      stage: "HandoverInitiated",
      hubId: typeof existing.hubId === "string" ? existing.hubId : "",
      currentLegId: job.currentLegId ?? currentLegId,
    };
  }

  // State/custody preconditions: must be the picked-up first-mile Pickup leg,
  // held by one of this company's people. Rejects Created/Assigned (not
  // PickedUp), seller custody, an already-initiated/confirmed handover, etc.
  if (leg.type !== "Pickup" || leg.status !== "PickedUp") {
    throw new ExecutionError("Shipment is not awaiting an origin-hub handover.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || !cust.personId || cust.companyId !== actor.companyId) {
    throw new ExecutionError("Shipment is not currently held by a company delivery person.", 409);
  }
  // The actor MUST be the person currently holding the shipment. Company
  // ownership does not grant this — only the custody holder may initiate it.
  if (cust.personId !== actor.personId) {
    throw new ExecutionError("You do not currently hold this shipment.", 403);
  }

  // Resolve the origin hub (explicit hubId, else derive the company's single
  // active hub). Company-scoped: hub.companyId MUST equal the actor's company.
  let hubId: string;
  if (typeof args.hubId === "string" && args.hubId.trim()) {
    hubId = args.hubId.trim();
    const hubRef = db.collection("deliveryHubs").doc(hubId);
    const hubSnap = await tx.get(hubRef);
    if (!hubSnap.exists) throw new ExecutionError("Hub not found.", 404);
    const hub = hubSnap.data() as DeliveryHub;
    if (hub.companyId !== actor.companyId) throw new ExecutionError("That hub belongs to another company.", 403);
    if (hub.status !== "Active") throw new ExecutionError("That hub is not active.", 409);
  } else if (typeof job.originHubId === "string" && job.originHubId.trim()) {
    // The operator's per-job origin-hub selection made on the Job Card
    // (job.originHubId). This is what lets a company run MULTIPLE active hubs:
    // the hub for THIS shipment is chosen per job, not inferred from a
    // single-active assumption.
    hubId = job.originHubId.trim();
    const hubRef = db.collection("deliveryHubs").doc(hubId);
    const hubSnap = await tx.get(hubRef);
    if (!hubSnap.exists) throw new ExecutionError("The selected origin hub was not found.", 404);
    const hub = hubSnap.data() as DeliveryHub;
    if (hub.companyId !== actor.companyId) throw new ExecutionError("That hub belongs to another company.", 403);
    if (hub.status !== "Active") throw new ExecutionError("The selected origin hub is not active.", 409);
  } else {
    // Fallback when no per-job selection and no explicit hubId: the company's
    // single active hub. With multiple active hubs the operator must choose one
    // on the Job Card (stored as job.originHubId) — we never guess between them.
    const hubsSnap = await tx.get(db.collection("deliveryHubs").where("companyId", "==", actor.companyId));
    const active = hubsSnap.docs.filter((d) => (d.data() as DeliveryHub).status === "Active");
    if (active.length === 0) throw new ExecutionError("Your company has no active hub configured.", 409);
    if (active.length > 1) throw new ExecutionError("Select an origin hub for this shipment on the Job Card.", 400);
    hubId = active[0].id;
  }

  // Read Rider 1's own doc (for the denormalized fromPersonName only).
  const personRef = db.collection("deliveryPersons").doc(actor.personId);
  const personSnap = await tx.get(personRef);
  const person = personSnap.exists ? (personSnap.data() as DeliveryPerson) : null;

  // Delivery Notification System V1 — HUB_TASK_ASSIGNED fans out to every
  // active Hub Person stationed at this hub (no single named person owns an
  // origin-hub-receipt task — any of them may confirm it).
  const hubRecipients = await readHubPersonRecipients(tx, db, actor.companyId, hubId);

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  const handover: OriginHubHandover = {
    state: "Initiated",
    hubId,
    fromPersonId: actor.personId,
    fromPersonName: str(person?.name),
    initiatedAt: now,
    initiatedEventId: eventRef.id,
    confirmedByPersonId: null,
    confirmedAt: null,
    confirmedEventId: null,
  };

  // 1) The Pickup leg records the handover as initiated. Custody is UNCHANGED
  //    — Rider 1 still physically holds the parcel until a Hub Person confirms.
  tx.set(legRef, { status: "HandoverInitiated", originHubHandover: handover, updatedAt: now }, { merge: true });

  // 2) Append-only event (deterministic id -> idempotent). Person actor.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: currentLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "person",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "OriginHubHandoverInitiated",
    fromStage: "PickedUp",
    toStage: "HandoverInitiated",
    fromStatus: job.status,
    toStatus: job.status, // unchanged — this is not custody or job-status yet
    personId: actor.personId,
    handoverRole: "outgoing",
    custodyToKind: null, // custody has not moved
    hubId,
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 3) Job-level task-queue marker for the receiving Hub Person (my-hub-tasks).
  //    Job status/currentStage/custody/assignedPersonId are all UNTOUCHED —
  //    Rider 1's job-level assignment stays exactly as it is until confirmed.
  tx.set(
    jobRef,
    {
      pendingOriginHubHandover: handover,
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1 — internal, delivery-person-only signal.
  for (const hp of hubRecipients) {
    emitDeliveryNotification(tx, db, {
      type: "HUB_TASK_ASSIGNED",
      recipient: { role: "delivery_person", userId: hp.uid },
      eventId: eventRef.id,
      title: "Shipment ready for hub receipt",
      message: `A shipment (${job.shipmentNumber}) is awaiting receipt at your hub.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { ok: true, jobId: args.jobId, stage: "HandoverInitiated", hubId, currentLegId };
}

// ===========================================================================
// 2) Origin Hub Person -> "I received this shipment."
// ===========================================================================

// The actor is the authenticated Origin Hub Person — a DIFFERENT physical
// actor from Rider 1 — resolved server-side (resolveDeliveryActor) and
// re-validated here (assertHubPerson) against the hub the handover targeted.
// hubId comes from the actor's OWN person record, never the request body.
export type OriginHubReceiptConfirmActor = { uid: string; companyId: string; personId: string; hubId: string };

export type OriginHubReceiptConfirmResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "AtOriginHub";
  hubId: string;
  currentLegId: string;
  hubPersonId: string;
};

export async function applyOriginHubReceiptConfirm(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; actor: OriginHubReceiptConfirmActor }
): Promise<OriginHubReceiptConfirmResult> {
  const { actor } = args;

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Payment Lifecycle V1 — see the identical guard on initiate above.
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
  }
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Origin-hub receipt is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency: authorized, never unconditional — only the ORIGINAL confirmer
  // (event.personId) may receive the safe no-op.
  const eventRef = db.collection("deliveryEvents").doc(originHubReceiptConfirmEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    const existing = eventSnap.data() as DeliveryEvent;
    if (existing.personId !== actor.personId) {
      throw new ExecutionError("This shipment was already received by another hub person.", 403);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "AtOriginHub",
      hubId: typeof job.currentHubId === "string" ? job.currentHubId : actor.hubId,
      currentLegId: job.currentLegId ?? currentLegId,
      hubPersonId: actor.personId,
    };
  }

  // State preconditions: Rider 1 must have already initiated the handover on
  // this exact Pickup leg. Rejects PickedUp-not-yet-initiated, already
  // confirmed/advanced, terminal, etc.
  if (leg.type !== "Pickup" || leg.status !== "HandoverInitiated" || leg.originHubHandover?.state !== "Initiated") {
    throw new ExecutionError("This shipment is not awaiting origin-hub receipt.", 409);
  }
  const handoverIn = leg.originHubHandover;
  const hubId = handoverIn.hubId;

  // The receiving actor must be stationed at the EXACT hub Rider 1 targeted,
  // and must be a DIFFERENT authenticated person from Rider 1.
  if (actor.hubId !== hubId) {
    throw new ExecutionError("This shipment was not handed to your hub.", 403);
  }
  if (actor.personId === handoverIn.fromPersonId) {
    throw new ExecutionError("The receiving hub person must be different from the rider handing it over.", 409);
  }

  // Re-validate the receiving person against the authoritative record: same
  // company, role HUB_PERSON, stationed at this hub, Active. Never trusts
  // companyId/hubId/role from the client — this reads the person doc fresh.
  const hubPersonRef = db.collection("deliveryPersons").doc(actor.personId);
  const hubPersonSnap = await tx.get(hubPersonRef);
  if (!hubPersonSnap.exists) throw new ExecutionError("Delivery person not found.", 404);
  const hubPerson = hubPersonSnap.data() as DeliveryPerson;
  assertHubPerson(hubPerson, actor.companyId, hubId);

  // Resolve the hub name (for the new leg's `from` label) and re-confirm it is
  // this company's Active hub (defense in depth; already implied by
  // assertHubPerson + the handover's own hubId, which was validated at
  // initiate time).
  const hubRef = db.collection("deliveryHubs").doc(hubId);
  const hubSnap = await tx.get(hubRef);
  if (!hubSnap.exists) throw new ExecutionError("Hub not found.", 404);
  const hub = hubSnap.data() as DeliveryHub;
  if (hub.companyId !== actor.companyId) throw new ExecutionError("That hub belongs to another company.", 403);
  const hubName = typeof hub.name === "string" && hub.name ? hub.name : "Origin hub";

  // Read Rider 1 (to release Busy -> Available now that their task is done).
  const riderRef: DocumentReference = db.collection("deliveryPersons").doc(handoverIn.fromPersonId);
  const riderSnap = await tx.get(riderRef);
  const rider = riderSnap.exists ? (riderSnap.data() as DeliveryPerson) : null;
  // Multi-parcel (READ phase): does Rider 1 still hold another active job? If so
  // they stay Busy when freed from THIS job below; only a rider with zero other
  // active jobs returns to Available.
  const riderHasOtherActive = rider
    ? await hasOtherActiveJobs(tx, db, handoverIn.fromPersonId, args.jobId)
    : false;

  // Delivery Notification System V1 — customer recipient for ORIGIN_HUB_RECEIVED.
  const customerUid = await readCustomerUid(tx, db, job.orderId);

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody moves to the COMPANY, parked at the hub — a custody LOCATION, not
  // the receiving Hub Person (a hub is never a custody-holding "actor").
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: null,
    companyId: actor.companyId,
    hubId,
    since: now,
    sinceEventId: eventRef.id,
  };
  const handoverOut: OriginHubHandover = {
    ...handoverIn,
    state: "Confirmed",
    confirmedByPersonId: actor.personId,
    confirmedAt: now,
    confirmedEventId: eventRef.id,
  };

  // 1) Complete the Pickup leg (Rider 1's task is done) and move its custody
  //    to the hub. It is no longer the current leg.
  tx.set(legRef, { status: "ArrivedAtStage", custody, originHubHandover: handoverOut, updatedAt: now }, { merge: true });

  // 2) Create the next leg (HubIntake): the parcel is received and held at the
  //    origin hub, awaiting a later transit slice. NOT transit/destination/
  //    final-mile/Rider 2 — none of that is created here.
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

  // 3) Append-only event (deterministic id -> idempotent). The Origin Hub
  //    Person is the actor; Rider 1's identity is preserved via their own
  //    OriginHubHandoverInitiated event (personId there) and referenced here
  //    for a self-contained audit trail.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: newLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "person",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "OriginHubReceiptConfirmed",
    fromStage: "HandoverInitiated",
    toStage: "AtOriginHub",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — the Company Job remains active
    personId: actor.personId,
    handoverRole: "incoming",
    custodyToKind: "COMPANY",
    hubId,
    at: now,
    geo: null,
    notes: `Received from rider ${handoverIn.fromPersonId}.`,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) Free Rider 1 ONLY if they hold no OTHER active job (multi-parcel);
  //    otherwise they stay Busy. Never clobbers a manual Offline. Uses the same
  //    shared helper as execution.ts / finalMileAssign.ts / returnCollection.ts.
  if (rider) releaseAfterLosingJob(tx, riderRef, rider, riderHasOtherActive, now);

  // 5) Advance the job: currentLegId -> new leg, custody at hub, denormalised
  //    tracking fields. status stays InProgress (NOT terminal) — the Company
  //    Job remains active and visible in the Company Console.
  //
  //    THE BUG FIX: assignedPersonId/Name/Phone are CLEARED (mirrors
  //    transit.ts's clearing pattern) so Rider 1 no longer identifies as the
  //    active party on this job and /my-jobs (which queries assignedPersonId)
  //    stops returning it for them. responsibleParty now names the Origin Hub
  //    Person as the current physical/accountable actor — the job-level
  //    "current company/hub responsibility" — while custody itself stays a
  //    hub LOCATION (personId null), never a new custody-holding role.
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "AtOriginHub",
      custody,
      currentHubId: hubId,
      originHubIntakeAt: now,
      pendingOriginHubHandover: null,
      responsibleParty: { kind: "COMPANY", companyId: actor.companyId, personId: actor.personId },
      assignedPersonId: null,
      assignedPersonName: null,
      assignedPersonPhone: null,
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1.
  const shipmentRef = job.orderNumber ? `order #${job.orderNumber}` : `shipment ${job.shipmentNumber}`;
  if (customerUid) {
    emitDeliveryNotification(tx, db, {
      type: "ORIGIN_HUB_RECEIVED",
      recipient: { role: "customer", userId: customerUid },
      eventId: eventRef.id,
      title: "Order update",
      message: `Your ${shipmentRef} has reached our hub and is being processed for onward transport.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  if (job.vendorId) {
    emitDeliveryNotification(tx, db, {
      type: "ORIGIN_HUB_RECEIVED",
      recipient: { role: "seller", userId: job.vendorId },
      eventId: eventRef.id,
      title: "Shipment update",
      message: `${shipmentRef} has reached the origin hub.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  // Rider 1's task on this job is now complete — an internal, delivery-
  // person-only courtesy signal (never a customer/seller notification).
  if (rider?.uid) {
    emitDeliveryNotification(tx, db, {
      type: "DELIVERY_STATE_CHANGED",
      recipient: { role: "delivery_person", userId: rider.uid },
      eventId: eventRef.id,
      title: "Handover confirmed",
      message: `Shipment ${job.shipmentNumber} was received at the origin hub — your handover is complete.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { ok: true, jobId: args.jobId, stage: "AtOriginHub", hubId, currentLegId: newLegId, hubPersonId: actor.personId };
}
