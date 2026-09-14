// SERVER-ONLY. Phase 2B-5 — Delivery -> Commerce reconciliation.
//
// COMMERCE-OWNED. This is the one place a physically-Delivered DeliveryJob is
// reflected into the commerce record it belongs to. The Delivery Engine (the
// scan path, applyScan) NEVER writes orders/sellerOrders — it only records the
// durable physical fact (job.status="Delivered" + the immutable DELIVER event).
// Reconciliation reads that durable fact and updates commerce, reusing the
// EXISTING roll-up (deriveStageAcross) so a delivery-driven Delivered and a
// seller-driven Delivered produce the identical order state.
//
// Guarantees: server-only, idempotent, retryable from durable Delivered state,
// multi-vendor safe (one job == one sellerOrder; parent order rolls up only via
// the existing least-advanced-item rule), race-safe against the seller path
// (a job-covered sellerOrder can only reach Delivered here — see the guard in
// seller/advance-item), reads-before-writes, and it NEVER touches paymentStatus,
// earnings, rewards, inventory or refunds.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  deriveStageAcross,
  allItemsDelivered,
  type ItemFulfilmentMap,
} from "@/lib/itemFulfilment";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

export class ReconcileError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReconcileError";
    this.status = status;
  }
}

export type ReconcileResult = {
  reconciled: boolean; // true if this call performed the commerce write
  alreadyReconciled: boolean; // true if a prior call had already done it
  jobId: string;
  orderId: string;
  sellerOrderId: string;
  parentStatus: string | null; // resulting/observed parent order status
};

/**
 * Reflect a Delivered DeliveryJob into its sellerOrder + parent order.
 *
 * Read/write order (Firestore forbids a read after a write):
 *   READS  1. deliveryJobs/{jobId}          (must be status "Delivered")
 *          2. sellerOrders/{jobId}          (recordId === jobId)
 *          3. sellerOrders where orderId==  (siblings, for the roll-up)
 *          4. orders/{orderId}
 *   WRITES 5. sellerOrders/{jobId}.itemFulfilment[*] -> Delivered  (if not already)
 *          6. orders/{orderId}.status = deriveStageAcross(...)     (existing rule)
 *          7. deliveryJobs/{jobId}.commerceReconciledAt = now      (idempotency marker)
 *
 * Idempotent: if commerceReconciledAt is already set, it is a no-op; if the
 * sellerOrder's items are already all Delivered, the redundant item write is
 * skipped but the marker + roll-up are still ensured. Safe to call repeatedly.
 */
export async function reconcileDeliveredJob(
  tx: Transaction,
  db: Firestore,
  args: { jobId: string }
): Promise<ReconcileResult> {
  const jobRef = db.collection("deliveryJobs").doc(args.jobId);

  // ---- READS ----
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ReconcileError("Delivery job not found.", 404);
  const job = jobSnap.data() as DeliveryJob;

  if (job.status !== "Delivered") {
    throw new ReconcileError("Delivery job is not Delivered.", 409);
  }

  const orderId = typeof job.orderId === "string" ? job.orderId : "";
  const sellerOrderId = typeof job.sellerOrderId === "string" ? job.sellerOrderId : args.jobId;
  if (!orderId) throw new ReconcileError("Job has no orderId.", 409);

  // Idempotency: already reconciled -> pure no-op (no further reads/writes).
  if (job.commerceReconciledAt) {
    return { reconciled: false, alreadyReconciled: true, jobId: args.jobId, orderId, sellerOrderId, parentStatus: null };
  }

  const sellerOrderRef = db.collection("sellerOrders").doc(sellerOrderId);
  const soSnap = await tx.get(sellerOrderRef);
  if (!soSnap.exists) {
    // The sellerOrder is created at confirm-order. If it is somehow absent, do
    // NOT mark reconciled — leave the durable Delivered state for a later retry.
    throw new ReconcileError("Seller order record not found for this job.", 409);
  }
  const record = soSnap.data() as { itemFulfilment?: ItemFulfilmentMap };
  const currentMap = record.itemFulfilment || {};

  // Siblings for the parent roll-up (a seller cannot read these; the roll-up
  // lives server-side exactly as in seller/advance-item).
  const siblingsSnap = await tx.get(
    db.collection("sellerOrders").where("orderId", "==", orderId)
  );

  const orderRef = db.collection("orders").doc(orderId);
  const orderSnap = await tx.get(orderRef);

  // ---- COMPUTE ----
  const now = Timestamp.now();
  const alreadyAllDelivered = allItemsDelivered(currentMap);

  // Every item of THIS vendor's parcel becomes Delivered (delivering the job
  // delivers the whole parcel). Preserve an existing per-item deliveredAt.
  const updatedMap: ItemFulfilmentMap = {};
  for (const [key, entry] of Object.entries(currentMap)) {
    updatedMap[key] = {
      ...entry,
      status: "Delivered",
      updatedAt: now,
      deliveredAt: entry?.deliveredAt ?? now,
    };
  }

  // Roll the parent up with THIS record substituted by its delivered map — the
  // sibling query still holds this record's pre-reconciliation state.
  const maps = siblingsSnap.docs.map((docSnap) =>
    docSnap.id === sellerOrderId
      ? updatedMap
      : ((docSnap.data() as { itemFulfilment?: ItemFulfilmentMap }).itemFulfilment ?? null)
  );
  const parentStage = deriveStageAcross(maps);
  const allDelivered = parentStage === "Delivered";

  const orderStatus = orderSnap.exists
    ? (orderSnap.data() as { status?: unknown }).status
    : undefined;

  // ---- WRITES (after all reads) ----
  // 1) sellerOrder items -> Delivered (skip the redundant write if already so)
  if (!alreadyAllDelivered && Object.keys(updatedMap).length > 0) {
    tx.set(sellerOrderRef, { itemFulfilment: updatedMap, updatedAt: now }, { merge: true });
  }

  // 2) parent order roll-up — identical rules to seller/advance-item:
  //    never resurrect a Cancelled order; stamp deliveredAt once, when the LAST
  //    item across all vendors is Delivered. No payment/earnings/reward writes.
  if (orderSnap.exists && orderStatus !== "Cancelled" && parentStage) {
    const orderUpdate: Record<string, unknown> = { status: parentStage, updatedAt: now };
    if (allDelivered && !(orderSnap.data() as { deliveredAt?: unknown }).deliveredAt) {
      orderUpdate.deliveredAt = now;
    }
    tx.update(orderRef, orderUpdate);
  }

  // 3) durable idempotency marker on the job
  tx.set(jobRef, { commerceReconciledAt: now, updatedAt: now }, { merge: true });

  return {
    reconciled: true,
    alreadyReconciled: false,
    jobId: args.jobId,
    orderId,
    sellerOrderId,
    parentStatus: orderStatus === "Cancelled" ? "Cancelled" : parentStage,
  };
}
