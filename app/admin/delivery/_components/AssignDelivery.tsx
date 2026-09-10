"use client";

// Admin delivery assignment for ONE order, using the CURRENT delivery engine
// (never the legacy `deliveryPartners` collection). An order materialises into
// one DeliveryJob per (order, vendor); each job is assigned independently to a
// provider:
//   • YOMICO person/freelancer → POST /api/delivery/jobs/[jobId]/assign-yomico { personId }
//   • Delivery company         → POST /api/delivery/jobs/[jobId]/handoff-company { companyId }
//
// Admin selects a YOMICO person OR a company — NEVER the company's rider. When a
// job is handed to a company, the company assigns its own rider(s) in the Company
// Console. All eligibility/authorization is enforced server-side; the selects
// here are UX only. This component reuses existing endpoints and adds no backend.
import { useCallback, useState } from "react";
import { auth } from "@/lib/firebase";

type PersonRow = { personId: string; name?: string | null; serviceArea?: string | null };
type CompanyRow = { companyId: string; name?: string | null; hasOwner?: boolean };
type JobRow = {
  jobId: string;
  vendorName?: string | null;
  shipmentNumber?: string | null;
  status: string;
  providerType?: string | null;
  assignedPersonName?: string | null;
  assignedCompanyName?: string | null;
  currentStage?: string | null;
};

// Pre-execution statuses the engine still lets an admin (re)assign / hand off.
// The server re-validates and remains authoritative; this only enables the UI.
const ASSIGNABLE = new Set([
  "Created",
  "OfferedToCompany",
  "AssignedToYomico",
  "AssignedToCompany",
  "RejectedByCompany",
]);

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

export default function AssignDelivery({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadJobDetail = useCallback(async (jobId: string): Promise<JobRow> => {
    const res = await authedFetch(`/api/delivery/jobs/${encodeURIComponent(jobId)}`);
    const data = await res.json().catch(() => ({}));
    const j = data?.job;
    return {
      jobId,
      vendorName: j?.vendorName ?? null,
      shipmentNumber: j?.shipmentNumber ?? null,
      status: typeof j?.status === "string" ? j.status : "Unknown",
      providerType: j?.providerType ?? null,
      assignedPersonName: j?.assignedPersonName ?? null,
      assignedCompanyName: j?.assignedCompanyName ?? null,
      currentStage: j?.currentStage ?? null,
    };
  }, []);

  // Materialise the order's DeliveryJob(s) (idempotent — creates one per vendor
  // only if missing), then load each job's current state plus the provider lists.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mRes = await authedFetch("/api/delivery/jobs/materialize", {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });
      const mData = await mRes.json().catch(() => ({}));
      if (!mRes.ok) throw new Error(mData?.error || "Could not prepare delivery jobs for this order.");
      const jobMetas: { jobId: string }[] = Array.isArray(mData?.jobs) ? mData.jobs : [];
      const rows = await Promise.all(jobMetas.map((m) => loadJobDetail(m.jobId)));
      setJobs(rows);

      const [pr, cr] = await Promise.all([
        authedFetch("/api/delivery/admin/persons?assignable=1"),
        authedFetch("/api/delivery/admin/companies"),
      ]);
      const pd = await pr.json().catch(() => ({}));
      const cd = await cr.json().catch(() => ({}));
      if (pr.ok) setPersons(Array.isArray(pd.persons) ? pd.persons : []);
      if (cr.ok) setCompanies(Array.isArray(cd.companies) ? cd.companies : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load delivery assignment.");
    } finally {
      setLoading(false);
    }
  }, [orderId, loadJobDetail]);

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && jobs === null && !loading) void load();
  }, [open, jobs, loading, load]);

  const reloadJob = useCallback(async (jobId: string) => {
    try {
      const row = await loadJobDetail(jobId);
      setJobs((prev) => (prev ? prev.map((j) => (j.jobId === jobId ? row : j)) : prev));
    } catch {
      /* best-effort refresh */
    }
  }, [loadJobDetail]);

  const assignYomico = useCallback(async (jobId: string, personId: string) => {
    if (!personId || busy) return;
    setBusy(`${jobId}:person`);
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/jobs/${encodeURIComponent(jobId)}/assign-yomico`, {
        method: "POST",
        body: JSON.stringify({ personId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not assign this YOMICO person.");
      await reloadJob(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign this YOMICO person.");
    } finally {
      setBusy(null);
    }
  }, [busy, reloadJob]);

  const handoffCompany = useCallback(async (jobId: string, companyId: string) => {
    if (!companyId || busy) return;
    setBusy(`${jobId}:company`);
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/jobs/${encodeURIComponent(jobId)}/handoff-company`, {
        method: "POST",
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not hand this shipment to the company.");
      await reloadJob(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not hand this shipment to the company.");
    } finally {
      setBusy(null);
    }
  }, [busy, reloadJob]);

  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        aria-expanded={open}
      >
        {open ? "Hide assignment" : "Assign delivery"}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border bg-gray-50 p-3 text-left">
          {loading ? (
            <p className="text-sm text-gray-500">Loading delivery jobs…</p>
          ) : error ? (
            <div className="text-sm text-red-700">
              <p>{error}</p>
              <button onClick={() => void load()} className="mt-1 underline">Retry</button>
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <p className="text-sm text-gray-500">No delivery jobs for this order.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const assignable = ASSIGNABLE.has(job.status);
                const isCompany = job.providerType === "COMPANY";
                const isYomico = job.providerType === "YOMICO";
                return (
                  <div key={job.jobId} className="rounded border bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800">{job.vendorName || "Seller"}</span>
                      <span className="font-mono text-[11px] text-gray-500">{job.shipmentNumber || "—"}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Status: {job.status}{job.currentStage ? ` · ${job.currentStage}` : ""}
                    </p>

                    {/* Current assignment */}
                    {isYomico && job.assignedPersonName ? (
                      <p className="mt-1 text-xs text-indigo-700">Assigned: {job.assignedPersonName} (YOMICO)</p>
                    ) : isCompany ? (
                      <p className="mt-1 text-xs text-teal-700">
                        Company: {job.assignedCompanyName || "—"} — the company will assign its rider.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-400">Not assigned</p>
                    )}

                    {assignable ? (
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600">YOMICO delivery person</label>
                          <select
                            className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-50"
                            defaultValue=""
                            disabled={!!busy}
                            onChange={(e) => { const v = e.target.value; if (v) void assignYomico(job.jobId, v); e.currentTarget.value = ""; }}
                          >
                            <option value="" disabled>
                              {persons.length ? "Assign a YOMICO person…" : "No active + available persons"}
                            </option>
                            {persons.map((p) => (
                              <option key={p.personId} value={p.personId}>
                                {p.name || p.personId}{p.serviceArea ? ` — ${p.serviceArea}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600">Delivery company</label>
                          <select
                            className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-50"
                            defaultValue=""
                            disabled={!!busy}
                            onChange={(e) => { const v = e.target.value; if (v) void handoffCompany(job.jobId, v); e.currentTarget.value = ""; }}
                          >
                            <option value="" disabled>
                              {companies.length ? "Hand off to a company…" : "No active companies"}
                            </option>
                            {companies.map((c) => (
                              <option key={c.companyId} value={c.companyId}>
                                {c.name || c.companyId}{c.hasOwner ? "" : " (no owner)"}
                              </option>
                            ))}
                          </select>
                          <p className="mt-0.5 text-[10px] text-gray-400">
                            The company assigns its own rider — admin never selects it.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-gray-400">
                        Past the assignment stage — changes are handled in the field / Company Console.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
