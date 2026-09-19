"use client";

// Delivery Engine — Admin Control Tower (Phase 2B-6A).
//
// A real, functional admin UI over the EXISTING Delivery Engine admin APIs.
// It never talks to Firestore directly and never renders secrets: every field
// shown comes from the server allow-list projections (admin/jobs, jobs/[jobId],
// admin/persons, admin/companies). scanToken/deliveryOtp/raw GPS/deviceId are
// never fetched-as-text here; the QR is rendered as an image. The backend
// remains authoritative for every transition — the enable/disable logic below
// is a UX hint only, and each action still round-trips to the server.
import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { mapsSearchUrl } from "@/lib/maps";
import type {
  AdminJobRow,
  AdminPersonRow,
  AdminCompanyRow,
  AdminReturnJobRow,
} from "@/lib/deliveryEngine/adminProjections";
// Local, offline SVG QR renderer (no network, no third-party service). The
// payload it encodes embeds the scanToken but is never rendered as text.
import QRCode from "react-qr-code";

// Safe subset of GET /api/delivery/jobs/[jobId] we actually render. Delivery
// Navigation Phase N1 (admin-only) additionally surfaces the seller/hub/customer
// ADDRESSES (already returned to admin by that endpoint) so the operator can
// open them in a maps app. Still no phone, no assignedPersonPhone, no OTP/
// scanToken/raw GPS, no secrets.
type JobDetail = {
  responsibleParty: { kind: string | null; companyId: string | null; personId: string | null } | null;
  pickup?: { sellerName?: string; street?: string; unit?: string; city?: string; state?: string; zipCode?: string } | null;
  drop?: { customerName?: string; address?: string } | null;
  originHub?: { name?: string; address?: string; city?: string; region?: string; pincode?: string } | null;
  destinationHub?: { name?: string; address?: string; city?: string; region?: string; pincode?: string } | null;
  parcel?: { items?: { name?: string; qty?: number }[] } | null;
};

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
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

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return "—"; }
}

// Pre-execution statuses an admin may still (re)assign or hand off. Mirrors the
// backend PRE_EXECUTION_STATUSES purely for UX enable/disable — the server
// re-validates and is authoritative.
const ASSIGNABLE = new Set(["Created", "OfferedToCompany", "AcceptedByCompany", "AssignedToYomico", "AssignedToCompany", "RejectedByCompany"]);
function canAssign(status: string): boolean { return ASSIGNABLE.has(status); }
function needsReconcile(j: AdminJobRow): boolean { return j.status === "Delivered" && !j.commerceReconciledAt; }

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Delivered" ? "bg-green-100 text-green-800"
      : status === "DeliveryFailed" ? "bg-red-100 text-red-800"
      : status === "InProgress" ? "bg-blue-100 text-blue-800"
      : status === "Cancelled" || status === "Returned" ? "bg-gray-200 text-gray-700"
      : "bg-amber-100 text-amber-800";
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

// Admin Operations V1 — the return-collection job's OWN status vocabulary
// (ReturnJobStatus in lib/deliveryEngine/returnCollection.ts), deliberately
// distinct from forward DeliveryJobStatus above — never conflated.
function ReturnStatusBadge({ status }: { status: string }) {
  const tone =
    status === "Received" ? "bg-green-100 text-green-800"
      : status === "CollectionFailed" ? "bg-red-100 text-red-800"
      : status === "Collected" || status === "OutForCollection" ? "bg-blue-100 text-blue-800"
      : status === "Cancelled" ? "bg-gray-200 text-gray-700"
      : "bg-amber-100 text-amber-800";
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

export default function ControlTowerPage() {
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Admin Operations V1 — return-collection jobs (reverse logistics). A
  // SEPARATE list, state and section from the forward jobs above — never
  // merged into the same table (see the return-jobs route's own comment).
  const [returnJobs, setReturnJobs] = useState<AdminReturnJobRow[]>([]);
  const [returnJobsLoading, setReturnJobsLoading] = useState(true);
  const [returnJobsError, setReturnJobsError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AdminJobRow | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [persons, setPersons] = useState<AdminPersonRow[] | null>(null);
  const [companies, setCompanies] = useState<AdminCompanyRow[] | null>(null);

  const [busy, setBusy] = useState<string | null>(null); // action key in-flight → prevents duplicate submits
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [orderIdInput, setOrderIdInput] = useState("");
  const [qr, setQr] = useState<{ payload: string; shipmentNumber: string } | null>(null);

  const loadJobs = useCallback(async () => {
    setListError(null);
    try {
      const res = await authedFetch("/api/delivery/admin/jobs?limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load jobs.");
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load jobs.");
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadReturnJobs = useCallback(async () => {
    setReturnJobsError(null);
    try {
      const res = await authedFetch("/api/delivery/admin/return-jobs?limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load return-collection jobs.");
      setReturnJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      setReturnJobsError(e instanceof Error ? e.message : "Failed to load return-collection jobs.");
    } finally {
      setReturnJobsLoading(false);
    }
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);
  useEffect(() => { void loadReturnJobs(); }, [loadReturnJobs]);

  const refresh = useCallback(async () => {
    setBusy("refresh");
    await Promise.all([loadJobs(), loadReturnJobs()]);
    setBusy(null);
  }, [loadJobs, loadReturnJobs]);

  const openDetail = useCallback(async (job: AdminJobRow) => {
    setSelected(job);
    setDetail(null);
    setQr(null);
    setDetailLoading(true);
    try {
      const res = await authedFetch(`/api/delivery/jobs/${encodeURIComponent(job.jobId)}`);
      const data = await res.json();
      if (res.ok && data?.job) {
        setDetail({
          responsibleParty: data.job.responsibleParty ?? null,
          pickup: data.job.pickup ?? null,
          drop: data.job.drop ? { customerName: data.job.drop.customerName, address: data.job.drop.address } : null,
          originHub: data.job.originHub ?? null,
          destinationHub: data.job.destinationHub ?? null,
          parcel: data.job.parcel ?? null,
        });
      }
      // Lazy-load pickers only when the job can still be (re)assigned.
      if (canAssign(job.status)) {
        if (!persons) {
          const pr = await authedFetch("/api/delivery/admin/persons?assignable=1");
          const pd = await pr.json();
          if (pr.ok) setPersons(Array.isArray(pd.persons) ? pd.persons : []);
        }
        if (!companies) {
          const cr = await authedFetch("/api/delivery/admin/companies");
          const cd = await cr.json();
          if (cr.ok) setCompanies(Array.isArray(cd.companies) ? cd.companies : []);
        }
      }
    } catch {
      /* detail is best-effort; the row already has the core fields */
    } finally {
      setDetailLoading(false);
    }
  }, [persons, companies]);

  // Run an action guarded against duplicate submission; refresh + refetch detail on success.
  const runAction = useCallback(
    async (key: string, path: string, body?: unknown, successMsg = "Done.") => {
      if (busy) return; // a submission is already in flight
      setBusy(key);
      setFeedback(null);
      try {
        const res = await authedFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Action failed.");
        setFeedback({ type: "success", msg: successMsg });
        await loadJobs();
        if (selected) {
          const fresh = (await (await authedFetch("/api/delivery/admin/jobs?limit=100")).json())?.jobs as AdminJobRow[] | undefined;
          const updated = fresh?.find((j) => j.jobId === selected.jobId) || null;
          if (updated) setSelected(updated);
        }
      } catch (e) {
        setFeedback({ type: "error", msg: e instanceof Error ? e.message : "Action failed." });
      } finally {
        setBusy(null);
      }
    },
    [busy, loadJobs, selected]
  );

  const materialize = useCallback(async () => {
    const orderId = orderIdInput.trim();
    if (!orderId || busy) return;
    await runAction("materialize", "/api/delivery/jobs/materialize", { orderId }, "Delivery jobs materialized (idempotent).");
    setOrderIdInput("");
  }, [orderIdInput, busy, runAction]);

  const showQr = useCallback(async (job: AdminJobRow) => {
    if (busy) return;
    setBusy("qr");
    setFeedback(null);
    try {
      const res = await authedFetch(`/api/delivery/jobs/${encodeURIComponent(job.jobId)}/qr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load QR.");
      // The payload (which embeds the scanToken) is fed ONLY into the QR SVG
      // renderer below — never rendered as visible text, never logged, and never
      // sent to any third-party service (react-qr-code encodes locally).
      setQr({ payload: String(data.qr), shipmentNumber: String(data.shipmentNumber || job.shipmentNumber || "") });
    } catch (e) {
      setFeedback({ type: "error", msg: e instanceof Error ? e.message : "Could not load QR." });
    } finally {
      setBusy(null);
    }
  }, [busy]);

  return (
    <div className="w-full max-w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Delivery Control Tower</h1>
          <p className="text-sm text-gray-500">Live view of delivery jobs across all providers.</p>
        </div>
        <button
          onClick={refresh}
          disabled={busy === "refresh"}
          className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Materialize */}
      <div className="mb-4 rounded border bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[200px]">
            <span className="block text-xs font-medium text-gray-600">Materialize delivery jobs for an order</span>
            <input
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value)}
              placeholder="Order ID"
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={materialize}
            disabled={!orderIdInput.trim() || busy === "materialize"}
            className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy === "materialize" ? "Materializing…" : "Materialize"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Creates one job per (order, vendor). Safe to re-run (idempotent).</p>
      </div>

      {feedback && (
        <div className={`mb-4 rounded px-3 py-2 text-sm ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      {/* LIST */}
      {listLoading ? (
        <div className="rounded border bg-white p-8 text-center text-gray-500">Loading delivery jobs…</div>
      ) : listError ? (
        <div className="rounded border bg-red-50 p-6 text-center text-red-700">
          <p className="mb-3">{listError}</p>
          <button onClick={refresh} className="rounded bg-black px-3 py-2 text-sm text-white">Retry</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-gray-500">
          No delivery jobs yet. Materialize an order above to create one.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Shipment</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Seller</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Custody</th>
                  <th className="px-3 py-2">Reconciled</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.jobId} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{j.shipmentNumber || "—"}</td>
                    <td className="px-3 py-2">{j.orderNumber || "—"}</td>
                    <td className="px-3 py-2">{j.vendorName || "—"}</td>
                    <td className="px-3 py-2">{j.providerType || "—"}{j.companyName ? ` · ${j.companyName}` : ""}</td>
                    <td className="px-3 py-2">{j.assignedPersonName || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <StatusBadge status={j.status} />
                        {j.lastDeliveryException && (
                          <span title={`${j.lastDeliveryException.code}${j.lastDeliveryException.note ? `: ${j.lastDeliveryException.note}` : ""}`} className="text-amber-600">⚠️</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{j.currentStage || "—"}</td>
                    <td className="px-3 py-2">{j.custody?.holderKind || "—"}</td>
                    <td className="px-3 py-2">{j.commerceReconciledAt ? "✓" : (j.status === "Delivered" ? "pending" : "—")}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmt(j.updatedAt)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => openDetail(j)} className="rounded border px-2 py-1 text-xs hover:bg-gray-100">Manage</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {jobs.map((j) => (
              <div key={j.jobId} className="rounded border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{j.shipmentNumber || "—"}</span>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={j.status} />
                    {j.lastDeliveryException && <span className="text-amber-600">⚠️</span>}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
                  <div><span className="text-gray-400">Order</span> {j.orderNumber || "—"}</div>
                  <div><span className="text-gray-400">Seller</span> {j.vendorName || "—"}</div>
                  <div><span className="text-gray-400">Provider</span> {j.providerType || "—"}</div>
                  <div><span className="text-gray-400">Assigned</span> {j.assignedPersonName || "—"}</div>
                  <div><span className="text-gray-400">Stage</span> {j.currentStage || "—"}</div>
                  <div><span className="text-gray-400">Custody</span> {j.custody?.holderKind || "—"}</div>
                </div>
                <button onClick={() => openDetail(j)} className="mt-3 w-full rounded border px-2 py-1.5 text-sm hover:bg-gray-100">Manage</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Return-collection jobs — a SEPARATE reverse-logistics list, never
          merged into the forward-delivery table above. */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Return Collection Jobs</h2>
        <p className="text-sm text-gray-500">
          Reverse pickup jobs the Delivery App executes for customer returns. Refund/inspection stay with the
          Returns FSM — this only tracks physical collection.
        </p>

        {returnJobsLoading ? (
          <div className="mt-3 rounded border bg-white p-8 text-center text-gray-500">Loading return-collection jobs…</div>
        ) : returnJobsError ? (
          <div className="mt-3 rounded border bg-red-50 p-6 text-center text-red-700">
            <p className="mb-3">{returnJobsError}</p>
            <button onClick={() => void loadReturnJobs()} className="rounded bg-black px-3 py-2 text-sm text-white">Retry</button>
          </div>
        ) : returnJobs.length === 0 ? (
          <div className="mt-3 rounded border bg-white p-8 text-center text-gray-500">No return-collection jobs yet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Seller</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {returnJobs.map((r) => (
                  <tr key={r.returnJobId} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{r.requestNumber || "—"}</td>
                    <td className="px-3 py-2">{r.orderNumber || "—"}</td>
                    <td className="px-3 py-2">{r.vendorName || "—"}</td>
                    <td className="px-3 py-2">{r.customerName || "—"}</td>
                    <td className="px-3 py-2">{r.itemName ? `${r.itemName} ×${r.itemQty}` : "—"}</td>
                    <td className="px-3 py-2">{r.assignedPersonName || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <ReturnStatusBadge status={r.status} />
                        {r.lastException && (
                          <span title={`${r.lastException.code}${r.lastException.note ? `: ${r.lastException.note}` : ""}`} className="text-amber-600">⚠️</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.attemptCount}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmt(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAIL slide-over */}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Job detail</h2>
              <button onClick={() => setSelected(null)} className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100">✕</button>
            </div>

            <dl className="space-y-1.5 text-sm">
              <Row k="Shipment" v={selected.shipmentNumber} mono />
              <Row k="Order" v={selected.orderNumber} />
              <Row k="Seller" v={selected.vendorName} />
              <Row k="Provider" v={`${selected.providerType || "—"}${selected.companyName ? ` · ${selected.companyName}` : ""}`} />
              <Row k="Assigned person" v={selected.assignedPersonName} />
              <Row k="Status" v={selected.status} />
              <Row k="Stage" v={selected.currentStage} />
              <Row k="Current leg" v={selected.currentLegId} mono />
              <Row k="Custody" v={selected.custody?.holderKind} />
              <Row k="Responsible party" v={detail?.responsibleParty ? `${detail.responsibleParty.kind ?? "—"}` : (detailLoading ? "…" : "—")} />
              <Row k="Pickup seller" v={detail?.pickup?.sellerName} />
              <Row k="Customer" v={detail?.drop?.customerName} />
              <Row k="Items" v={detail?.parcel?.items ? detail.parcel.items.map((i) => `${i.name} ×${i.qty}`).join(", ") : (detailLoading ? "…" : "—")} />
              <Row k="Last event" v={fmt(selected.lastEventAt)} />
              <Row k="Reconciled" v={selected.commerceReconciledAt ? fmt(selected.commerceReconciledAt) : (selected.status === "Delivered" ? "pending" : "—")} />
              <Row k="Created" v={fmt(selected.createdAt)} />
              <Row k="Delivered" v={fmt(selected.deliveredAt)} />
              {selected.lastDeliveryException && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs font-semibold text-amber-800">
                    Last reported delivery issue: {selected.lastDeliveryException.code}
                  </p>
                  <p className="text-[11px] text-amber-700">
                    {fmt(selected.lastDeliveryException.reportedAt)}
                    {selected.lastDeliveryException.note ? ` — ${selected.lastDeliveryException.note}` : ""}
                  </p>
                </div>
              )}
            </dl>

            {/* Delivery Navigation Phase N1 (admin-only) — open each KNOWN
                address in the operator's maps app (new tab). Navigation only:
                no coordinates, no GPS, no tracking, no geocoding, no Maps API.
                A destination with no address renders no link. */}
            {(() => {
              const sellerAddr = sellerAddressLine(detail?.pickup);
              const originAddr = hubAddressLine(detail?.originHub);
              const destAddr = hubAddressLine(detail?.destinationHub);
              const custAddr = (detail?.drop?.address ?? "").trim();
              if (!(sellerAddr || originAddr || destAddr || custAddr)) return null;
              return (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Navigation</p>
                  <ul className="space-y-1.5 text-sm">
                    <LocationRow label="Seller / Pickup" address={sellerAddr} />
                    <LocationRow label="Origin hub" address={originAddr} />
                    <LocationRow label="Destination hub" address={destAddr} />
                    <LocationRow label="Customer / Drop" address={custAddr} />
                  </ul>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="mt-4 space-y-3 border-t pt-4">
              {canAssign(selected.status) ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Assign YOMICO person</label>
                    <select
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-50"
                      disabled={!!busy}
                      defaultValue=""
                      onChange={(e) => { const v = e.target.value; if (v) void runAction(`assign-${v}`, `/api/delivery/jobs/${encodeURIComponent(selected.jobId)}/assign-yomico`, { personId: v }, "Assigned to YOMICO person."); }}
                    >
                      <option value="" disabled>{persons ? (persons.length ? "Select an available person…" : "No available YOMICO persons") : "Loading…"}</option>
                      {persons?.map((p) => (
                        <option key={p.personId} value={p.personId}>{p.name || p.personId}{p.serviceArea ? ` — ${p.serviceArea}` : ""}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600">Hand off to delivery company</label>
                    <select
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-50"
                      disabled={!!busy}
                      defaultValue=""
                      onChange={(e) => { const v = e.target.value; if (v) void runAction(`handoff-${v}`, `/api/delivery/jobs/${encodeURIComponent(selected.jobId)}/handoff-company`, { companyId: v }, "Handed off to company (company assigns its own person)."); }}
                    >
                      <option value="" disabled>{companies ? (companies.length ? "Select a company…" : "No active companies") : "Loading…"}</option>
                      {companies?.map((c) => (
                        <option key={c.companyId} value={c.companyId}>{c.name || c.companyId}{c.hasOwner ? "" : " (no owner)"}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">The company assigns its own delivery person — admin never selects it.</p>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400">This job is past the assignment stage; provider changes are no longer available (handled via handover in the field).</p>
              )}

              {needsReconcile(selected) && (
                <button
                  onClick={() => void runAction("reconcile", `/api/delivery/jobs/${encodeURIComponent(selected.jobId)}/reconcile`, undefined, "Reconciliation completed.")}
                  disabled={!!busy}
                  className="w-full rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {busy === "reconcile" ? "Reconciling…" : "Retry commerce reconciliation"}
                </button>
              )}

              <button
                onClick={() => void showQr(selected)}
                disabled={!!busy}
                className="w-full rounded border px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
              >
                {busy === "qr" ? "Fetching QR…" : "Show shipment QR"}
              </button>

              {qr && (
                <div className="rounded border bg-gray-50 p-3 text-center">
                  <div className="mx-auto flex h-44 w-44 items-center justify-center bg-white p-2">
                    <QRCode value={qr.payload} size={160} level="M" />
                  </div>
                  <p className="mt-2 font-mono text-xs text-gray-700">{qr.shipmentNumber}</p>
                  <p className="text-[10px] text-gray-400">Scannable QR generated locally; the scan token is never shown as text.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Delivery Navigation Phase N1 (admin-only) — compose ONE address string for a
// maps link from the parts the jobs/[jobId] projection already returns. Pure
// string formatting; no coordinates/geocoding.
function sellerAddressLine(p?: { street?: string; unit?: string; city?: string; state?: string; zipCode?: string } | null): string {
  return [p?.street, p?.unit, p?.city, p?.state, p?.zipCode].filter(Boolean).join(", ");
}
function hubAddressLine(h?: { address?: string; city?: string; region?: string; pincode?: string } | null): string {
  return [h?.address, h?.city, h?.region, h?.pincode].filter(Boolean).join(", ");
}
// "Open in Maps" external link (new tab). Renders nothing when the address is
// empty, so a missing address never gets a link (never guesses a destination).
function MapsLink({ address }: { address?: string | null }) {
  const url = mapsSearchUrl(address);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-medium text-indigo-600 hover:underline">
      Open in Maps ↗
    </a>
  );
}
// One labeled navigation row: address text + its Open-in-Maps link. Renders
// nothing at all when there is no address for this destination.
function LocationRow({ label, address }: { label: string; address?: string | null }) {
  const a = (address ?? "").trim();
  if (!a) return null;
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="text-gray-600">{label}</span>
        <br />
        <span className="text-xs text-gray-400 break-words">{a}</span>
      </span>
      <MapsLink address={a} />
    </li>
  );
}

function Row({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-400">{k}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{v || "—"}</dd>
    </div>
  );
}
