// SERVER-ONLY. Phase 2B-5B — customer-facing tracking projections.
//
// These are EXPLICIT ALLOW-LISTS. A DeliveryJob is never spread into a customer
// response; every field is copied by name here, so internal secrets and
// operational data can never leak through object spreading. The following are
// DELIBERATELY never present in a customer shipment: scanToken, deliveryOtp, raw
// geo/geoAccuracy/deviceId, actor uids, companyId, jobId, legId, full phone,
// raw deliveryEvents / internal event names+codes, commerceReconciledAt.
//
// No invented ETA and no invented location: the projection only echoes data the
// job actually holds. Location is intentionally absent for customers — the
// current stage/milestones are shown instead.
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// What a customer sees for ONE seller shipment. No job/leg/company identifiers.
export type CustomerShipment = {
  shipmentNumber: string;
  storeName: string;
  items: { name: string; qty: number }[];
  status: string; // friendly overall label
  stage: string; // friendly current-step label
  providerLabel: "YOMICO delivery" | "Delivery partner" | null;
  deliveryPersonFirstName: string | null; // only from pickup through delivery
  milestones: { key: string; label: string; at: string }[];
  exceptionMessage: string | null;
  delivered: boolean;
  deliveredAt: string | null;
  // Customer-safe flag (NOT the OTP): true while the parcel is out for delivery,
  // so the owner UI can show "your delivery code was sent" + a Resend action.
  // Carries no secret — the code itself only ever reaches the customer via the
  // email / in-app notification channels.
  outForDelivery: boolean;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === "string") return value;
  return null;
}

function firstName(full: unknown): string | null {
  if (typeof full !== "string") return null;
  const token = full.trim().split(/\s+/)[0] || "";
  return token ? token.slice(0, 40) : null;
}

// Coarse, customer-safe overall status. Never surfaces internal enum values or
// company/leg detail; a not-yet-picked-up job reads simply as "Preparing".
function friendlyStatus(job: DeliveryJob): string {
  switch (job.status) {
    case "Delivered":
      return "Delivered";
    case "DeliveryFailed":
      return "Delivery attempted";
    case "Returned":
      return "Returned";
    case "Cancelled":
      return "Cancelled";
    case "InProgress":
      return friendlyStage(job.currentStage);
    default:
      // Created / OfferedToCompany / AssignedToYomico / AssignedToCompany /
      // RejectedByCompany — all read as "being prepared" to the customer.
      return "Preparing for delivery";
  }
}

// Current-step label derived ONLY from the physical stage string, never from
// internal event names/codes.
function friendlyStage(stage: unknown): string {
  switch (stage) {
    case "PickedUp":
      return "Picked up";
    case "AtOriginHub":
      // COMPANY_HUB journey: received and held at the origin company hub,
      // awaiting transit. A real persisted stage — never fabricated.
      return "At origin hub";
    case "AtDestinationHub":
      // COMPANY_HUB journey: received and held at the destination company hub,
      // awaiting final-mile. A real persisted stage — never fabricated. NOT
      // "out for delivery"/"delivered" (those are later slices).
      return "At destination hub";
    case "FinalMileAssigned":
      // COMPANY_HUB journey: a final-mile person has been assigned and has taken
      // custody from the destination hub, but has NOT yet departed. A real
      // persisted stage — never fabricated. NOT "out for delivery"/"delivered".
      return "Assigned for final delivery";
    case "InTransit":
    case "ArrivedAtStage":
    case "HandoverInitiated":
    case "HandoverConfirmed":
      return "In transit";
    case "OutForDelivery":
      return "Out for delivery";
    // A delivery exception was reported (rider-reported reason via
    // deliveryException.ts, or the legacy ATTEMPT_FAILED scan action in
    // execution.ts) — the leg/job stays in this recoverable "Failed" stage
    // until a fresh OUT_FOR_DELIVERY reattempt clears it (see execution.ts's
    // own Failed -> OutForDelivery TRANSITIONS entry: this is not a new
    // recovery mechanism, just the existing one). Customer-safe: never the
    // raw "Failed" enum, and never a regression to "Preparing for delivery"
    // — mirrors the Customer App's OWN existing legacy-tracker precedent for
    // the identical problem (it already treats order-level "Delivery
    // Failed" as "Out For Delivery" so progress already made is never
    // erased). exceptionMessage() below carries the "needs attention" detail.
    case "Failed":
      return "Delivery attempted";
    case "Delivered":
      return "Delivered";
    default:
      return "Preparing for delivery";
  }
}

function providerLabel(job: DeliveryJob): CustomerShipment["providerLabel"] {
  if (job.providerType === "YOMICO") return "YOMICO delivery";
  if (job.providerType === "COMPANY") return "Delivery partner"; // company NAME never exposed
  return null;
}

// Milestone timeline from denormalised timestamps only — never from reading the
// event log. Only milestones that actually happened are included; no timestamp
// is invented.
function buildMilestones(job: DeliveryJob): { key: string; label: string; at: string }[] {
  const out: { key: string; label: string; at: string }[] = [];
  const created = toIso(job.createdAt);
  if (created) out.push({ key: "shipment_created", label: "Shipment created", at: created });
  const pickedUp = toIso(job.executionStartedAt);
  if (pickedUp) out.push({ key: "picked_up", label: "Picked up", at: pickedUp });
  // COMPANY_HUB journey: origin-hub intake. Only present when it actually
  // happened (persisted timestamp) — no transit/destination/final-mile invented.
  const atOriginHub = toIso(job.originHubIntakeAt);
  if (atOriginHub) out.push({ key: "at_origin_hub", label: "At origin hub", at: atOriginHub });
  // COMPANY_HUB journey: departed the origin hub into transit. Present only when
  // it actually happened (persisted timestamp). No destination/arrival invented.
  const inTransit = toIso(job.transitStartedAt);
  if (inTransit) out.push({ key: "in_transit", label: "In transit", at: inTransit });
  // COMPANY_HUB journey: received at the destination hub. Present only when it
  // actually happened (persisted timestamp). No final-mile/delivery invented.
  const atDestinationHub = toIso(job.destinationHubReceivedAt);
  if (atDestinationHub) out.push({ key: "at_destination_hub", label: "At destination hub", at: atDestinationHub });
  // COMPANY_HUB journey: assigned to a final-mile person (custody handed from the
  // destination hub). Present only when it actually happened (persisted timestamp).
  // NOT departure/out-for-delivery/delivery — those are later slices.
  const finalMileAssigned = toIso(job.finalMileAssignedAt);
  if (finalMileAssigned) out.push({ key: "final_mile_assigned", label: "Assigned for final delivery", at: finalMileAssigned });
  const delivered = toIso(job.deliveredAt);
  if (delivered) out.push({ key: "delivered", label: "Delivered", at: delivered });
  return out;
}

// A customer-safe exception message, derived from the coarse job status/stage
// only — never from leg exception codes, rider notes, or internal event data.
function exceptionMessage(job: DeliveryJob): string | null {
  if (job.status === "DeliveryFailed") {
    return "A delivery attempt was unsuccessful. It will be reattempted.";
  }
  // job.status is deliberately left unchanged (InProgress) by both delivery-
  // exception paths (deliveryException.ts's rider-reported reasons and
  // execution.ts's legacy ATTEMPT_FAILED action) — job.currentStage
  // "Failed" is the actual, reachable signal for an open delivery exception
  // today. Self-clearing: a fresh OUT_FOR_DELIVERY reattempt moves
  // currentStage away from "Failed", so this message disappears on its own
  // once the shipment is back out for delivery.
  if (job.currentStage === "Failed") {
    return "A delivery attempt was unsuccessful. It will be reattempted.";
  }
  return null;
}

/**
 * Build the customer shipment view for one delivery job. Pure allow-list — the
 * caller must have already authorised the requester as the order owner.
 */
export function buildCustomerShipment(job: DeliveryJob): CustomerShipment {
  // Delivery person's first name is shown only once the parcel has been picked
  // up (through delivery), per decision 4 — never before pickup.
  const pickedUp = !!job.executionStartedAt;
  const items = Array.isArray(job.parcel?.items)
    ? job.parcel.items
        .map((it) => ({
          name: typeof it?.name === "string" ? it.name.slice(0, 200) : "",
          qty: typeof it?.qty === "number" && it.qty > 0 ? it.qty : 0,
        }))
        .filter((it) => it.name && it.qty > 0)
    : [];

  return {
    shipmentNumber: typeof job.shipmentNumber === "string" ? job.shipmentNumber : "",
    storeName: typeof job.vendorName === "string" ? job.vendorName : "",
    items,
    status: friendlyStatus(job),
    stage: friendlyStage(job.currentStage),
    providerLabel: providerLabel(job),
    deliveryPersonFirstName: pickedUp ? firstName(job.assignedPersonName) : null,
    milestones: buildMilestones(job),
    exceptionMessage: exceptionMessage(job),
    delivered: job.status === "Delivered",
    deliveredAt: job.status === "Delivered" ? toIso(job.deliveredAt) : null,
    outForDelivery: job.currentStage === "OutForDelivery",
  };
}

/** Build the ordered list of customer shipments for an order's jobs. */
export function buildCustomerShipments(jobs: DeliveryJob[]): CustomerShipment[] {
  return jobs
    .map((job) => buildCustomerShipment(job))
    .sort((a, b) => a.shipmentNumber.localeCompare(b.shipmentNumber));
}
