// SERVER-ONLY. Phase 2B-5B-2 — Admin (Control Tower) read projections.
//
// EXPLICIT ALLOW-LISTS. A DeliveryJob / DeliveryPerson / DeliveryCompany is
// never spread into an admin response; every field is copied by name. Even for
// admins, secrets are NEVER returned: scanToken and deliveryOtp are excluded
// here, as is raw scan geo/deviceId (those live on events; admin sees them only
// on an authorised per-job detail view, not in these lists).
import type {
  DeliveryJob,
  DeliveryPerson,
  DeliveryCompany,
} from "@/lib/deliveryEngine/types";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try { return (value as { toDate: () => Date }).toDate().toISOString(); } catch { return null; }
  }
  return typeof value === "string" ? value : null;
}
function s(v: unknown, max = 200): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

// One row of the Control Tower job list. Operational fields only — no
// scanToken, deliveryOtp, raw geo, drop address/phone, or parcel prices.
export type AdminJobRow = {
  jobId: string;
  orderId: string;
  orderNumber: string | null;
  shipmentNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
  providerType: "YOMICO" | "COMPANY" | null;
  companyId: string | null;
  companyName: string | null;
  assignedPersonId: string | null;
  assignedPersonName: string | null;
  status: string;
  currentStage: string | null;
  currentLegId: string | null;
  custody: { holderKind: string | null; personId: string | null; companyId: string | null } | null;
  parcelItemCount: number;
  lastEventAt: string | null;
  commerceReconciledAt: string | null; // internal marker — admin only
  createdAt: string | null;
  updatedAt: string | null;
  executionStartedAt: string | null;
  deliveredAt: string | null;
};

export function buildAdminJobRow(jobId: string, job: DeliveryJob): AdminJobRow {
  const custody = job.custody
    ? {
        holderKind: s(job.custody.holderKind),
        personId: s(job.custody.personId),
        companyId: s(job.custody.companyId),
      }
    : null;
  const items = Array.isArray(job.parcel?.items) ? job.parcel.items : [];
  return {
    jobId,
    orderId: typeof job.orderId === "string" ? job.orderId : "",
    orderNumber: s(job.orderNumber, 40),
    shipmentNumber: s(job.shipmentNumber, 40),
    vendorId: s(job.vendorId, 128),
    vendorName: s(job.vendorName),
    providerType: job.providerType === "YOMICO" || job.providerType === "COMPANY" ? job.providerType : null,
    companyId: s(job.companyId, 128),
    companyName: s(job.assignedCompanyName),
    assignedPersonId: s(job.assignedPersonId, 128),
    assignedPersonName: s(job.assignedPersonName),
    status: typeof job.status === "string" ? job.status : "",
    currentStage: s(job.currentStage, 60),
    currentLegId: s(job.currentLegId, 128),
    custody,
    parcelItemCount: items.length,
    lastEventAt: toIso(job.lastEventAt),
    commerceReconciledAt: toIso(job.commerceReconciledAt),
    createdAt: toIso(job.createdAt),
    updatedAt: toIso(job.updatedAt),
    executionStartedAt: toIso(job.executionStartedAt),
    deliveredAt: toIso(job.deliveredAt),
  };
}

// Admin view of a delivery person. No secrets (persons carry none); operational
// contact is included for admin management. providerType/companyId reflect the
// stored ownership. deprecated `status` alias is intentionally not surfaced.
export type AdminPersonRow = {
  personId: string;
  uid: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  providerType: "YOMICO" | "COMPANY";
  companyId: string | null;
  accountStatus: string;
  availability: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  serviceArea: string | null;
  city: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function buildAdminPersonRow(personId: string, p: DeliveryPerson): AdminPersonRow {
  const providerType = p.providerType === "YOMICO" ? "YOMICO" : "COMPANY";
  return {
    personId,
    uid: s(p.uid, 128),
    name: s(p.name),
    phone: s(p.phone, 20),
    email: s(p.email),
    providerType,
    companyId: s(p.companyId, 128),
    accountStatus: p.accountStatus ?? (p.status === "Inactive" ? "Suspended" : "Active"),
    availability: p.availability ?? "Offline",
    vehicleType: s(p.vehicleType, 40),
    vehicleNumber: s(p.vehicleNumber, 40),
    serviceArea: s(p.serviceArea),
    city: s(p.city, 80),
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  };
}

// Admin view of a delivery company. ownerUid is reduced to a boolean so an
// internal auth uid is not exposed even to admin lists.
export type AdminCompanyRow = {
  companyId: string;
  name: string | null;
  status: string;
  serviceAreas: string[];
  hasOwner: boolean;
};

export function buildAdminCompanyRow(companyId: string, c: DeliveryCompany): AdminCompanyRow {
  return {
    companyId,
    name: s(c.name),
    status: typeof c.status === "string" ? c.status : "",
    serviceAreas: Array.isArray(c.serviceAreas)
      ? c.serviceAreas.filter((x): x is string => typeof x === "string").slice(0, 50)
      : [],
    hasOwner: typeof c.ownerUid === "string" && c.ownerUid.length > 0,
  };
}
