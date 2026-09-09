"use client";

// Company-managed lifecycle controls for the ONE Company Job:
//   • AtOriginHub → dispatch into COMPANY transit  (POST .../transit-depart)
//   • InTransit   → receive at a destination hub    (POST .../destination-receipt { hubId })
//
// These are DISPATCH / company-management actions (role "company"), NOT physical
// rider scans. Company transit is the company's own bulk/inter-city transport, so
// it is deliberately never framed as a YOMICO rider delivery task and no rider is
// assigned to it. The server re-validates ownership, stage/custody preconditions
// and the destination hub, and remains authoritative; after a successful action
// we re-fetch authoritative state (never assume it).
import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/app/delivery-company/_lib/console";

type CompanyHub = { id: string; name?: string; city?: string; region?: string; status?: string };

export default function CompanyHubActions({
  jobId,
  currentStage,
  onDone,
}: {
  jobId: string;
  currentStage?: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Destination-hub picker state (only used at InTransit).
  const [hubs, setHubs] = useState<CompanyHub[] | null>(null);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [hubsError, setHubsError] = useState<string | null>(null);
  const [selectedHub, setSelectedHub] = useState("");

  const isOriginHub = currentStage === "AtOriginHub";
  const isInTransit = currentStage === "InTransit";

  const loadHubs = useCallback(async () => {
    setHubsLoading(true);
    setHubsError(null);
    try {
      const res = await authedFetch("/api/delivery/company/hubs");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load your hubs.");
      setHubs(Array.isArray(data.hubs) ? data.hubs : []);
    } catch (e) {
      setHubsError(e instanceof Error ? e.message : "Could not load your hubs.");
    } finally {
      setHubsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isInTransit && hubs === null && !hubsLoading) void loadHubs();
  }, [isInTransit, hubs, hubsLoading, loadHubs]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(path, { method: "POST", body: body ? JSON.stringify(body) : JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "This action could not be completed.");
      setConfirming(false);
      onDone(); // re-fetch authoritative state
    } catch (e) {
      setError(e instanceof Error ? e.message : "This action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  if (isOriginHub) {
    return (
      <div className="space-y-3">
        <p className="rounded bg-teal-50 px-3 py-2 text-sm text-teal-800">
          This shipment is at your origin / local hub. Dispatch it into your company&apos;s own transport to move it
          toward the destination hub. This is company-managed transport — no rider is assigned to it.
        </p>
        {confirming ? (
          <div className="rounded border border-teal-200 bg-teal-50 p-3">
            <p className="text-sm text-teal-900">Dispatch this shipment into company transit?</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void post(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/transit-depart`)}
                disabled={busy}
                className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Dispatching…" : "Confirm dispatch"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setConfirming(true); setError(null); }}
            disabled={busy}
            className="rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Dispatch to company transit
          </button>
        )}
        {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  if (isInTransit) {
    const activeHubs = (hubs ?? []).filter((h) => (h.status ?? "Active") === "Active");
    const selected = (hubs ?? []).find((h) => h.id === selectedHub) || null;
    return (
      <div className="space-y-3">
        <p className="rounded bg-teal-50 px-3 py-2 text-sm text-teal-800">
          This shipment is in your company&apos;s transport. When it arrives, receive it at the destination hub. Only
          after that can you assign a final-mile rider.
        </p>
        <label htmlFor={`desthub-${jobId}`} className="block text-xs font-medium text-gray-600">
          Destination hub
        </label>
        {hubsLoading ? (
          <p className="mt-1 text-sm text-gray-500">Loading your hubs…</p>
        ) : hubsError ? (
          <div className="mt-1 text-sm text-red-700">
            {hubsError}{" "}
            <button onClick={() => void loadHubs()} className="underline">Retry</button>
          </div>
        ) : (
          <>
            <select
              id={`desthub-${jobId}`}
              className="mt-1 w-full rounded border px-2 py-2 text-sm disabled:opacity-50"
              value={selectedHub}
              disabled={busy}
              onChange={(e) => { setSelectedHub(e.target.value); setConfirming(false); setError(null); }}
            >
              <option value="">
                {activeHubs.length ? "Select a destination hub…" : "No active hubs configured"}
              </option>
              {(hubs ?? []).map((h) => {
                const active = (h.status ?? "Active") === "Active";
                const place = [h.city, h.region].filter(Boolean).join(", ");
                return (
                  <option key={h.id} value={h.id} disabled={!active}>
                    {h.name || h.id}{place ? ` — ${place}` : ""}{active ? "" : " (inactive)"}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">
              The destination hub must be one of your active hubs and different from the origin hub. Receiving does not
              deliver the parcel — you then assign a final-mile rider who delivers it in the Delivery App.
            </p>

            {confirming && selected ? (
              <div className="mt-2 rounded border border-teal-200 bg-teal-50 p-3">
                <p className="text-sm text-teal-900">
                  Receive this shipment at <span className="font-semibold">{selected.name || selected.id}</span>?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void post(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/destination-receipt`, { hubId: selectedHub })}
                    disabled={busy}
                    className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Receiving…" : "Confirm receipt"}
                  </button>
                  <button onClick={() => setConfirming(false)} disabled={busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { if (selectedHub) setConfirming(true); }}
                disabled={!selectedHub || busy}
                className="mt-2 rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Receive at destination hub
              </button>
            )}
          </>
        )}
        {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  return null;
}
