"use client";

// Delivery Company — Jobs. The company's own jobs (GET /api/delivery/company/jobs
// is company-scoped server-side; another company's jobs can never appear here).
// OfferedToCompany rows expand an inline Assign / Reject panel (shared with the
// job-detail page); assigned/active/completed rows link to the detail view.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import JobActions from "@/app/delivery-company/_components/JobActions";
import {
  authedFetch,
  StatusBadge,
  Spinner,
  ErrorBox,
  EmptyBox,
  stageLabel,
  fmtTs,
  tsMillis,
  itemsSummary,
  AWAITING_STATUSES,
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
  type CompanyJob,
  type CompanyPerson,
} from "@/app/delivery-company/_lib/console";

type Filter = "awaiting" | "active" | "completed" | "all";

export default function DeliveryCompanyJobsPage() {
  const [jobs, setJobs] = useState<CompanyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [openId, setOpenId] = useState<string | null>(null);

  // People are loaded once, lazily, and cached for the inline assign picker.
  const [persons, setPersons] = useState<CompanyPerson[] | null>(null);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [personsError, setPersonsError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/delivery/company/jobs");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load your delivery jobs.");
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your delivery jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPersons = useCallback(async () => {
    setPersonsLoading(true);
    setPersonsError(null);
    try {
      const res = await authedFetch("/api/delivery/company/persons");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load your delivery people.");
      setPersons(Array.isArray(data.persons) ? data.persons : []);
    } catch (e) {
      setPersonsError(e instanceof Error ? e.message : "Could not load your delivery people.");
    } finally {
      setPersonsLoading(false);
    }
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const toggleOpen = (job: CompanyJob) => {
    const next = openId === job.id ? null : job.id;
    setOpenId(next);
    if (next && persons === null && !personsLoading) void loadPersons();
  };

  const filtered = useMemo(() => {
    const sorted = [...jobs].sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
    if (filter === "all") return sorted;
    const set = filter === "awaiting" ? AWAITING_STATUSES : filter === "active" ? ACTIVE_STATUSES : COMPLETED_STATUSES;
    return sorted.filter((j) => set.has(j.status));
  }, [jobs, filter]);

  const counts = useMemo(() => ({
    awaiting: jobs.filter((j) => AWAITING_STATUSES.has(j.status)).length,
    active: jobs.filter((j) => ACTIVE_STATUSES.has(j.status)).length,
    completed: jobs.filter((j) => COMPLETED_STATUSES.has(j.status)).length,
    all: jobs.length,
  }), [jobs]);

  const TABS: { key: Filter; label: string }[] = [
    { key: "awaiting", label: `Awaiting action (${counts.awaiting})` },
    { key: "active", label: `Active (${counts.active})` },
    { key: "completed", label: `Completed (${counts.completed})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  const afterAction = useCallback(async () => {
    setOpenId(null);
    await Promise.all([loadJobs(), loadPersons()]); // refresh authoritative state
  }, [loadJobs, loadPersons]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500">Handoffs from YOMICO and your active deliveries.</p>
        </div>
        <button
          onClick={() => { setLoading(true); void loadJobs(); }}
          disabled={loading}
          className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setFilter(t.key); setOpenId(null); }}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium ${
              filter === t.key ? "bg-slate-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading your delivery jobs…" />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => { setLoading(true); void loadJobs(); }} />
      ) : filtered.length === 0 ? (
        <EmptyBox
          title="No jobs here"
          subtitle={filter === "awaiting" ? "New handoffs from YOMICO will appear here." : "Nothing to show for this filter."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const isOffered = job.status === "OfferedToCompany";
            const open = openId === job.id;
            const itemCount = Array.isArray(job.parcel?.items) ? job.parcel!.items!.length : 0;
            return (
              <div key={job.id} className="rounded-lg border bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-700">{job.shipmentNumber || "—"}</span>
                      <StatusBadge status={job.status} />
                      {isOffered ? (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          Action needed
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{job.vendorName || "Seller"}</p>
                    <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-gray-500 sm:grid-cols-2">
                      <span>Order: {job.orderNumber || "—"}</span>
                      <span>Stage: {stageLabel(job.currentStage)}</span>
                      <span>Items: {itemCount || "—"}</span>
                      <span>Delivery slot: {job.drop?.slot || "—"}</span>
                      <span className="sm:col-span-2">
                        {job.assignedPersonName ? `Assigned: ${job.assignedPersonName}` : "Unassigned"} · Updated {fmtTs(job.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link
                      href={`/delivery-company/jobs/${encodeURIComponent(job.id)}`}
                      className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Open
                    </Link>
                    {isOffered ? (
                      <button
                        onClick={() => toggleOpen(job)}
                        className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                        aria-expanded={open}
                      >
                        {open ? "Close" : "Assign / Reject"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {isOffered && open ? (
                  <div className="border-t bg-gray-50 p-4">
                    <JobActions
                      jobId={job.id}
                      status={job.status}
                      assignedPersonName={job.assignedPersonName}
                      persons={persons}
                      personsLoading={personsLoading}
                      personsError={personsError}
                      onReloadPersons={() => void loadPersons()}
                      onDone={() => void afterAction()}
                    />
                    <p className="mt-3 text-[11px] text-gray-400">
                      Items: {itemsSummary(job.parcel?.items)}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
