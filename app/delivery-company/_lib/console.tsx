"use client";

// Delivery Company Web Console — shared client helpers, types and context.
//
// UI-ONLY milestone. This module NEVER talks to Firestore directly and never
// renders secrets: every field shown comes from the existing server allow-list
// projections (whoami, company/jobs, jobs/[jobId], company/persons). scanToken,
// deliveryOtpHash, OTP and raw GPS are never fetched or displayed here.
//
// The backend is authoritative for company identity: companyId is resolved
// server-side from the verified Firebase uid (GET /api/delivery/whoami) and is
// NEVER read from the URL, query, localStorage or a request body on the client.
import { createContext, useContext } from "react";
import { auth } from "@/lib/firebase";

// ---- Bearer-auth fetch (same convention as the Control Tower / admin pages) ----
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const idToken = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

// ---- API response shapes (allow-listed subsets we actually render) ----

// GET /api/delivery/company/jobs → { companyId, jobs: CompanyJob[] }
export type CompanyJob = {
  id: string;
  orderNumber?: string;
  vendorName?: string;
  shipmentNumber?: string;
  status: string;
  currentStage?: string;
  assignedPersonId?: string | null;
  assignedPersonName?: string | null;
  drop?: { area?: string; slot?: string | null } | null;
  parcel?: { items?: { name?: string; qty?: number }[] } | null;
  updatedAt?: unknown;
};

// GET /api/delivery/jobs/[jobId] → { job: CompanyJobDetail } (no secrets)
export type CompanyJobDetail = {
  id: string;
  orderId?: string;
  orderNumber?: string;
  vendorId?: string;
  vendorName?: string;
  shipmentNumber?: string;
  orderShipmentNumber?: string;
  providerType?: string | null;
  companyId?: string | null;
  status: string;
  currentLegId?: string | null;
  currentStage?: string;
  responsibleParty?: { kind: string | null; companyId: string | null; personId: string | null } | null;
  assignedPersonId?: string | null;
  assignedPersonName?: string | null;
  assignedPersonPhone?: string | null;
  assignedCompanyName?: string | null;
  pickup?: { sellerName?: string; area?: string } | null;
  drop?: { customerName?: string; phone?: string; address?: string; slot?: string | null } | null;
  parcel?: { items?: { name?: string; qty?: number }[] } | null;
};

// GET /api/delivery/company/persons → { companyId, persons: CompanyPerson[] }
export type CompanyPerson = {
  id: string;
  providerType?: string;
  name?: string;
  phone?: string;
  email?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  serviceArea?: string;
  accountStatus?: string;
  availability?: string;
};

// ---- Status / stage helpers (truthful; no fabricated hub/transit framing) ----

// Company-visible job statuses grouped for the operator. RejectedByCompany strips
// the companyId server-side, so a rejected job leaves the company's list entirely.
export const AWAITING_STATUSES: ReadonlySet<string> = new Set(["OfferedToCompany"]);
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["AssignedToCompany", "InProgress"]);
export const COMPLETED_STATUSES: ReadonlySet<string> = new Set([
  "Delivered", "DeliveryFailed", "Returned", "Cancelled",
]);

// Statuses at which the existing assign/reject APIs still accept an operation
// (mirrors the backend pre-execution gate — the server re-validates and wins).
export const COMPANY_ACTIONABLE_STATUSES: ReadonlySet<string> = new Set([
  "OfferedToCompany", "AssignedToCompany",
]);

export function statusMeta(status: string): { label: string; tone: string } {
  switch (status) {
    case "OfferedToCompany": return { label: "Awaiting your action", tone: "bg-amber-100 text-amber-800" };
    case "AssignedToCompany": return { label: "Assigned", tone: "bg-indigo-100 text-indigo-800" };
    case "InProgress": return { label: "In progress", tone: "bg-blue-100 text-blue-800" };
    case "Delivered": return { label: "Delivered", tone: "bg-green-100 text-green-800" };
    case "DeliveryFailed": return { label: "Delivery failed", tone: "bg-red-100 text-red-800" };
    case "Returned": return { label: "Returned", tone: "bg-gray-200 text-gray-700" };
    case "Cancelled": return { label: "Cancelled", tone: "bg-gray-200 text-gray-700" };
    case "RejectedByCompany": return { label: "Rejected", tone: "bg-gray-200 text-gray-700" };
    default: return { label: status, tone: "bg-gray-100 text-gray-700" };
  }
}

// Friendly labels for the CORE company flow only. Anything else falls through to
// the raw server value — we never invent "at hub" / "received at destination hub"
// wording for stages the runtime is not actually in.
const STAGE_LABELS: Record<string, string> = {
  AwaitingHandoff: "Awaiting pickup",
  PickupComplete: "Picked up",
  PickedUp: "Picked up",
  OutForDelivery: "Out for delivery",
  Delivered: "Delivered",
};
export function stageLabel(stage?: string | null): string {
  if (!stage) return "—";
  return STAGE_LABELS[stage] ?? stage;
}

/** A person eligible to RECEIVE an assignment: Active account AND Available. */
export function isAssignablePerson(p: CompanyPerson): boolean {
  const acct = p.accountStatus || "Active";
  return acct === "Active" && p.availability === "Available";
}

// Firestore Timestamps serialize to { _seconds, _nanoseconds } over JSON; also
// tolerate ISO strings / millis. Returns 0 when unknown.
export function tsMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; }
  if (typeof v === "object") {
    const o = v as { _seconds?: number; seconds?: number; toMillis?: () => number };
    if (typeof o.toMillis === "function") { try { return o.toMillis(); } catch { /* ignore */ } }
    if (typeof o._seconds === "number") return o._seconds * 1000;
    if (typeof o.seconds === "number") return o.seconds * 1000;
  }
  return 0;
}
export function fmtTs(v: unknown): string {
  const m = tsMillis(v);
  if (!m) return "—";
  try { return new Date(m).toLocaleString(); } catch { return "—"; }
}

export function itemsSummary(items?: { name?: string; qty?: number }[] | null): string {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return items.map((i) => `${i.name ?? "item"} ×${i.qty ?? 1}`).join(", ");
}

// ---- Company identity context (provided by the layout after whoami) ----
export type CompanyIdentity = { companyId: string; companyName: string };
const CompanyContext = createContext<CompanyIdentity | null>(null);

export function CompanyProvider({ value, children }: { value: CompanyIdentity; children: React.ReactNode }) {
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyIdentity {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used inside the Delivery Company console layout.");
  return ctx;
}

// ---- Small shared presentational pieces ----
export function StatusBadge({ status }: { status: string }) {
  const { label, tone } = statusMeta(status);
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-500">
      {label || "Loading…"}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
      <p className="mb-3">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="rounded bg-red-700 px-3 py-1.5 text-sm text-white">Retry</button>
      ) : null}
    </div>
  );
}

export function EmptyBox({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-white p-8 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
    </div>
  );
}
