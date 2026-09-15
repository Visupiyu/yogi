"use client";

// Job Card — hub-person selector (origin OR destination). After the hub is
// selected, this offers ONLY that hub's eligible hub persons for a NEW
// assignment, fetched from the server-authoritative candidates endpoint
// (companyId + hubId + role HUB_PERSON + availability Available) — the complete
// set, filtered by the actual hubId (never city/state/name), server-side. The
// operator's choice is saved on the job (originHubPersonId /
// destinationHubPersonId). An already-assigned person keeps showing even if they
// later go Offline (resolved by id via the job projection); Offline only blocks
// a NEW assignment. The assigned hub person still authenticates + confirms
// receipt in the Delivery App — this only records the assignment.
import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/app/delivery-company/_lib/console";

type Candidate = { personId: string; name?: string; phone?: string; hubId?: string | null };

const LABEL = { origin: "Origin hub person", destination: "Destination hub person" } as const;

export default function HubPersonSelect({
  jobId,
  which,
  hubId,
  currentPersonId,
  currentPersonName,
  editable,
  onDone,
}: {
  jobId: string;
  which: "origin" | "destination";
  hubId?: string | null;
  currentPersonId?: string | null;
  currentPersonName?: string | null;
  editable: boolean;
  onDone: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(currentPersonId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hubId) { setCandidates(null); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/hub-persons?hubId=${encodeURIComponent(hubId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load hub people.");
      setCandidates(Array.isArray(data.persons) ? data.persons : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load hub people.");
    } finally {
      setLoading(false);
    }
  }, [hubId]);

  useEffect(() => { if (editable) void load(); }, [editable, load]);
  useEffect(() => { setSelected(currentPersonId || ""); }, [currentPersonId]);

  const save = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/hub-person`, {
        method: "POST",
        body: JSON.stringify({ which, personId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not assign the hub person.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign the hub person.");
    } finally {
      setBusy(false);
    }
  };

  // Read-only once received (or when the hub-person slot is otherwise locked).
  if (!editable) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-600">{LABEL[which]}</p>
        <p className="text-sm text-gray-700">{currentPersonName || (currentPersonId ? "Assigned" : "—")}</p>
      </div>
    );
  }

  if (!hubId) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-600">{LABEL[which]}</p>
        <p className="text-sm text-gray-400">Select the {which} hub first.</p>
      </div>
    );
  }

  // The current assignee may be Offline and therefore absent from the Available
  // candidate set — show them as the current selection regardless, so an
  // existing assignment is never hidden.
  const list = candidates ?? [];
  const currentMissing = !!currentPersonId && !list.some((c) => c.personId === currentPersonId);

  return (
    <div className="space-y-2">
      <label htmlFor={`${which}hubperson-${jobId}`} className="block text-xs font-medium text-gray-600">{LABEL[which]}</label>
      {loading ? (
        <p className="text-sm text-gray-500">Loading hub people…</p>
      ) : loadError ? (
        <div className="text-sm text-red-700">{loadError}{" "}<button onClick={() => void load()} className="underline">Retry</button></div>
      ) : (
        <>
          <select
            id={`${which}hubperson-${jobId}`}
            className="w-full rounded border px-2 py-2 text-sm disabled:opacity-50"
            value={selected}
            disabled={busy}
            onChange={(e) => { setSelected(e.target.value); setError(null); }}
          >
            <option value="">{list.length ? "Select a hub person…" : "No hub people stationed at this hub"}</option>
            {currentMissing ? (
              <option value={currentPersonId as string}>
                {currentPersonName || "Currently assigned"} (currently assigned)
              </option>
            ) : null}
            {list.map((c) => (
              <option key={c.personId} value={c.personId}>
                {c.name || c.personId}{c.phone ? ` — ${c.phone}` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => void save()}
            disabled={!selected || busy || selected === (currentPersonId || "")}
            className="rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : currentPersonId ? "Update hub person" : "Assign hub person"}
          </button>
          <p className="text-[11px] text-gray-400">
            Hub people stationed at this exact hub are offered — the same person can receive many shipments. The
            assigned person confirms physical receipt in the Delivery App.
          </p>
        </>
      )}
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
