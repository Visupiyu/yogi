// SERVER-ONLY. COMPANY_HUB journey — COMPANY-MANAGED transit → destination hub
// (four-actor model, Phase 2).
//
//   … → COMPANY TRANSIT / LINE-HAUL → [DESTINATION HUB PERSON receives]  <- this
//
// Company transport arrives at the destination hub; an AUTHENTICATED Destination
// Hub Person — stationed at that EXACT hub — confirms receipt. Custody was
// already at the COMPANY level (holderKind COMPANY, personId null) throughout
// company transit and simply becomes parked at the destination hub (a custody
// LOCATION); the receiving Hub Person is recorded as the job's responsible
// physical actor (never as a custody-holding "person", and never as a rider —
// see finalMileAssign.ts / destinationHandover.ts for how Rider 2 later takes
// over via an authenticated hand-off).
//
// PHASE 2 CHANGE: this was previously a company DISPATCHER action (role
// "company") — a fiction, since the dispatcher is never physically at the hub.
// The actor is now the authenticated Destination Hub Person, resolved the same
// way Phase 1's origin-hub receipt is: hubId/companyId/role come ONLY from the
// caller's OWN deliveryPersons doc (resolveDeliveryActor + assertHubPerson) —
// never the request body, and no `hubId` body param is accepted anymore (the
// destination hub is simply wherever THIS authenticated person is stationed).
//
// PHASE 5 CHANGE: job.destinationHubId is now set authoritatively at transit-
// departure (transit.ts), by explicit dispatcher choice. This function now
// REJECTS a hub person whose own hub does not match that field (see the check
// below) instead of letting whichever hub person happens to receive it define
// the destination after the fact — closing a real authorization gap from
// Phase 2/3/4, when no such routing signal existed yet.
//
// Still deliberately NOT part of applyScan — the scan FSM and the YOMICO DIRECT
// path stay byte-for-byte unchanged. Atomic: completing the transit leg,
// creating the destination-hub leg, advancing currentLegId, parking custody at
// the hub, and appending the event all happen in the caller's single transaction.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { ExecutionError } from "@/lib/deliveryEngine/execution";
import { assertHubPerson } from "@/lib/deliveryEngine/assignment";
import { deliveryLegId } from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryHub,
  DeliveryPerson,
  DeliveryEvent,
  CustodyState,
} from "@/lib/deliveryEngine/types";
import { emitDeliveryNotification, readCustomerUid } from "@/lib/deliveryEngine/notifications";

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

// The actor is the authenticated Destination Hub Person — a real physical
// actor at the hub, NOT the company dispatcher. hubId comes from the actor's
// OWN person record (resolveDeliveryActor), never the request body.
export type DestinationHubReceiptActor = { uid: string; companyId: string; personId: string; hubId: string };

export type DestinationHubReceiptResult = {
  ok: true;
  idempotent?: boolean;
  jobId: string;
  stage: "AtDestinationHub";
  hubId: string;
  currentLegId: string;
  hubPersonId: string;
};

export async function applyDestinationHubReceipt(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string; actor: DestinationHubReceiptActor }
): Promise<DestinationHubReceiptResult> {
  const { actor } = args;
  const destHubId = actor.hubId;

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
  // Payment Lifecycle V1 — a Cancelled/Returned order's job must not keep
  // progressing (see execution.ts's identical guard).
  if (job.status === "Cancelled" || job.status === "Returned") {
    throw new ExecutionError("This order is no longer active.", 409);
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

  // Idempotency — authorized, never unconditional: only the ORIGINAL confirmer
  // (event.personId) may receive the safe no-op. A different hub person (even
  // at the same hub) is rejected rather than getting a false no-op success.
  const eventRef = db.collection("deliveryEvents").doc(destinationHubReceiptEventId(args.jobId));
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
      stage: "AtDestinationHub",
      hubId: typeof job.destinationHubId === "string" ? job.destinationHubId : destHubId,
      currentLegId: job.currentLegId ?? currentLegId,
      hubPersonId: actor.personId,
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

  // PHASE 5: the shipment's destination is now an AUTHORITATIVE, dispatcher-set
  // field (job.destinationHubId, established at transit-departure — see
  // transit.ts). Only the Hub Person stationed at EXACTLY that hub may receive
  // it — a hub person at a different (even if valid, Active) company hub is
  // rejected, closing the gap where any hub person could previously "claim" an
  // in-transit shipment for their own hub. A job that entered transit BEFORE
  // this field existed (destinationHubId still null) falls back to the
  // original behavior: the receiving hub person's own hub establishes it, for
  // backward compatibility with already-in-flight shipments only.
  if (job.destinationHubId && job.destinationHubId !== actor.hubId) {
    throw new ExecutionError("This shipment is not routed to your hub.", 403);
  }

  // Re-validate the receiving person against the authoritative record: same
  // company, role HUB_PERSON, stationed at this hub, Active. Never trusts
  // companyId/hubId/role from the client — this reads the person doc fresh.
  const hubPersonRef = db.collection("deliveryPersons").doc(actor.personId);
  const hubPersonSnap = await tx.get(hubPersonRef);
  if (!hubPersonSnap.exists) throw new ExecutionError("Delivery person not found.", 404);
  const hubPerson = hubPersonSnap.data() as DeliveryPerson;
  assertHubPerson(hubPerson, actor.companyId, destHubId);

  // Validate the hub itself (defense in depth) — must exist, belong to this
  // company, be Active, and not be the origin hub. destHubId is the actor's OWN
  // hub, never client-selected, so this can never receive an arbitrary hub.
  const hubRef = db.collection("deliveryHubs").doc(destHubId);
  const hubSnap = await tx.get(hubRef);
  if (!hubSnap.exists) throw new ExecutionError("Hub not found.", 404);
  const hub = hubSnap.data() as DeliveryHub;
  if (hub.companyId !== actor.companyId) throw new ExecutionError("That hub belongs to another company.", 403);
  if (hub.status !== "Active") throw new ExecutionError("That hub is not active.", 409);
  if (job.originHubId && job.originHubId === destHubId) {
    throw new ExecutionError("The destination hub cannot be the origin hub.", 409);
  }
  const destHubName = typeof hub.name === "string" && hub.name ? hub.name : "Destination hub";

  // Delivery Notification System V1 — customer recipient.
  const customerUid = await readCustomerUid(tx, db, job.orderId);

  // ---- WRITES (after all reads) ----
  const now = Timestamp.now();

  // Custody now parked at the destination hub (company location, not a person —
  // the receiving Hub Person is recorded as `responsibleParty` below, never as
  // custody.personId).
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

  // 3) Append-only event (deterministic id → idempotent). The Destination Hub
  //    Person is the actor — a real authenticated physical actor, not the
  //    dispatcher.
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

  // 4) Advance the job: currentLegId → destination-hub leg, at-destination-hub
  //    stage, custody parked at the hub; record the destination hub. originHubId
  //    kept. responsibleParty now names the Destination Hub Person as the
  //    current physical/accountable actor (mirrors Phase 1's origin-hub
  //    pattern) — NOT a rider, and custody.personId stays null (a hub is a
  //    LOCATION, never a custody-holding actor). No person assignment yet
  //    (final-mile assigns Rider 2 next, in a separate step).
  tx.set(
    jobRef,
    {
      currentLegId: newLegId,
      currentStage: "AtDestinationHub",
      custody,
      currentHubId: destHubId,
      destinationHubId: destHubId,
      destinationHubReceivedAt: now,
      responsibleParty: { kind: "COMPANY", companyId: actor.companyId, personId: actor.personId },
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
      type: "DESTINATION_HUB_RECEIVED",
      recipient: { role: "customer", userId: customerUid },
      eventId: eventRef.id,
      title: "Order update",
      message: `Your ${shipmentRef} has arrived at the hub near you.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }
  if (job.vendorId) {
    emitDeliveryNotification(tx, db, {
      type: "DESTINATION_HUB_RECEIVED",
      recipient: { role: "seller", userId: job.vendorId },
      eventId: eventRef.id,
      title: "Shipment update",
      message: `${shipmentRef} has arrived at the destination hub.`,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sellerOrderId: job.sellerOrderId,
      deliveryJobId: args.jobId,
      now,
    });
  }

  return { ok: true, jobId: args.jobId, stage: "AtDestinationHub", hubId: destHubId, currentLegId: newLegId, hubPersonId: actor.personId };
}
