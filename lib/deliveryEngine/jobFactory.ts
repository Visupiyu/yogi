// SERVER-ONLY. Delivery Engine — job/leg/event creation primitives.
//
// Two layers:
//   1. PURE builders + validators (no Firestore) — fully unit-testable.
//   2. ONE transactional helper createJobAndInitialLeg(). As of Phase 2B-2 it
//      is invoked ONLY by the admin-triggered materialization route
//      (app/api/delivery/jobs/materialize), one job per (orderId,vendorId).
//      confirm-order is deliberately NOT modified; job creation is a separate,
//      explicitly admin-triggered step.
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
import { mintSequential } from "@/lib/humanIds";
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

// ---- Materialization gate (pure) ----

// Explicit WHITELIST of order lifecycle statuses for which a delivery job may
// be materialized: the order is confirmed and currently in fulfilment. It is a
// whitelist by design -- any status not listed here (Pending, Cancelled,
// Delivered, an empty/missing status, or an unexpected value) is rejected, so a
// status added elsewhere never silently becomes materializable.
//
// order.status is rolled forward Confirmed -> Packed -> Shipped -> Out For
// Delivery -> Delivered by seller/advance-item, set to Cancelled by
// cancel-order, and starts at Pending. Returns/refunds are item-level (tracked
// off order.status) and are deliberately NOT gated here -- they can coexist
// with an otherwise fulfillable order and are handled later in the job
// lifecycle.
//
// Lives here (not in the route) because Next.js route files may only export
// their HTTP handlers; keeping it in this pure module also makes it unit-testable.
export const MATERIALIZABLE_STATUSES = [
  "Confirmed",
  "Packed",
  "Shipped",
  "Out For Delivery",
] as const;

/** Pure gate predicate: true only for a whitelisted status that is not under review. */
export function canMaterializeStatus(status: unknown, needsReview: unknown): boolean {
  if (needsReview === true) return false;
  const s = typeof status === "string" ? status : "";
  return (MATERIALIZABLE_STATUSES as readonly string[]).includes(s);
}

// ---- Pure builders ----

export function buildDeliveryJob(args: {
  orderId: string;
  vendorId: string;
  vendorName: string;
  order: JobSourceOrder;
  sellerName: string;
  // This parcel's own tracking number, minted per (orderId,vendorId) by the
  // transactional helper — NOT the order-level number.
  shipmentNumber: string;
  // The order-level shipment number, kept only as an audit reference.
  orderShipmentNumber: string;
  now: Timestamp;
}): DeliveryJob & { id: string } {
  const { orderId, vendorId, vendorName, order, sellerName, shipmentNumber, orderShipmentNumber, now } = args;
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
    shipmentNumber: s(shipmentNumber, 40), // this parcel's minted number
    orderShipmentNumber: s(orderShipmentNumber, 40), // audit ref only
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

// ---- Transactional creation helper ----
// In 2B-2 this is invoked ONLY by the admin-triggered materialization route
// (app/api/delivery/jobs/materialize), once per (orderId,vendorId).

export type CreateJobArgs = {
  orderId: string;
  vendorId: string;
  vendorName: string;
  sellerName: string;
  order: JobSourceOrder;
  // The order-level shipment number, kept on the job as an audit reference.
  // The job's OWN parcel tracking number is minted inside the transaction.
  orderShipmentNumber: string;
  actorUid: string;
};

/**
 * Create a DeliveryJob + its initial Pickup leg + a JobCreated event, atomically
 * and idempotently, and mint this parcel's own shipment number.
 *
 * Read/write order (Firestore forbids a read after a write):
 *   READS  1. tx.get(deliveryJobs/{jobId})   — existence; if it exists, return
 *             {created:false} with NO mint and NO write (so a re-run never
 *             burns a shipment number).
 *          2. tx.get(counters/shipment)       — inside mintSequential.
 *   WRITES 3. tx.set(counters/shipment)       — inside mintSequential.
 *          4. tx.set(deliveryJobs/{jobId})
 *          5. tx.set(deliveryJobs/{jobId}/legs/{legId})
 *          6. tx.set(deliveryEvents/{eventId})
 *
 * MUST be called one job per transaction: two jobs in a single transaction
 * would either read-after-write on the second existence check or double-mint
 * the same shipment counter. The materialization route runs one tx per vendor.
 */
export async function createJobAndInitialLeg(
  tx: Transaction,
  db: Firestore,
  args: CreateJobArgs
): Promise<{ created: boolean; jobId: string; shipmentNumber?: string }> {
  const jobId = deliveryJobId(args.orderId, args.vendorId);
  const jobRef = db.collection("deliveryJobs").doc(jobId);

  // ---- READS FIRST ----
  const existing = await tx.get(jobRef);
  if (existing.exists) {
    return { created: false, jobId }; // idempotent no-op — no mint, no write
  }

  // Still a READ-then-WRITE, but every read above has completed: mint this
  // parcel's own tracking number (counters/shipment -> TRCK######).
  const shipmentNumber = await mintSequential(tx, db, "shipment");

  const now = Timestamp.now();
  const job = buildDeliveryJob({
    orderId: args.orderId,
    vendorId: args.vendorId,
    vendorName: args.vendorName,
    order: args.order,
    sellerName: args.sellerName,
    shipmentNumber,
    orderShipmentNumber: args.orderShipmentNumber,
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

  return { created: true, jobId, shipmentNumber };
}
