"use client";

// My Jobs — the delivery person's work queue (2B-6B-1).
// Renders ONLY the backend allow-listed data from GET /api/delivery/my-jobs
// (scoped to the authenticated person; never scanToken/OTP/raw events).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/deliveryApp/scanClient";

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

export default function MyJobsPage() {
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
