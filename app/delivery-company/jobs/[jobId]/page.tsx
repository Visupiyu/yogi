"use client";

// Delivery Company — job detail (GET /api/delivery/jobs/[jobId]). The endpoint
// authorizes the company against job.companyId and returns an allow-listed view
// with NO secrets (no scanToken / OTP / hashes). Actionable handoffs expose the
// shared Assign / Reassign / Reject panel; executed jobs are read-only.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import JobActions from "@/app/delivery-company/_components/JobActions";
import {
  authedFetch,
  StatusBadge,
  Spinner,
  ErrorBox,
  stageLabel,
  itemsSummary,
  COMPANY_ACTIONABLE_STATUSES,
  type CompanyJobDetail,
  type CompanyPerson,
} from "@/app/delivery-company/_lib/console";

export default function DeliveryCompanyJobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = typeof params?.jobId === "string" ? params.jobId : Array.isArray(params?.jobId) ? params.jobId[0] : "";

  const [job, setJob] = useState<CompanyJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [persons, setPersons] = useState<CompanyPerson[] | null>(null);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [personsError, setPersonsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/jobs/${encodeURIComponent(jobId)}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error("You are not authorized to view this job.");
      if (res.status === 404) throw new Error("This delivery job was not found.");
      if (!res.ok || !data?.job) throw new Error(data?.error || "Could not load this job.");
      setJob(data.job as CompanyJobDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this job.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

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

  useEffect(() => { void load(); }, [load]);

  // Lazily load people once the job is known to be actionable.
  useEffect(() => {
    if (job && COMPANY_ACTIONABLE_STATUSES.has(job.status) && persons === null && !personsLoading) {
      void loadPersons();
    }
  }, [job, persons, personsLoading, loadPersons]);

  const afterAction = useCallback(async () => {
    await Promise.all([load(), loadPersons()]);
  }, [load, loadPersons]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/delivery-company/jobs" className="text-sm text-teal-700 hover:underline">← Back to Jobs</Link>
        {job ? (
          <button
            onClick={() => { setLoading(true); void load(); }}
            disabled={loading}
            className="rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
      </div>

      {loading ? (
        <Spinner label="Loading job…" />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => { setLoading(true); void load(); }} />
      ) : !job ? null : (
        <>
          {/* Header */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm text-gray-800">{job.shipmentNumber || "—"}</span>
              <StatusBadge status={job.status} />
            </div>
            <p className="mt-1 text-lg font-semibold text-gray-900">{job.vendorName || "Seller"}</p>
            <p className="text-sm text-gray-500">Stage: {stageLabel(job.currentStage)}</p>
          </div>

          {/* Shipment / job info */}
          <Card title="Shipment">
            <Row k="Shipment number" v={job.shipmentNumber} mono />
            <Row k="Order number" v={job.orderNumber} />
            <Row k="Provider" v={`${job.providerType || "—"}${job.assignedCompanyName ? ` · ${job.assignedCompanyName}` : ""}`} />
            <Row k="Status" v={job.status} />
            <Row k="Stage" v={stageLabel(job.currentStage)} />
            <Row k="Items" v={itemsSummary(job.parcel?.items)} />
          </Card>

          {/* Assigned person */}
          <Card title="Assigned delivery person">
            {job.assignedPersonId ? (
              <>
                <Row k="Name" v={job.assignedPersonName} />
                <Row k="Phone" v={job.assignedPersonPhone} />
              </>
            ) : (
              <p className="text-sm text-gray-500">No delivery person assigned yet.</p>
            )}
          </Card>

          {/* Destination */}
          <Card title="Destination">
            <Row k="Customer" v={job.drop?.customerName} />
            <Row k="Phone" v={job.drop?.phone} />
            <Row k="Address" v={job.drop?.address} />
            <Row k="Delivery slot" v={job.drop?.slot} />
          </Card>

          {/* Actions (only when the backend still accepts them) */}
          {COMPANY_ACTIONABLE_STATUSES.has(job.status) ? (
            <Card title={job.status === "OfferedToCompany" ? "Respond to this handoff" : "Manage assignment"}>
              {job.status === "OfferedToCompany" ? (
                <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  This shipment is awaiting your action. Assign one of your delivery people, or reject the handoff.
                </p>
              ) : (
                <p className="mb-3 text-xs text-gray-500">
                  You can reassign or reject until the parcel is picked up. After pickup, changes are handled in the field.
                </p>
              )}
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
            </Card>
          ) : (
            <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-gray-500">
              This job is past the assignment stage. Live progress is driven by the delivery person in the Delivery App.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-gray-400">{k}</dt>
      <dd className={`text-right text-gray-800 ${mono ? "font-mono text-xs" : ""}`}>{v || "—"}</dd>
    </div>
  );
}
