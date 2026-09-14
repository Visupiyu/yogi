// SERVER-ONLY. COMPANY_HUB journey — origin hub → COMPANY-MANAGED transit.
//
//   … → ORIGIN HUB → [COMPANY TRANSIT / LINE-HAUL]   ← this transition
//
// The company dispatches the shipment from its origin hub into its OWN internal
// bulk / inter-city transport. This is COMPANY-MANAGED movement, NOT a YOMICO
// rider delivery task: custody stays at the COMPANY level (holderKind COMPANY,
// personId null) — it is never assigned to an individual delivery person, and no
// rider is made "Busy" or responsible for line-haul. It simply leaves the origin
// hub (hubId null = in company transport, not parked at a hub).
//
// PHASE 5 CHANGE: destinationHubId is now REQUIRED here — the dispatcher (the
// only authoritative, non-guessed source: an explicit human business decision,
// the same authority this function already trusts to dispatch the shipment at
// all) must name the destination hub AT DEPARTURE, not leave it to be decided
// by whichever hub person happens to receive it later. This is validated
// (exists, same company, Active, not the origin hub) and persisted onto the
// job so destination-hub task discovery (my-hub-tasks) has an authoritative
// signal instead of none. It is NEVER derived from a hub count, city/address
// text, or geocoding — see the rejected alternatives in the Phase 5 report.
// destinationHubId is METADATA (the intended destination) and is deliberately
// NOT custody: custody.hubId stays null throughout transit (the parcel is not
// physically at any hub while in transit) — these are different concepts and
// this function does not conflate them.
//
// It is a company DISPATCHER action (role "company"), not a rider scan, so it is
// deliberately NOT part of applyScan — the person-scan FSM and the YOMICO DIRECT
// path stay byte-for-byte unchanged. It is atomic: stamping the hub-intake leg,
// creating the company-transit leg, advancing currentLegId, moving custody to the
// in-transit company state, and appending the event all happen in the caller's
// single transaction.
//
// Authorization is company ownership, checked BEFORE any idempotent success: only
// the owning company may dispatch its own shipment, and another company never
// gets a successful no-op merely because the event exists.
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
import { emitDeliveryNotification, readCustomerUid, readHubPersonRecipients } from "@/lib/deliveryEngine/notifications";

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

// The actor is the company DISPATCHER (role "company"): uid + the company it owns.
// It has NO personId — company transit is not a person's custody.
export type TransitDepartureActor = { uid: string; companyId: string };

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
  args: { jobId: string; destinationHubId: string; actor: TransitDepartureActor }
): Promise<TransitDepartureResult> {
  const { actor } = args;
  const requestedDestHubId = typeof args.destinationHubId === "string" ? args.destinationHubId.trim() : "";
  if (!requestedDestHubId) {
    throw new ExecutionError("A destination hub is required to dispatch this shipment into transit.", 400);
  }

  // ---- READS (all before any write) ----
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ExecutionError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  // Ownership (provider/company) — never from the client body. Rejects another
  // company's job BEFORE any idempotent success. This is the authorization for a
  // COMPANY-MANAGED movement: the owning company dispatches its own shipment.
  if (job.providerType !== "COMPANY" || job.companyId !== actor.companyId) {
    throw new ExecutionError("This shipment belongs to another company.", 403);
  }
  // Payment Lifecycle V1 — a Cancelled/Returned order's job must not keep
  // progressing through company transit (see execution.ts's identical guard).
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
  }
  // Physical model: DIRECT can never enter company transit.
  if (!isCompanyHub(job)) {
    throw new ExecutionError("Transit is not valid for this delivery model.", 409);
  }

  const currentLegId = job.currentLegId;
  if (!currentLegId) throw new ExecutionError("Job has no current leg.", 409);
  const legRef = jobRef.collection("legs").doc(currentLegId);
  const legSnap = await tx.get(legRef);
  if (!legSnap.exists) throw new ExecutionError("Current leg not found.", 409);
  const leg = legSnap.data() as DeliveryLeg;

  // Idempotency — authorized, never unconditional. Company ownership was already
  // verified above (other-company / DIRECT rejected), so a replay by the owning
  // company is a safe no-op; no per-person pin is needed (no person is involved).
  // A replay naming a DIFFERENT destination hub is NOT a silent success — it is
  // a re-routing, which this operation rejects (the destination, once departed
  // with, is not casually reassignable) rather than quietly overwriting it.
  const eventRef = db.collection("deliveryEvents").doc(transitDepartureEventId(args.jobId));
  const eventSnap = await tx.get(eventRef);
  if (eventSnap.exists) {
    if (job.destinationHubId && job.destinationHubId !== requestedDestHubId) {
      throw new ExecutionError("This shipment has already been dispatched to a different destination hub.", 409);
    }
    return {
      ok: true,
      idempotent: true,
      jobId: args.jobId,
      stage: "InTransit",
      currentLegId: job.currentLegId ?? currentLegId,
    };
  }

  // Precondition: the job must be AT THE ORIGIN HUB (company-held, no person) and
  // not already advanced. (Rejects pre-intake states, already-in-transit, etc.)
  if (job.currentStage !== "AtOriginHub" || leg.type !== "HubIntake" || leg.status !== "ArrivedAtStage") {
    throw new ExecutionError("Shipment is not at the origin hub awaiting transit.", 409);
  }
  const cust = leg.custody;
  if (!cust || cust.holderKind !== "COMPANY" || cust.personId !== null || cust.companyId !== actor.companyId || !cust.hubId) {
    throw new ExecutionError("Shipment is not currently held at this company's origin hub.", 409);
  }
  const originHubId = typeof job.currentHubId === "string" && job.currentHubId ? job.currentHubId : cust.hubId;
  const originHubName = typeof leg.from?.stage === "string" && leg.from.stage ? leg.from.stage : "Origin hub";

  // Validate the REQUESTED destination hub (an explicit dispatcher decision,
  // never auto-derived from hub count, city/address text, or geocoding). It
  // must exist, belong to this company, be Active, and not be the origin hub.
  const destHubRef = db.collection("deliveryHubs").doc(requestedDestHubId);
  const destHubSnap = await tx.get(destHubRef);
  if (!destHubSnap.exists) throw new ExecutionError("Destination hub not found.", 404);
  const destHub = destHubSnap.data() as DeliveryHub;
  if (destHub.companyId !== actor.companyId) throw new ExecutionError("That hub belongs to another company.", 403);
  if (destHub.status !== "Active") throw new ExecutionError("That hub is not active.", 409);
  if (requestedDestHubId === originHubId) {
    throw new ExecutionError("The destination hub cannot be the origin hub.", 409);
  }
  const destinationHubId = requestedDestHubId;
  const destHubName = typeof destHub.name === "string" && destHub.name ? destHub.name : "Destination hub";

  // Delivery Notification System V1 — customer recipient (IN_COMPANY_TRANSPORT)
  // and every active Hub Person stationed at the destination hub
  // (HUB_TASK_ASSIGNED — an incoming-shipment task, same "any hub person at
  // that hub" model as the origin-hub receipt task).
  const customerUid = await readCustomerUid(tx, db, job.orderId);
  const destHubRecipients = await readHubPersonRecipients(tx, db, actor.companyId, destinationHubId);

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody stays at the COMPANY level, now in company transport — it has LEFT
  // the origin hub (hubId null) and is NOT held by any person (personId null).
  const custody: CustodyState = {
    holderKind: "COMPANY",
    personId: null,
    companyId: actor.companyId,
    hubId: null,
    since: now,
    sinceEventId: eventRef.id,
  };

  // 1) The HubIntake leg is departed — it stops being current (its historical
  //    "ArrivedAtStage" at the origin hub remains true); just stamp updatedAt.
  tx.set(legRef, { updatedAt: now }, { merge: true });

  // 2) Create the LineHaul leg: the COMPANY-MANAGED transit segment. No person is
  //    assigned — this is the company's own bulk transport, not a rider task.
  const sequence = (typeof leg.sequence === "number" ? leg.sequence : 2) + 1;
  const newLegId = deliveryLegId(args.jobId, sequence);
  const newLeg: DeliveryLeg = {
    jobId: args.jobId,
    shipmentNumber: job.shipmentNumber,
    sequence,
    type: "LineHaul",
    providerType: "COMPANY",
    companyId: actor.companyId,
    assignedPersonId: null, // company-managed transport — NOT a rider responsibility
    status: "InTransit",
    from: { stage: originHubName }, // departed this origin hub
    to: { stage: destHubName }, // the dispatcher's chosen destination — known now, not fabricated
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
  //    actor; no person — company-managed movement.
  const event: DeliveryEvent = {
    jobId: args.jobId,
    legId: newLegId,
    shipmentNumber: job.shipmentNumber,
    actorUid: actor.uid,
    role: "company",
    providerType: "COMPANY",
    companyId: actor.companyId,
    action: "TransitDeparture",
    fromStage: "AtOriginHub",
    toStage: "InTransit",
    fromStatus: job.status,
    toStatus: job.status, // stays InProgress — job ownership/status unchanged
    personId: null, // company-managed transit is not a person's custody
    custodyToKind: "COMPANY",
    hubId: originHubId, // the hub departed FROM (audit)
    at: now,
    geo: null,
    notes: `Dispatched to destination hub ${destinationHubId}.`, // the hub departed TO (audit; DeliveryEvent has only one hubId field)
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event);

  // 4) Advance the job: currentLegId → LineHaul leg, in-transit stage, custody at
  //    the COMPANY level (no person). The first-mile rider is no longer the
  //    responsible/assigned party — clear the assignment mirror so no rider shows
  //    as responsible during company-managed transit (final-mile assigns Rider 2
  //    later). Preserve the origin hub; it is no longer AT a hub.
  //
  //    PHASE 5: destinationHubId is now persisted HERE, at departure — the
  //    authoritative dispatcher-chosen intended destination. This is METADATA,
  //    distinct from custody.hubId (the physical current-hub location, which
  //    stays null throughout transit): destinationHubId says WHERE the
  //    shipment is headed, custody.hubId says WHERE it physically IS right
  //    now (nowhere, while in transit). Setting this does not move custody.
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "InTransit",
      custody,
      originHubId,
      destinationHubId,
      currentHubId: null,
      transitStartedAt: now,
      assignedPersonId: null,
      assignedPersonName: null,
      assignedPersonPhone: null,
      responsibleParty: { kind: "COMPANY", companyId: actor.companyId, personId: null },
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
      type: "IN_COMPANY_TRANSPORT",
      recipient: { role: "customer", userId: customerUid },
      eventId: eventRef.id,
      title: "Order update",
      message: `Your ${shipmentRef} is in transit to the hub near you.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  if (job.vendorId) {
    emitDeliveryNotification(tx, db, {
      type: "IN_COMPANY_TRANSPORT",
      recipient: { role: "seller", userId: job.vendorId },
      eventId: eventRef.id,
      title: "Shipment update",
      message: `${shipmentRef} is now in transit.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  // Internal, delivery-person-only signal — never a customer/seller notification.
  for (const hp of destHubRecipients) {
    emitDeliveryNotification(tx, db, {
      type: "HUB_TASK_ASSIGNED",
      recipient: { role: "delivery_person", userId: hp.uid },
      eventId: eventRef.id,
      title: "Shipment arriving at your hub",
      message: `A shipment (${job.shipmentNumber}) is in transit to your hub — awaiting receipt.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { ok: true, jobId: args.jobId, stage: "InTransit", currentLegId: newLegId };
}
