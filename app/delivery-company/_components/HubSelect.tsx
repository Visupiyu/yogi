"use client";

// Job Card — hub selector (origin OR destination). The company operator chooses
// WHICH of its hubs this specific job uses. The dropdown shows the hub NAME
// only; the stored address is shown read-only BELOW the dropdown (the operator
// never types an address). The choice is saved as job.originHubId /
// job.destinationHubId via the per-job selection routes and consumed by the
// Delivery Engine (origin-hub handoff, line-haul, destination handoff,
// navigation). Only Active hubs are selectable; multiple active hubs are
// supported (this picks one per job, never demoting others). Reuses the shared
// deliveryHubs list (GET /api/delivery/company/hubs).
import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/app/delivery-company/_lib/console";

type CompanyHub = { id: string; name?: string; city?: string; region?: string; address?: string; pincode?: string; status?: string };

const COPY = {
  origin: {
    label: "Origin hub",
    help: "The hub your first-mile rider hands this shipment to (near the seller). Your rider hands over in the Delivery App; a Hub Person there confirms receipt.",
    set: "Set origin hub",
    update: "Update origin hub",
  },
  destination: {
    label: "Destination hub",
    help: "The hub near the customer that this shipment is routed to. A Destination Hub Person confirms physical receipt there in the Delivery App.",
    set: "Set destination hub",
    update: "Update destination hub",
  },
} as const;

export default function HubSelect({
  jobId,
  kind,
  currentHubId,
  excludeHubId,
  editable,
  onDone,
}: {
  jobId: string;
  kind: "origin" | "destination";
  currentHubId?: string | null;
  excludeHubId?: string | null; // the OTHER hub (origin/destination can't be the same)
  editable: boolean;
  onDone: () => void;
}) {
  const copy = COPY[kind];
  const [hubs, setHubs] = useState<CompanyHub[] | null>(null);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [hubsError, setHubsError] = useState<string | null>(null);
  const [selectedHub, setSelectedHub] = useState<string>(currentHubId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { void loadHubs(); }, [loadHubs]);
  useEffect(() => { setSelectedHub(currentHubId || ""); }, [currentHubId]);

  const all = hubs ?? [];
  const selected = all.find((h) => h.id === selectedHub) || null;
  const current = all.find((h) => h.id === currentHubId) || null;
  const activeHubs = all.filter((h) => (h.status ?? "Active") === "Active" && h.id !== excludeHubId);

  const save = async () => {
    if (!selectedHub || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/${kind}-hub`, {
        method: "POST",
        body: JSON.stringify({ hubId: selectedHub }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not set the ${kind} hub.`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not set the ${kind} hub.`);
    } finally {
      setBusy(false);
    }
  };

  const addressBlock = (h: CompanyHub | null) => {
    if (!h) return null;
    const locality = [h.city, h.region, h.pincode].filter((p) => p && String(p).trim()).join(", ");
    return (
      <div className="rounded border bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <span className="font-medium text-gray-700">{h.name || h.id}</span>
        {h.address ? <div className="mt-0.5">{h.address}</div> : <div className="mt-0.5 text-gray-400">No address on file for this hub.</div>}
        {locality ? <div className="text-gray-500">{locality}</div> : null}
      </div>
    );
  };

  // Read-only once locked (in the physical hub workflow / beyond).
  if (!editable) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">{copy.label}</p>
        {current ? addressBlock(current) : (
          <p className="text-sm text-gray-500">{currentHubId ? `${copy.label} set.` : `${copy.label} not selected.`}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${kind}hub-${jobId}`} className="block text-xs font-medium text-gray-600">{copy.label}</label>
      {hubsLoading ? (
        <p className="text-sm text-gray-500">Loading your hubs…</p>
      ) : hubsError ? (
        <div className="text-sm text-red-700">{hubsError}{" "}<button onClick={() => void loadHubs()} className="underline">Retry</button></div>
      ) : (
        <>
          <select
            id={`${kind}hub-${jobId}`}
            className="w-full rounded border px-2 py-2 text-sm disabled:opacity-50"
            value={selectedHub}
            disabled={busy}
            onChange={(e) => { setSelectedHub(e.target.value); setError(null); }}
          >
            <option value="">{activeHubs.length ? `Select a ${kind} hub…` : "No active hubs configured"}</option>
            {all.map((h) => {
              const active = (h.status ?? "Active") === "Active";
              const excluded = h.id === excludeHubId;
              const place = [h.city, h.region].filter(Boolean).join(", ");
              return (
                <option key={h.id} value={h.id} disabled={!active || excluded}>
                  {h.name || h.id}{place ? ` — ${place}` : ""}{!active ? " (inactive)" : excluded ? " (already the other hub)" : ""}
                </option>
              );
            })}
          </select>

          {/* Stored address for the selected hub — read-only, never typed. */}
          {selected ? addressBlock(selected) : null}

          <button
            onClick={() => void save()}
            disabled={!selectedHub || busy || selectedHub === (currentHubId || "")}
            className="rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : currentHubId ? copy.update : copy.set}
          </button>
          <p className="text-[11px] text-gray-400">{copy.help}</p>
        </>
      )}
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
