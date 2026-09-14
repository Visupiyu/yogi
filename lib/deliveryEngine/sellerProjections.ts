// SERVER-ONLY. Phase 2B-5B-2 — seller-scoped delivery tracking projection.
//
// EXPLICIT ALLOW-LIST. A DeliveryJob is never spread into a seller response.
// A seller sees the delivery state of THEIR OWN shipment plus the responsible
// provider (type + name) and the delivery person's FIRST NAME only. Never:
// scanToken, deliveryOtp, raw geo/geoAccuracy/deviceId, actor uids, companyId,
// jobId, legId, customer full phone, internal event log, or commerceReconciledAt.
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

export type SellerShipment = {
  shipmentNumber: string;
  status: string; // friendly overall label
  stage: string; // friendly current-step label
  providerType: "YOMICO" | "COMPANY" | null;
  providerName: string | null; // "YOMICO" or the delivery company's name
  deliveryPersonFirstName: string | null; // first name only, from pickup through delivery
  milestones: { key: string; label: string; at: string }[];
  exceptionMessage: string | null;
  delivered: boolean;
  deliveredAt: string | null;
  updatedAt: string | null;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try { return (value as { toDate: () => Date }).toDate().toISOString(); } catch { return null; }
  }
  return typeof value === "string" ? value : null;
}
function firstName(full: unknown): string | null {
  if (typeof full !== "string") return null;
  const token = full.trim().split(/\s+/)[0] || "";
  return token ? token.slice(0, 40) : null;
}

function friendlyStage(stage: unknown): string {
  switch (stage) {
    case "PickedUp": return "Picked up";
    case "InTransit":
    case "ArrivedAtStage":
    case "HandoverInitiated":
    case "HandoverConfirmed": return "In transit";
    case "OutForDelivery": return "Out for delivery";
    case "Delivered": return "Delivered";
    default: return "Preparing for delivery";
  }
}
function friendlyStatus(job: DeliveryJob): string {
  switch (job.status) {
    case "Delivered": return "Delivered";
    case "DeliveryFailed": return "Delivery attempted";
    case "Returned": return "Returned";
    case "Cancelled": return "Cancelled";
    case "InProgress": return friendlyStage(job.currentStage);
    default: return "Preparing for delivery";
  }
}
function buildMilestones(job: DeliveryJob): { key: string; label: string; at: string }[] {
  const out: { key: string; label: string; at: string }[] = [];
  const created = toIso(job.createdAt);
  if (created) out.push({ key: "shipment_created", label: "Shipment created", at: created });
  const pickedUp = toIso(job.executionStartedAt);
  if (pickedUp) out.push({ key: "picked_up", label: "Picked up", at: pickedUp });
  const delivered = toIso(job.deliveredAt);
  if (delivered) out.push({ key: "delivered", label: "Delivered", at: delivered });
  return out;
}
function exceptionMessage(job: DeliveryJob): string | null {
  if (job.status === "DeliveryFailed") return "A delivery attempt was unsuccessful. It will be reattempted.";
  return null;
}

/**
 * Build the seller shipment view for one delivery job. Pure allow-list — the
 * caller must have already verified the job belongs to this seller (vendorId).
 */
export function buildSellerShipment(job: DeliveryJob): SellerShipment {
  const pickedUp = !!job.executionStartedAt;
  const providerType = job.providerType === "YOMICO" || job.providerType === "COMPANY" ? job.providerType : null;
  const providerName =
    providerType === "YOMICO"
      ? "YOMICO"
      : providerType === "COMPANY"
        ? (typeof job.assignedCompanyName === "string" ? job.assignedCompanyName.slice(0, 200) : null)
        : null;
  return {
    shipmentNumber: typeof job.shipmentNumber === "string" ? job.shipmentNumber : "",
    status: friendlyStatus(job),
    stage: friendlyStage(job.currentStage),
    providerType,
    providerName,
    deliveryPersonFirstName: pickedUp ? firstName(job.assignedPersonName) : null,
    milestones: buildMilestones(job),
    exceptionMessage: exceptionMessage(job),
    delivered: job.status === "Delivered",
    deliveredAt: job.status === "Delivered" ? toIso(job.deliveredAt) : null,
    updatedAt: toIso(job.updatedAt),
  };
}
