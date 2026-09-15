"use client";

// Delivery Person App landing (2B-6B-1) — ROLE-AWARE.
//
// A delivery person is one of two workforce roles (server-authoritative, from
// GET /api/delivery/whoami -> person.role, never trusted from the client):
//   RIDER      -> the existing "My jobs" work queue (assignedPersonId legs).
//                 UNCHANGED from before this file became role-aware.
//   HUB_PERSON -> a stationed receiver: their own hub task queue at their one
//                 hub (GET /api/delivery/my-hub-tasks), NOT a rider job queue.
//                 A hub person must never be shown, or funnelled into, the rider
//                 flow just because both are "delivery persons".
//
// Both roles pass the same identity gate (the layout + login require actor role
// === "person"); this page only decides WHICH workflow to present. hubId is
// resolved server-side on every hub action, so nothing here is trusted for authz.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/deliveryApp/scanClient";

type PersonRole = "RIDER" | "HUB_PERSON";

export default function DeliveryAppHomePage() {
  const [role, setRole] = useState<PersonRole | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const resolveRole = useCallback(async () => {
    setRoleError(null);
    try {
      const res = await authedFetch("/api/delivery/whoami");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.role !== "person") {
        setRoleError("Your session has expired. Please sign in again.");
        return;
      }
      setRole(data?.person?.role === "HUB_PERSON" ? "HUB_PERSON" : "RIDER");
    } catch {
      setRoleError("Could not load your account. Please try again.");
    }
  }, []);

  useEffect(() => { void resolveRole(); }, [resolveRole]);

  if (roleError) {
    return (
      <div className="rounded border bg-red-50 p-6 text-center text-red-700">
        <p className="mb-3">{roleError}</p>
        <button onClick={() => void resolveRole()} className="rounded bg-black px-3 py-2 text-sm text-white">Retry</button>
      </div>
    );
  }
  if (role === null) {
    return <div className="rounded border bg-white p-8 text-center text-gray-500">Loading…</div>;
  }
  return role === "HUB_PERSON" ? <HubTasks /> : <RiderJobs />;
}

// ===========================================================================
// RIDER — "My jobs" (unchanged behaviour: GET /api/delivery/my-jobs).
// ===========================================================================
type MyJob = {
  id: string;
  orderNumber?: string;
  vendorName?: string;
  shipmentNumber?: string;
  status: string;
  currentStage?: string;
  custody?: { holderKind?: string | null } | null;
  pickup?: { sellerName?: string; area?: string } | null;
  drop?: { customerName?: string } | null;
};

function StageBadge({ status }: { status: string }) {
  const tone =
    status === "Delivered" ? "bg-green-100 text-green-800"
      : status === "DeliveryFailed" ? "bg-red-100 text-red-800"
      : status === "InProgress" ? "bg-blue-100 text-blue-800"
      : "bg-amber-100 text-amber-800";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function RiderJobs() {
  const [jobs, setJobs] = useState<MyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/delivery/my-jobs");
      const data = await res.json();
      if (res.status === 401 || res.status === 403) { setError("Your session has expired. Please sign in again."); return; }
      if (!res.ok) throw new Error(data?.error || "Could not load your jobs.");
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your jobs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">My jobs</h2>
        <button onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="rounded border bg-white p-8 text-center text-gray-500">Loading your jobs…</div>
      ) : error ? (
        <div className="rounded border bg-red-50 p-6 text-center text-red-700">
          <p className="mb-3">{error}</p>
          <button onClick={() => { setLoading(true); void load(); }} className="rounded bg-black px-3 py-2 text-sm text-white">Retry</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-gray-500">No jobs assigned to you right now.</div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <Link key={j.id} href={`/delivery-app/jobs/${encodeURIComponent(j.id)}`}
              className="block rounded-lg border bg-white p-4 active:bg-gray-50">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-gray-600">{j.shipmentNumber || "—"}</span>
                <StageBadge status={j.status} />
              </div>
              <div className="mt-2 text-sm">
                <p className="font-medium">{j.vendorName || "Seller"}</p>
                <p className="text-gray-500">Order {j.orderNumber || "—"} · {j.currentStage || "—"}</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
                <div><span className="text-gray-400">Pickup</span> {j.pickup?.sellerName || "—"}</div>
                <div><span className="text-gray-400">Deliver to</span> {j.drop?.customerName || "—"}</div>
                <div><span className="text-gray-400">Custody</span> {j.custody?.holderKind || "—"}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// HUB_PERSON — "Hub tasks" (GET /api/delivery/my-hub-tasks).
//
// Two queues, exactly as the server discriminates them:
//   receiveTasks  ORIGIN_RECEIVE / DESTINATION_RECEIVE — confirm physical
//                 receipt of a shipment into THIS hub.
//   releaseTasks  DESTINATION_HANDOVER — release a shipment to the assigned
//                 final-mile rider (only when the server says handoverState
//                 "ready"; otherwise it is awaiting the rider's confirmation).
//
// Every action is a NO-BODY POST to an existing, fully server-authoritative
// endpoint that re-derives the caller's hub/company/person from their verified
// token — the client sends no identity, no hubId, no jobId trust beyond the
// path the server itself surfaced in this queue.
// ===========================================================================
type OriginReceiveTask = {
  type: "ORIGIN_RECEIVE";
  jobId: string; orderNumber?: string; vendorName?: string; shipmentNumber?: string;
  sellerName: string; fromPersonName: string;
};
type DestinationReceiveTask = {
  type: "DESTINATION_RECEIVE";
  jobId: string; orderNumber?: string; vendorName?: string; shipmentNumber?: string;
  sellerName: string;
};
type ReceiveTask = OriginReceiveTask | DestinationReceiveTask;
type ReleaseTask = {
  type: "DESTINATION_HANDOVER";
  handoverState: "ready" | "awaiting_rider_confirmation";
  jobId: string; orderNumber?: string; vendorName?: string; shipmentNumber?: string;
  toPersonName: string;
};

function HubTasks() {
  const [receiveTasks, setReceiveTasks] = useState<ReceiveTask[]>([]);
  const [releaseTasks, setReleaseTasks] = useState<ReleaseTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/delivery/my-hub-tasks");
      const data = await res.json();
      if (res.status === 401 || res.status === 403) { setError("Your session has expired. Please sign in again."); return; }
      if (!res.ok) throw new Error(data?.error || "Could not load your hub tasks.");
      setReceiveTasks(Array.isArray(data.receiveTasks) ? data.receiveTasks : []);
      setReleaseTasks(Array.isArray(data.releaseTasks) ? data.releaseTasks : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your hub tasks.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // NO-BODY POST to a server-authoritative endpoint. The path is one the server
  // itself returned in this queue; the server still re-verifies the caller is
  // this exact hub person at this exact hub before acting.
  const act = useCallback(async (key: string, path: string, okMsg: string) => {
    if (busy) return;
    setBusy(key);
    setFeedback(null);
    try {
      const res = await authedFetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: "error", msg: (data?.error as string) || "Could not complete this task." });
      } else {
        setFeedback({ type: "success", msg: okMsg });
        await load(); // authoritative re-read — never fabricate the next state
      }
    } catch {
      setFeedback({ type: "error", msg: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }, [busy, load]);

  const confirmReceipt = (t: ReceiveTask) => {
    const path = t.type === "ORIGIN_RECEIVE"
      ? `/api/delivery/company/jobs/${encodeURIComponent(t.jobId)}/hub-intake/confirm`
      : `/api/delivery/company/jobs/${encodeURIComponent(t.jobId)}/destination-receipt`;
    void act(`recv-${t.jobId}`, path, "Receipt confirmed.");
  };
  const completeHandover = (t: ReleaseTask) =>
    void act(`rel-${t.jobId}`, `/api/delivery/company/jobs/${encodeURIComponent(t.jobId)}/destination-handover`, "Handover started — waiting for the rider to confirm.");

  const nothing = !loading && receiveTasks.length === 0 && releaseTasks.length === 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hub tasks</h2>
        <button onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {feedback && (
        <div className={`mb-3 rounded px-3 py-2 text-sm ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{feedback.msg}</div>
      )}

      {loading ? (
        <div className="rounded border bg-white p-8 text-center text-gray-500">Loading your hub tasks…</div>
      ) : error ? (
        <div className="rounded border bg-red-50 p-6 text-center text-red-700">
          <p className="mb-3">{error}</p>
          <button onClick={() => { setLoading(true); void load(); }} className="rounded bg-black px-3 py-2 text-sm text-white">Retry</button>
        </div>
      ) : nothing ? (
        <div className="rounded border bg-white p-8 text-center text-gray-500">No hub tasks right now.</div>
      ) : (
        <div className="space-y-5">
          {receiveTasks.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">To receive</p>
              <div className="space-y-3">
                {receiveTasks.map((t) => (
                  <div key={`recv-${t.jobId}`} className="rounded-lg border bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-gray-600">{t.shipmentNumber || "—"}</span>
                      <span className="rounded bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                        {t.type === "ORIGIN_RECEIVE" ? "From rider" : "From transit"}
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      <p className="font-medium">{t.vendorName || "Seller"}</p>
                      <p className="text-gray-500">Order {t.orderNumber || "—"} · {t.sellerName || "—"}</p>
                      {t.type === "ORIGIN_RECEIVE" && t.fromPersonName ? (
                        <p className="text-gray-500">Handed over by {t.fromPersonName}</p>
                      ) : null}
                    </div>
                    <button onClick={() => confirmReceipt(t)} disabled={busy === `recv-${t.jobId}` || !!busy}
                      className="mt-3 w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                      {busy === `recv-${t.jobId}` ? "Confirming…" : "Confirm receipt"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {releaseTasks.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">To hand over</p>
              <div className="space-y-3">
                {releaseTasks.map((t) => {
                  const ready = t.handoverState === "ready";
                  return (
                    <div key={`rel-${t.jobId}`} className="rounded-lg border bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-gray-600">{t.shipmentNumber || "—"}</span>
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">To rider</span>
                      </div>
                      <div className="mt-2 text-sm">
                        <p className="font-medium">{t.vendorName || "Seller"}</p>
                        <p className="text-gray-500">Order {t.orderNumber || "—"} · Rider {t.toPersonName || "—"}</p>
                      </div>
                      {ready ? (
                        <button onClick={() => completeHandover(t)} disabled={busy === `rel-${t.jobId}` || !!busy}
                          className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                          {busy === `rel-${t.jobId}` ? "Starting…" : `Hand to ${t.toPersonName || "rider"}`}
                        </button>
                      ) : (
                        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Waiting for {t.toPersonName || "the rider"} to confirm pickup.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
