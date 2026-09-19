"use client";

// Delivery Company — job detail (GET /api/delivery/jobs/[jobId]). The endpoint
// authorizes the company against job.companyId and returns an allow-listed view
// with NO secrets (no scanToken / OTP / hashes). Actionable handoffs expose the
// shared Assign / Reassign / Reject panel; executed jobs are read-only.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import JobActions from "@/app/delivery-company/_components/JobActions";
import JobLifecycle from "@/app/delivery-company/_components/JobLifecycle";
import FinalMileAssign from "@/app/delivery-company/_components/FinalMileAssign";
import CompanyHubActions from "@/app/delivery-company/_components/CompanyHubActions";
import HubSelect from "@/app/delivery-company/_components/HubSelect";
import DeliveryRoute from "@/app/delivery-company/_components/DeliveryRoute";
import DeliveryPeople from "@/app/delivery-company/_components/DeliveryPeople";
import HubPersonSelect from "@/app/delivery-company/_components/HubPersonSelect";
import {
  authedFetch,
  StatusBadge,
  Spinner,
  ErrorBox,
  stageLabel,
  itemsSummary,
  companyLifecycle,
  pickupAddressLine,
  COMPANY_ACTIONABLE_STATUSES,
  riderResponseSublabel,
  type CompanyJobDetail,
  type CompanyPerson,
} from "@/app/delivery-company/_lib/console";

// The persisted stage at which the company dispatcher assigns the final-mile
// rider (server re-validates this precondition; the UI only gates visibility).
const FINAL_MILE_STAGE = "AtDestinationHub";
// The persisted stage once a final-mile rider IS already selected. Whether a
// dispatcher may still CORRECT that selection is NOT decided here — it is
// read from the backend's own job.task.finalMileHandoverState ("ready" means
// the destination-hub handover has not started yet); the server re-validates
// this precondition independently and remains authoritative.
const FINAL_MILE_ASSIGNED_STAGE = "FinalMileAssigned";

// Stages at/after which a hub is fixed — the Job Card then shows it read-only.
// Origin locks once received at a hub; destination locks once transit departs.
const ORIGIN_HUB_LOCKED_STAGES = new Set([
  "AtOriginHub", "InTransit", "AtDestinationHub", "FinalMileAssigned", "OutForDelivery", "Delivered",
]);
const DESTINATION_HUB_LOCKED_STAGES = new Set([
  "InTransit", "AtDestinationHub", "FinalMileAssigned", "OutForDelivery", "Delivered",
]);
// A destination hub PERSON may be assigned right up until the shipment is
// physically received at the destination hub (unlike the destination HUB, which
// locks at dispatch). ORIGIN_HUB_LOCKED_STAGES already covers the origin person.
const DESTINATION_HUB_PERSON_LOCKED_STAGES = new Set([
  "AtDestinationHub", "FinalMileAssigned", "OutForDelivery", "Delivered",
]);

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

  // Lazily load people once the job is actionable (assign/reject), the shipment
  // is at the destination hub awaiting a company-selected final-mile rider, OR
  // a final-mile rider IS selected but the handover hasn't started yet (so a
  // reassignment correction is still possible).
  const canReassignFinalMile =
    !!job &&
    job.currentStage === FINAL_MILE_ASSIGNED_STAGE &&
    job.task?.finalMileHandoverState === "ready";
  useEffect(() => {
    const needsPeople =
      !!job &&
      (COMPANY_ACTIONABLE_STATUSES.has(job.status) || job.currentStage === FINAL_MILE_STAGE || canReassignFinalMile);
    if (needsPeople && persons === null && !personsLoading) {
      void loadPersons();
    }
  }, [job, persons, personsLoading, loadPersons, canReassignFinalMile]);

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
            {riderResponseSublabel(job.status, job.pickupLegStatus) ? (
              <p className="mt-1 text-xs font-medium text-sky-700">{riderResponseSublabel(job.status, job.pickupLegStatus)}</p>
            ) : null}
            <p className="mt-1 text-lg font-semibold text-gray-900">{job.vendorName || "Seller"}</p>
            <p className="text-sm text-gray-500">Stage: {stageLabel(job.currentStage)}</p>
          </div>

          {/* Company Job lifecycle — ONE shipment, Seller → Customer (visibility only) */}
          <Card title="Company Job · Seller → Customer">
            <p className="mb-3 text-xs text-gray-500">
              This is one shipment your company delivers end to end. Each step below is a physical responsibility;
              the rider steps are performed by your people in the Delivery App.
            </p>
            <JobLifecycle steps={companyLifecycle(job.currentStage, job.status)} />
          </Card>

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

          {/* Pickup / Seller */}
          <Card title="Pickup / Seller">
            <Row k="Seller" v={job.pickup?.sellerName} />
            <Row k="Address" v={pickupAddressLine(job.pickup)} />
          </Card>

          {/* DELIVERY ROUTE (COMPANY jobs): the full physical route for this
              shipment, always visible regardless of the current FSM stage and
              loaded from the server projection (survives refresh). */}
          {job.providerType === "COMPANY" ? (
            <Card title="Delivery route">
              <p className="mb-3 text-xs text-gray-500">
                The full physical route for this shipment — seller pickup to customer delivery.
              </p>
              <DeliveryRoute
                pickup={job.pickup ?? null}
                originHub={job.originHub ?? null}
                destinationHub={job.destinationHub ?? null}
                drop={job.drop ?? null}
              />
            </Card>
          ) : null}

          {/* DELIVERY PEOPLE (COMPANY jobs): the four distinct operational actors
              for this shipment, from the server projection (survives refresh). */}
          {job.providerType === "COMPANY" ? (
            <Card title="Delivery people">
              <p className="mb-3 text-xs text-gray-500">
                Four separate operational assignments — first-mile rider, origin hub person,
                destination hub person, and final-mile rider.
              </p>
              <DeliveryPeople
                rider1={job.deliveryActors?.rider1 ?? null}
                originHubPerson={job.deliveryActors?.originHubPerson ?? null}
                destinationHubPerson={job.deliveryActors?.destinationHubPerson ?? null}
                rider2={job.deliveryActors?.rider2 ?? null}
              />
            </Card>
          ) : null}

          {/* Hub selection (COMPANY jobs): choose BOTH origin and destination
              hubs up front. Only active hubs are selectable; each shows its
              stored address read-only beneath. Locked once past its stage. */}
          {job.providerType === "COMPANY" ? (
            <Card title="Hub selection">
              <p className="mb-3 text-xs text-gray-500">
                Choose which of your hubs this shipment routes through. Only active hubs can be selected.
              </p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3 rounded-lg border p-3">
                  <HubSelect
                    jobId={job.id}
                    kind="origin"
                    currentHubId={job.originHubId}
                    excludeHubId={job.destinationHubId}
                    editable={!ORIGIN_HUB_LOCKED_STAGES.has(job.currentStage || "")}
                    onDone={() => void afterAction()}
                  />
                  <HubPersonSelect
                    jobId={job.id}
                    which="origin"
                    hubId={job.originHubId}
                    currentPersonId={job.originHubPersonId}
                    currentPersonName={job.deliveryActors?.originHubPerson?.name}
                    editable={!ORIGIN_HUB_LOCKED_STAGES.has(job.currentStage || "")}
                    onDone={() => void afterAction()}
                  />
                </div>
                <div className="space-y-3 rounded-lg border p-3">
                  <HubSelect
                    jobId={job.id}
                    kind="destination"
                    currentHubId={job.destinationHubId}
                    excludeHubId={job.originHubId}
                    editable={!DESTINATION_HUB_LOCKED_STAGES.has(job.currentStage || "")}
                    onDone={() => void afterAction()}
                  />
                  <HubPersonSelect
                    jobId={job.id}
                    which="destination"
                    hubId={job.destinationHubId}
                    currentPersonId={job.destinationHubPersonId}
                    currentPersonName={job.deliveryActors?.destinationHubPerson?.name}
                    editable={!DESTINATION_HUB_PERSON_LOCKED_STAGES.has(job.currentStage || "")}
                    onDone={() => void afterAction()}
                  />
                </div>
              </div>
            </Card>
          ) : null}

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
                  This shipment is awaiting your response. Accept the handoff to take it on, or reject it.
                </p>
              ) : job.status === "AcceptedByCompany" ? (
                <p className="mb-3 rounded bg-sky-50 px-3 py-2 text-sm text-sky-800">
                  You&apos;ve accepted this handoff. Assign one of your delivery people to carry it out.
                </p>
              ) : (
                <p className="mb-3 text-xs text-gray-500">
                  You can reassign until the parcel is picked up. After pickup, changes are handled in the field.
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
          ) : job.currentStage === "AtOriginHub" ? (
            <Card title="Company transit">
              <CompanyHubActions jobId={job.id} currentStage={job.currentStage} currentDestinationHubId={job.destinationHubId} onDone={() => void afterAction()} />
            </Card>
          ) : job.currentStage === "InTransit" ? (
            <Card title="Destination hub">
              <CompanyHubActions jobId={job.id} currentStage={job.currentStage} onDone={() => void afterAction()} />
            </Card>
          ) : job.currentStage === FINAL_MILE_STAGE ? (
            <Card title="Assign final-mile rider">
              <p className="mb-3 rounded bg-teal-50 px-3 py-2 text-sm text-teal-800">
                This shipment is at the destination hub. Choose one of your active, available people to carry out the
                final delivery to the customer. Assigning does not deliver the parcel — the rider goes Out for delivery
                and confirms delivery in the Delivery App.
              </p>
              <FinalMileAssign
                jobId={job.id}
                persons={persons}
                personsLoading={personsLoading}
                personsError={personsError}
                onReloadPersons={() => void loadPersons()}
                onDone={() => void afterAction()}
              />
            </Card>
          ) : canReassignFinalMile ? (
            <Card title="Reassign final-mile rider">
              <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {job.assignedPersonName || "The current rider"} is assigned but has not yet received this shipment
                from the destination hub — you can still choose a different rider. This does not move custody or
                change who is currently responsible for the parcel; it only corrects the selection before hand-off.
              </p>
              <FinalMileAssign
                jobId={job.id}
                mode="reassign"
                currentPersonId={job.assignedPersonId}
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
