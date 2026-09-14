"use client";

// Company dispatcher → final-mile rider assignment, using ONLY the existing
//   POST /api/delivery/company/jobs/[jobId]/final-mile-assign     { personId }
//   POST /api/delivery/company/jobs/[jobId]/final-mile-reassign   { personId }
// backend transitions (role "company"; the server re-validates company
// ownership, state preconditions and person eligibility and remains
// authoritative — reassignment is additionally rejected once the destination-
// hub handover has started in any way, which the Console never re-derives
// itself: the parent page only renders `mode="reassign"` while the backend's
// own job.task.finalMileHandoverState reads "ready").
//
// This is a DISPATCH action: it selects which of the company's own people carries
// the final mile. The Console never performs the physical delivery — the assigned
// rider authenticates in the Delivery App to go Out for delivery and Deliver.
// After a successful assignment we re-fetch authoritative state (never assume it).
import { useState } from "react";
import {
  authedFetch,
  isAssignablePerson,
  type CompanyPerson,
} from "@/app/delivery-company/_lib/console";

export default function FinalMileAssign({
  jobId,
  mode = "assign",
  currentPersonId,
  persons,
  personsLoading,
  personsError,
  onReloadPersons,
  onDone,
}: {
  jobId: string;
  // "assign": no final-mile rider selected yet (AtDestinationHub). "reassign":
  // a rider is already selected but has not yet received the handover — this
  // corrects the selection without touching custody/handover state.
  mode?: "assign" | "reassign";
  // reassign only: excluded from the picker (reassigning to the same person
  // is a meaningless correction) and used for the confirmation copy.
  currentPersonId?: string | null;
  persons: CompanyPerson[] | null;
  personsLoading: boolean;
  personsError: string | null;
  onReloadPersons: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignable = (persons ?? []).filter(
    (p) => isAssignablePerson(p) && (mode !== "reassign" || p.id !== currentPersonId)
  );
  const selectedPerson = (persons ?? []).find((p) => p.id === selected) || null;
  const endpoint = mode === "reassign" ? "final-mile-reassign" : "final-mile-assign";
  const failMsg = mode === "reassign" ? "Could not reassign the final-mile rider." : "Could not assign a final-mile rider.";

  const doAssign = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ personId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || failMsg);
      setConfirming(false);
      setSelected("");
      onDone(); // re-fetch authoritative state; do not assume success locally
    } catch (e) {
      setError(e instanceof Error ? e.message : failMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label htmlFor={`finalmile-${jobId}`} className="block text-xs font-medium text-gray-600">
        {mode === "reassign" ? "Replacement final-mile delivery person" : "Final-mile delivery person"}
      </label>
      {personsLoading ? (
        <p className="mt-1 text-sm text-gray-500">Loading your delivery people…</p>
      ) : personsError ? (
        <div className="mt-1 text-sm text-red-700">
          {personsError}{" "}
          <button onClick={onReloadPersons} className="underline">Retry</button>
        </div>
      ) : (
        <>
          <select
            id={`finalmile-${jobId}`}
            className="mt-1 w-full rounded border px-2 py-2 text-sm disabled:opacity-50"
            value={selected}
            disabled={busy}
            onChange={(e) => { setSelected(e.target.value); setConfirming(false); setError(null); }}
          >
            <option value="">
              {assignable.length ? "Select an active, available person…" : "No active + available people"}
            </option>
            {(persons ?? []).map((p) => {
              const ok = isAssignablePerson(p);
              const acct = p.accountStatus || "Active";
              const avail = p.availability || "Offline";
              return (
                <option key={p.id} value={p.id} disabled={!ok}>
                  {p.name || p.id}
                  {ok ? "" : ` — ${acct !== "Active" ? acct : avail}`}
                </option>
              );
            })}
          </select>
          <p className="mt-1 text-[11px] text-gray-400">
            {mode === "reassign"
              ? "Only your company's active, available people can be selected. This only changes WHO is assigned — it does not move custody, which is still safely at your destination hub."
              : "Only your company's active, available people can be assigned. The assigned rider carries the parcel from the destination hub to the customer and performs the delivery in the Delivery App."}
          </p>

          {confirming && selectedPerson ? (
            <div className="mt-2 rounded border border-teal-200 bg-teal-50 p-3">
              <p className="text-sm text-teal-900">
                {mode === "reassign" ? "Reassign the final mile to " : "Assign the final mile to "}
                <span className="font-semibold">{selectedPerson.name || selectedPerson.id}</span>?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={doAssign}
                  disabled={busy}
                  className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? (mode === "reassign" ? "Reassigning…" : "Assigning…") : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { if (selected) setConfirming(true); }}
              disabled={!selected || busy}
              className="mt-2 rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {mode === "reassign" ? "Reassign final-mile rider" : "Assign final-mile rider"}
            </button>
          )}
        </>
      )}

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
