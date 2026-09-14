"use client";

// Delivery Company dashboard — a concise operational overview built from the
// existing GET /api/delivery/company/jobs response (company-scoped server-side).
// It shows only real, API-provided figures — no invented statistics. Full job
// actions live on the Jobs page and the job-detail page.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  authedFetch,
  useCompany,
  StatusBadge,
  Spinner,
  ErrorBox,
  EmptyBox,
  stageLabel,
  fmtTs,
  tsMillis,
  AWAITING_STATUSES,
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
  type CompanyJob,
} from "@/app/delivery-company/_lib/console";

function byUpdatedDesc(a: CompanyJob, b: CompanyJob): number {
  return tsMillis(b.updatedAt) - tsMillis(a.updatedAt);
}

export default function DeliveryCompanyDashboard() {
  const company = useCompany();
  const [jobs, setJobs] = useState<CompanyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => { void load(); }, [load]);

  const { awaiting, active, completed } = useMemo(() => {
    const awaiting = jobs.filter((j) => AWAITING_STATUSES.has(j.status)).sort(byUpdatedDesc);
    const active = jobs.filter((j) => ACTIVE_STATUSES.has(j.status)).sort(byUpdatedDesc);
    const completed = jobs.filter((j) => COMPLETED_STATUSES.has(j.status)).sort(byUpdatedDesc);
    return { awaiting, active, completed };
  }, [jobs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{company.companyName}</h1>
          <p className="text-sm text-gray-500">Delivery operations overview</p>
        </div>
        <button
          onClick={() => { setLoading(true); void load(); }}
          disabled={loading}
          className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <Spinner label="Loading your delivery jobs…" />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => { setLoading(true); void load(); }} />
      ) : (
        <>
          {/* Summary — real counts only */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard label="Awaiting action" value={awaiting.length} tone="text-amber-700" bg="bg-amber-50" />
            <SummaryCard label="Active" value={active.length} tone="text-blue-700" bg="bg-blue-50" />
            <SummaryCard label="Completed" value={completed.length} tone="text-green-700" bg="bg-green-50" />
            <SummaryCard label="Total jobs" value={jobs.length} tone="text-gray-700" bg="bg-gray-50" />
          </div>

          {/* Awaiting company action */}
          <Section
            title="Awaiting your action"
            hint={awaiting.length ? "Assign one of your people or reject the handoff." : undefined}
            action={<Link href="/delivery-company/jobs" className="text-sm font-medium text-teal-700 hover:underline">Go to Jobs →</Link>}
          >
            {awaiting.length === 0 ? (
              <EmptyBox title="Nothing awaiting action" subtitle="New handoffs from YOMICO will appear here." />
            ) : (
              <div className="space-y-2">
                {awaiting.map((j) => <JobRow key={j.id} job={j} cta="Assign / Reject" />)}
              </div>
            )}
          </Section>

          {/* Active */}
          <Section
            title="Active jobs"
            action={<Link href="/delivery-company/jobs" className="text-sm font-medium text-teal-700 hover:underline">View all →</Link>}
          >
            {active.length === 0 ? (
              <EmptyBox title="No active jobs" subtitle="Jobs you've assigned to your people will appear here." />
            ) : (
              <div className="space-y-2">
                {active.slice(0, 6).map((j) => <JobRow key={j.id} job={j} cta="Open" />)}
              </div>
            )}
          </Section>

          {/* Recently completed */}
          {completed.length > 0 ? (
            <Section title="Recently completed">
              <div className="space-y-2">
                {completed.slice(0, 5).map((j) => <JobRow key={j.id} job={j} cta="Open" />)}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, bg }: { label: string; value: number; tone: string; bg: string }) {
  return (
    <div className={`rounded-xl border ${bg} p-4`}>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs font-medium text-gray-500">{label}</p>
    </div>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
          {hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function JobRow({ job, cta }: { job: CompanyJob; cta: string }) {
  const itemCount = Array.isArray(job.parcel?.items) ? job.parcel!.items!.length : 0;
  return (
    <Link
      href={`/delivery-company/jobs/${encodeURIComponent(job.id)}`}
      className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3 hover:bg-gray-50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-700">{job.shipmentNumber || "—"}</span>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-600">
          {job.vendorName || "Seller"}
          {itemCount ? ` · ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""}
          {" · "}{stageLabel(job.currentStage)}
        </p>
        <p className="text-[11px] text-gray-400">
          {job.assignedPersonName ? `Assigned: ${job.assignedPersonName}` : "Unassigned"} · Updated {fmtTs(job.updatedAt)}
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium text-teal-700">{cta} →</span>
    </Link>
  );
}
