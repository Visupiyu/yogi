// SERVER-ONLY. COMPANY_HUB journey — destination hub → final-mile person
// SELECTION (four-actor model, Phase 2 — step 1 of 2).
//
//   … → DESTINATION HUB → [FINAL-MILE PERSON selected]   ← this transition
//
// The company DISPATCHER (the server-authoritative company actor — the same
// authority the existing pre-execution assignment primitive, assignCompanyPerson,
// already trusts to select the company's own people) SELECTS an eligible company
// delivery person (Rider 2) to carry the parcel from the destination hub to the
// customer. Two distinct parties are involved, and NEITHER is client-controlled:
// the INITIATING actor is the authenticated company dispatcher (resolved
// server-side), and the RECEIVING person is validated against the company's own
// roster + eligibility.
//
// PHASE 2 CHANGE: this used to ALSO move custody from the hub to Rider 2 in the
// same step — a fiction, since the dispatcher's selection is not a physical
// event and no hub person ever released the parcel. Selection and physical
// custody are now separate: THIS function only selects Rider 2 (Busy, a new
// "Assigned" FinalMile leg, assignedPersonId set — an explicit, server-owned
// "assigned, awaiting handover" state, exactly mirroring how a first-mile Pickup
// leg starts "Assigned" before a PICKUP scan ever moves custody). Custody stays
// exactly where the destination-hub receipt left it (parked at the hub) until
// the authenticated Destination Hub Person → Rider 2 handover in
// destinationHandover.ts confirms receipt. job.status stays InProgress
// throughout; OutForDelivery/DELIVER are later, unaffected slices.
//
// WHY A NEW OPERATION (not assignCompanyPerson): the existing company-assign
// primitive is gated to a company's post-acceptance statuses (AcceptedByCompany
// / AssignedToCompany) and operates on the job's initial/current leg; it refuses an
// InProgress job and would overwrite the original assignment semantics. So this
// creates the smallest dedicated operation, REUSING the existing eligibility
// validators (assertCompanyPerson + assertPersonAssignable + assertRiderPerson)
// and the existing company dispatcher authority, without modifying
// assignCompanyPerson, the scan FSM, or the YOMICO DIRECT path.
// job.assignedPersonId is NEVER used to authorize the final-mile person — the
// dispatcher's selection + eligibility is the authority.
import type { Transaction, Firestore, DocumentReference } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { assertCompanyPerson, assertPersonAssignable, assertRiderPerson, hasOtherActiveJobs, releaseAfterLosingJob } from "@/lib/deliveryEngine/assignment";
import { deliveryLegId } from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryPerson,
  DeliveryEvent,
} from "@/lib/deliveryEngine/types";
import { emitDeliveryNotification, readCustomerUid } from "@/lib/deliveryEngine/notifications";

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
  // Payment Lifecycle V1 — a Cancelled/Returned order's job must not keep
  // progressing (see execution.ts's identical guard).
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
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
  assertRiderPerson(person); // never a HUB_PERSON (else 409) — four-actor invariant
  assertPersonAssignable(person); // Active account AND Available (else 409)

  // Delivery Notification System V1 — the customer recipient (RIDER_ASSIGNED)
  // and the Destination Hub Person currently responsible for this job (their
  // own HUB_TASK_ASSIGNED "ready for handover" task — a SPECIFIC named
  // person here, unlike the origin/destination-receipt fan-out, because
  // job.responsibleParty already names exactly one accountable hub person).
  const customerUid = await readCustomerUid(tx, db, job.orderId);
  let responsibleHubPersonUid: string | null = null;
  if (job.responsibleParty?.kind === "COMPANY" && job.responsibleParty.personId) {
    const hubPersonSnap = await tx.get(db.collection("deliveryPersons").doc(job.responsibleParty.personId));
    if (hubPersonSnap.exists) {
      const uid = (hubPersonSnap.data() as DeliveryPerson).uid;
      responsibleHubPersonUid = typeof uid === "string" && uid ? uid : null;
    }
  }

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // PHASE 2: custody is NOT moved here. It stays exactly as the destination-hub
  // receipt left it (parked at the hub, holderKind COMPANY, personId null) — the
  // new leg carries the SAME custody value forward unchanged. Only an
  // authenticated Destination Hub Person → Rider 2 handover (destinationHandover
  // .ts) may move it onto the person.
  const custody = cust;

  // 1) The destination-hub leg is NOT completed/altered here — the parcel has
  //    not physically left it yet; only a selection has been made. It stops
  //    being current simply because currentLegId below points elsewhere.

  // 2) Create the final-mile leg: Rider 2 SELECTED (assignedPersonId set, Busy),
  //    but custody is still at the hub — an explicit "Assigned, awaiting
  //    handover" state, exactly like a fresh first-mile Pickup leg before its
  //    PICKUP scan. The destination is the customer — known, not fabricated.
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
    status: "Assigned", // person selected; custody handover is still pending
    from: { stage: destHubName },
    to: { stage: "Customer" }, // final mile goes to the customer — a real fact
    assignedPersonName: str(person.name),
    assignedAt: now,
    assignedBy: actor.uid,
    custody,
    handover: null,
    destinationHandover: null,
    proof: null,
    exception: null,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  tx.set(jobRef.collection("legs").doc(newLegId), newLeg);

  // 3) Append-only event (deterministic id → idempotent). Company (dispatcher)
  //    actor; the SELECTED final-mile person is recorded as personId. No
  //    custodyToKind — this is a selection, not a custody-changing event.
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
    custodyToKind: null, // custody has NOT moved — still parked at the hub
    hubId: destHubId, // the destination hub the parcel is still held at (audit)
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) Rider 2 is now SELECTED → Busy (atomic with the selection;
  //    assertPersonAssignable already required Available, so this cannot
  //    double-book). Mirrors assignCompanyPerson's Busy transition — an
  //    explicit, server-owned "assigned, awaiting handover" state; Rider 2 does
  //    not yet have physical custody (see destinationHandover.ts).
  tx.set(personRef, { availability: "Busy", updatedAt: now }, { merge: true });

  // 5) Advance the job: currentLegId → final-mile leg, final-mile-assigned
  //    stage, assignedPersonId → Rider 2 (task-visibility mirror — Rider 2 now
  //    sees this job in /my-jobs, exactly as a freshly assigned first-mile
  //    rider would, before physically receiving it). custody/currentHubId/
  //    responsibleParty are DELIBERATELY NOT touched here — they stay exactly
  //    as the destination-hub receipt left them (parked at the hub, Destination
  //    Hub Person responsible) until the authenticated handover confirms.
  //    status stays InProgress (NOT OutForDelivery / terminal).
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "FinalMileAssigned",
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

  // Delivery Notification System V1 — mapping "Final-mile assignment ->
  // RIDER_ASSIGNED" exactly. Rider 1's own first-mile assignment never
  // reaches this notification (see assignment.ts) — only THIS customer-
  // facing final-mile selection does (Company Job rule: no per-internal-
  // handoff customer spam).
  const shipmentRef = job.orderNumber ? `order #${job.orderNumber}` : `shipment ${job.shipmentNumber}`;
  if (customerUid) {
    emitDeliveryNotification(tx, db, {
      type: "RIDER_ASSIGNED",
      recipient: { role: "customer", userId: customerUid },
      eventId: eventRef.id,
      title: "Rider assigned",
      message: `A delivery rider has been assigned to your ${shipmentRef}.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  // Internal, delivery-person-only signals below — never customer/seller.
  emitDeliveryNotification(tx, db, {
    type: "DELIVERY_JOB_ASSIGNED",
    recipient: { role: "delivery_person", userId: person.uid },
    eventId: eventRef.id,
    title: "New delivery assigned",
    message: `A final-mile delivery (shipment ${job.shipmentNumber}) has been assigned to you.`,
    orderId: job.orderId,
    orderNumber: job.orderNumber,
    sellerOrderId: job.sellerOrderId,
    deliveryJobId: args.jobId,
    now,
  });
  if (responsibleHubPersonUid) {
    emitDeliveryNotification(tx, db, {
      type: "HUB_TASK_ASSIGNED",
      recipient: { role: "delivery_person", userId: responsibleHubPersonUid },
      eventId: eventRef.id,
      title: "Shipment ready for destination handover",
      message: `Shipment ${job.shipmentNumber} is ready to hand over to the assigned rider.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { ok: true, jobId: args.jobId, stage: "FinalMileAssigned", personId: finalMilePersonId, currentLegId: newLegId };
}

// ===========================================================================
// 2) Company dispatcher -> CORRECT the final-mile person BEFORE handover
//    (functional-gap fix: applyFinalMileAssignment above has no way to change
//    Rider 2 once selected, even before any physical hand-off has started).
//
// This is a CORRECTIVE ASSIGNMENT mutation, not a new physical transition — the
// FinalMile leg stays "Assigned", destinationHandover stays absent, custody
// stays parked at the hub, and responsibleParty stays the destination-hub/
// company side throughout. Because nothing about that state changes when the
// selected person changes, this follows assignment.ts's OWN idempotency
// pattern (compare against the CURRENT leg.assignedPersonId, `changed: false`
// no-op) rather than the fixed-deterministic-event-id pattern the physical
// handover/receipt transitions use — a dispatcher may legitimately call this
// more than once (correct a mistake, then correct it again), which a
// single-use deterministic event id would permanently block after the first
// call (see applyFinalMileAssignment's own event, which is intentionally
// one-time for that reason).
//
// The precondition below MUST fail once destination-hub handover has started
// in ANY way (leg.destinationHandover present — "Initiated" or "Confirmed"
// both count) or custody has left the hub (Rider 2 already holds it) or the
// leg has advanced past "Assigned" (OutForDelivery/Delivered) — reassignment
// is a pre-handover correction only.
export type FinalMileReassignResult = {
  ok: true;
  changed: boolean;
  jobId: string;
  personId: string;
  previousPersonId: string | null;
  currentLegId: string;
};

export async function applyFinalMileReassignment(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; personId: string; actor: FinalMileAssignActor }
): Promise<FinalMileReassignResult> {
  const { actor } = args;
  const newPersonId = typeof args.personId === "string" ? args.personId.trim() : "";
  if (!newPersonId) throw new ExecutionError("A replacement final-mile delivery person is required.", 400);

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  // Ownership — never from the client body. Rejects another company's job.
  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Payment Lifecycle V1 — see the identical guard on assignment above.
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
  }
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Final-mile reassignment is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Precondition: a final-mile rider must already be selected, physical
  // hand-off must NOT have started in any way (destinationHandover absent —
  // both "Initiated" and "Confirmed" block this), and the leg must still be
  // in the plain "Assigned" state (rejects HandoverInitiated, and rejects the
  // POST-confirm "Assigned-with-custody-on-Rider-2" hybrid state together with
  // the custody check below, and rejects OutForDelivery/Delivered).
  if (
    job.currentStage !== "FinalMileAssigned" ||
    leg.type !== "FinalMile" ||
    leg.status !== "Assigned" ||
    leg.destinationHandover ||
    !leg.assignedPersonId
  ) {
    throw new ExecutionError("This shipment is not awaiting final-mile reassignment.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || cust.personId !== null || cust.companyId !== actor.companyId || !cust.hubId) {
    throw new ExecutionError("Shipment is not currently held at this company's destination hub.", 409);
  }
  // responsibleParty must still be the destination-hub/company side — physical
  // accountability has not moved to a rider either.
  if (!job.responsibleParty || job.responsibleParty.kind !== "COMPANY" || job.responsibleParty.companyId !== actor.companyId) {
    throw new ExecutionError("Shipment responsibility is not currently at your company's hub.", 409);
  }

  const previousPersonId = leg.assignedPersonId;

  // Idempotent: already assigned to exactly this person — a safe no-op. This
  // ALSO protects a genuine retry from spuriously failing eligibility below
  // (the target person is now Busy precisely because this same call already
  // assigned them).
  if (previousPersonId === newPersonId) {
    return { ok: true, changed: false, jobId: args.jobId, personId: newPersonId, previousPersonId, currentLegId };
  }

  const prevRef = db.collection("deliveryPersons").doc(previousPersonId);
  const prevSnap = await tx.get(prevRef);
  const prevPerson = prevSnap.exists ? (prevSnap.data() as DeliveryPerson) : null;
  // Multi-parcel (READ phase): does the previous Rider 2 still hold another
  // active job? If so they stay Busy when we free them from THIS job below.
  const prevHasOtherActive = prevPerson
    ? await hasOtherActiveJobs(tx, db, previousPersonId, args.jobId)
    : false;

  const newRef = db.collection("deliveryPersons").doc(newPersonId);
  const newSnap = await tx.get(newRef);
  if (!newSnap.exists) throw new ExecutionError("Delivery person not found.", 404);
  const newPerson = newSnap.data() as DeliveryPerson;

  // ---- VALIDATE the replacement Rider 2 (same eligibility as initial select) ----
  assertCompanyPerson(newPerson, actor.companyId); // belongs to this company (else 403)
  assertRiderPerson(newPerson); // never a HUB_PERSON (else 409) — four-actor invariant
  assertPersonAssignable(newPerson); // Active AND Available (else 409)

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // 1) Free the previous Rider 2 ONLY if they hold no other active job
  //    (multi-parcel); otherwise they stay Busy. Never clobbers a manual Offline.
  if (prevPerson) releaseAfterLosingJob(tx, prevRef, prevPerson, prevHasOtherActive, now);
  // 2) New Rider 2 -> Busy (assertPersonAssignable already required Available,
  //    so this cannot double-book).
  tx.set(newRef, { availability: "Busy", updatedAt: now }, { merge: true });

  // 3) FinalMile leg: swap the assigned person only. custody/destinationHandover
  //    are DELIBERATELY UNTOUCHED — physical custody has not moved and no
  //    handover record exists; this is a selection correction only.
  tx.set(
    legRef,
    {
      assignedPersonId: newPersonId,
      assignedPersonName: str(newPerson.name),
      assignedAt: now,
      assignedBy: actor.uid,
      updatedAt: now,
    },
    { merge: true }
  );

  // 4) Append-only event. Auto-generated id (not a fixed deterministic one) —
  //    this is a correctable assignment mutation that may legitimately recur,
  //    unlike the physical handover/receipt transitions elsewhere in this
  //    engine. Carries both the previous and new rider identity for audit.
  const eventRef = db.collection("deliveryEvents").doc();
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: currentLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "company",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "FinalMileReassignment",
    fromStage: job.currentStage,
    toStage: job.currentStage, // unchanged — still FinalMileAssigned
    fromStatus: job.status,
    toStatus: job.status, // unchanged — stays InProgress
    personId: newPersonId,
    custodyToKind: null, // custody has NOT moved — no handover occurred
    hubId: cust.hubId,
    at: now,
    geo: null,
    notes: `Reassigned final-mile rider from ${previousPersonId} to ${newPersonId}.`,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 5) Job mirror updated to the new rider. currentStage/status/custody/
  //    responsibleParty are ALL UNTOUCHED — this corrects WHO is selected,
  //    not a physical transition.
  tx.set(
    jobRef,
    {
      assignedPersonId: newPersonId,
      assignedPersonName: str(newPerson.name),
      assignedPersonPhone: str(newPerson.phone, 40),
      assignedAt: now,
      assignedBy: actor.uid,
      lastEventId: eventRef.id,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery Notification System V1 — internal, delivery-person-only signal
  // to the NEW rider only (this is a pre-handover correction, not a new
  // customer-facing milestone — the customer already got RIDER_ASSIGNED at
  // the original selection and is not re-notified for a dispatcher correction).
  emitDeliveryNotification(tx, db, {
    type: "DELIVERY_JOB_REASSIGNED",
    recipient: { role: "delivery_person", userId: newPerson.uid },
    eventId: eventRef.id,
    title: "Delivery assignment changed",
    message: `A final-mile delivery (shipment ${job.shipmentNumber}) has been assigned to you.`,
    orderId: job.orderId,
    orderNumber: job.orderNumber,
    sellerOrderId: job.sellerOrderId,
    deliveryJobId: args.jobId,
    now,
  });

  return { ok: true, changed: true, jobId: args.jobId, personId: newPersonId, previousPersonId, currentLegId };
}
