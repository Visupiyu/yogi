// SERVER-ONLY. Delivery Engine — job/leg/event creation primitives.
//
// Two layers:
//   1. PURE builders + validators (no Firestore) — fully unit-testable.
//   2. ONE transactional helper createJobAndInitialLeg() that a FUTURE server
//      route/confirm-order hook will call. In Phase 2B-1 it is DORMANT: nothing
//      in the codebase invokes it, so it performs no live writes.
//
// Every field is derived server-side from the order + vendorId — providerType
// and companyId are NEVER taken from a client, and are null at creation (no
// provider chosen yet). No financial fields are produced. Deterministic ids
// make creation idempotent. Reads precede writes in the transactional helper.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  deliveryJobId,
  deliveryLegId,
  deliveryJobCreatedEventId,
} from "@/lib/deliveryEngine/jobIds";
import type {
  DeliveryJob,
  DeliveryLeg,
  DeliveryEvent,
  DeliveryParcelItem,
  DeliveryProviderType,
} from "@/lib/deliveryEngine/types";

// Fields on an order/sellerOrder line the builders may read. Money fields are
// intentionally absent from this input type so they can't leak into a job.
export type JobSourceItem = { name?: unknown; qty?: unknown };
export type JobSourceOrder = {
  orderNumber?: unknown;
  shipmentNumber?: unknown;
  customerName?: unknown;
  phone?: unknown;
  address?: unknown;
  deliverySlot?: unknown;
  items?: unknown;
};

function s(v: unknown, max = 500): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

// ---- Invariant validators (usable now; enforced at assignment later) ----

/**
 * The provider/companyId mutual-exclusion invariant:
 *   COMPANY  => companyId is a non-empty string
 *   YOMICO   => companyId is null
 *   null     => companyId is null (unassigned, the creation state)
 * Throws on violation. Used by future assignment code; also guards builders.
 */
export function assertProviderInvariant(
  providerType: DeliveryProviderType | null,
  companyId: string | null
): void {
  if (providerType === "COMPANY") {
    if (!companyId) throw new Error("provider invariant: COMPANY requires a companyId");
    return;
  }
  // YOMICO or null (unassigned) must never carry a companyId.
  if (companyId) {
    throw new Error("provider invariant: non-COMPANY provider must have companyId null");
  }
}

const FINANCIAL_KEYS = [
  "price", "prices", "amount", "total", "finalTotal", "subtotal", "discount",
  "rewardValue", "commission", "sellerEarning", "wallet", "balance", "payout",
  "settlement", "earning", "payable", "pricing", "cod", "codAmount",
];
/** Defence in depth: throws if a built record ever carries a money field. */
export function assertNoFinancialFields(obj: Record<string, unknown>): void {
  const bad = Object.keys(obj).filter((k) => FINANCIAL_KEYS.includes(k));
  if (bad.length) throw new Error(`financial field(s) not allowed on delivery record: ${bad.join(", ")}`);
}

// ---- Pure builders ----

export function buildDeliveryJob(args: {
  orderId: string;
  vendorId: string;
  vendorName: string;
  order: JobSourceOrder;
  sellerName: string;
  now: Timestamp;
}): DeliveryJob & { id: string } {
  const { orderId, vendorId, vendorName, order, sellerName, now } = args;
  const id = deliveryJobId(orderId, vendorId);
  const items: DeliveryParcelItem[] = Array.isArray(order.items)
    ? (order.items as JobSourceItem[])
        .map((it) => ({ name: s(it?.name, 200), qty: n(it?.qty) }))
        .filter((it) => it.name && it.qty > 0)
    : [];

  const job: DeliveryJob & { id: string } = {
    id,
    orderId,
    orderNumber: s(order.orderNumber, 40),
    vendorId,
    vendorName: s(vendorName, 200),
    sellerOrderId: id,
    shipmentNumber: s(order.shipmentNumber, 40),
    providerType: null, // no provider chosen at Created
    companyId: null,
    status: "Created",
    currentLegId: null, // set to leg 1 by the transactional helper
    currentStage: "AwaitingHandoff",
    responsibleParty: null,
    lastEventId: null,
    lastEventAt: null,
    pickup: { sellerName: s(sellerName, 200), area: "" },
    drop: {
      customerName: s(order.customerName, 200),
      phone: s(order.phone, 40),
      address: s(order.address, 1000),
      slot: typeof order.deliverySlot === "string" ? order.deliverySlot : null,
    },
    parcel: { items }, // names + quantities only — no prices
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  assertProviderInvariant(job.providerType, job.companyId);
  assertNoFinancialFields(job as unknown as Record<string, unknown>);
  return job;
}

export function buildInitialPickupLeg(args: {
  jobId: string;
  shipmentNumber: string;
  sellerStage: string;
  now: Timestamp;
}): DeliveryLeg & { id: string } {
  const { jobId, shipmentNumber, sellerStage, now } = args;
  const sequence = 1;
  const leg: DeliveryLeg & { id: string } = {
    id: deliveryLegId(jobId, sequence),
    jobId,
    shipmentNumber,
    sequence,
    type: "Pickup",
    providerType: null,
    companyId: null,
    assignedPersonId: null,
    status: "LegCreated",
    from: { stage: sellerStage || "Seller" },
    to: { stage: "PickupComplete" },
    handover: null,
    proof: null,
    exception: null,
    createdAt: now,
    updatedAt: now,
  };
  assertProviderInvariant(leg.providerType, leg.companyId);
  assertNoFinancialFields(leg as unknown as Record<string, unknown>);
  return leg;
}

export function buildJobCreatedEvent(args: {
  jobId: string;
  legId: string;
  shipmentNumber: string;
  actorUid: string;
  now: Timestamp;
}): DeliveryEvent & { id: string } {
  const { jobId, legId, shipmentNumber, actorUid, now } = args;
  const event: DeliveryEvent & { id: string } = {
    id: deliveryJobCreatedEventId(jobId),
    jobId,
    legId,
    shipmentNumber,
    actorUid: s(actorUid, 128),
    role: "system",
    providerType: null,
    companyId: null,
    action: "JobCreated",
    fromStage: null,
    toStage: "AwaitingHandoff",
    at: now,
    geo: null,
    notes: null,
    photoPath: null,
    clientEventId: null,
  };
  assertNoFinancialFields(event as unknown as Record<string, unknown>);
  return event;
}

// ---- Transactional creation helper (DORMANT in 2B-1: never invoked) ----

export type CreateJobArgs = {
  orderId: string;
  vendorId: string;
  vendorName: string;
  sellerName: string;
  order: JobSourceOrder;
  actorUid: string;
};

/**
 * Create a DeliveryJob + its initial Pickup leg + a JobCreated event, atomically
 * and idempotently. Reads BEFORE writes. If the job already exists it is a
 * no-op (returns created:false) — deterministic ids make double creation
 * impossible. A future handoff route / confirm-order hook will call this; it is
 * intentionally uninvoked in Phase 2B-1, so it performs no live writes yet.
 */
export async function createJobAndInitialLeg(
  tx: Transaction,
  db: Firestore,
  args: CreateJobArgs
): Promise<{ created: boolean; jobId: string }> {
  const jobId = deliveryJobId(args.orderId, args.vendorId);
  const jobRef = db.collection("deliveryJobs").doc(jobId);

  // ---- READS FIRST ----
  const existing = await tx.get(jobRef);
  if (existing.exists) {
    return { created: false, jobId }; // idempotent no-op
  }

  const now = Timestamp.now();
  const job = buildDeliveryJob({
    orderId: args.orderId,
    vendorId: args.vendorId,
    vendorName: args.vendorName,
    order: args.order,
    sellerName: args.sellerName,
    now,
  });
  const leg = buildInitialPickupLeg({
    jobId,
    shipmentNumber: job.shipmentNumber,
    sellerStage: job.pickup.sellerName || "Seller",
    now,
  });
  const event = buildJobCreatedEvent({
    jobId,
    legId: leg.id,
    shipmentNumber: job.shipmentNumber,
    actorUid: args.actorUid,
    now,
  });

  const legRef = jobRef.collection("legs").doc(leg.id);
  const eventRef = db.collection("deliveryEvents").doc(event.id);

  // ---- WRITES (after all reads) ----
  const { id: _j, ...jobData } = job;
  const { id: _l, ...legData } = leg;
  const { id: _e, ...eventData } = event;
  void _j; void _l; void _e;
  tx.set(jobRef, { ...jobData, currentLegId: leg.id, lastEventId: event.id, lastEventAt: now });
  tx.set(legRef, legData);
  tx.set(eventRef, eventData);

  return { created: true, jobId };
}
