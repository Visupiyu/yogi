// ---------------------------------------------------------------------------
// Delivery Engine — deterministic identifier helpers. PURE (no Firestore, no
// side effects), so the same id can be recomputed anywhere and duplicate
// creation is impossible/idempotent.
//
//   deliveryJob id  === `${orderId}_${vendorId}`  — identical to
//   sellerOrderRecordId(), so a job is 1:1 with its sellerOrders record.
//
// These are OPERATIONAL document ids. They are NOT the shipment identity:
// shipmentNumber (TRCK…, minted once at confirm-order) is the permanent
// physical identity and is carried onto the job/leg/event, never regenerated.
// ---------------------------------------------------------------------------

/** Job doc id — mirrors sellerOrderRecordId(orderId, vendorId) exactly. */
export function deliveryJobId(orderId: string, vendorId: string): string {
  return `${orderId}_${vendorId}`;
}

/** Leg doc id within a job. sequence is deterministic (initial Pickup = 1). */
export function deliveryLegId(jobId: string, sequence: number): string {
  return `${jobId}__leg${String(sequence).padStart(3, "0")}`;
}

/**
 * Event doc id.
 *  - The one-time creation event uses a deterministic id so re-running the
 *    creation helper can never append a second "JobCreated" event.
 *  - Future scan/operational events pass a client-generated UUID
 *    (clientEventId) for offline-safe idempotent dedupe.
 */
export function deliveryJobCreatedEventId(jobId: string): string {
  return `${jobId}__evt_created`;
}
export function deliveryEventId(clientEventId: string): string {
  return `evt_${clientEventId}`;
}
