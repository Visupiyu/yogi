"use client";

// Reusable company job-action panel: assign / reassign a company person and
// reject a handoff, using ONLY the existing endpoints
//   POST /api/delivery/company/jobs/[jobId]/assign  { personId }
//   POST /api/delivery/company/jobs/[jobId]/reject  { reason? }
//
// It never writes Firestore and never assumes the result: after a successful
// action it calls onDone() so the parent re-fetches authoritative state. Actions
// are offered ONLY for statuses the backend still accepts (OfferedToCompany /
// AssignedToCompany); the server re-validates and remains authoritative.
//
// Assignment is NOT custody — assigning a person does not pick up the parcel; the
// stage stays "Awaiting pickup" until the person scans PICKUP in the Delivery App.
import { useState } from "react";
import {
  authedFetch,
  isAssignablePerson,
  COMPANY_ACTIONABLE_STATUSES,
  type CompanyPerson,
} from "@/app/delivery-company/_lib/console";

export default function JobActions({
  jobId,
  status,
  assignedPersonName,
  persons,
  personsLoading,
  personsError,
  onReloadPersons,
  onDone,
}: {
  jobId: string;
  status: string;
  assignedPersonName?: string | null;
  persons: CompanyPerson[] | null;
  personsLoading: boolean;
  personsError: string | null;
  onReloadPersons: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [confirming, setConfirming] = useState<null | "assign" | "reject">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | "assign" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  if (!COMPANY_ACTIONABLE_STATUSES.has(status)) return null;

  const assignable = (persons ?? []).filter(isAssignablePerson);
  const selectedPerson = (persons ?? []).find((p) => p.id === selected) || null;
  const reassign = Boolean(assignedPersonName);

  const doAssign = async () => {
    if (!selected || busy) return;
    setBusy("assign");
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/assign`, {
        method: "POST",
        body: JSON.stringify({ personId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not assign this delivery person.");
      setConfirming(null);
      setSelected("");
      onDone(); // re-fetch authoritative state; do not assume success locally
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign this delivery person.");
    } finally {
      setBusy(null);
    }
  };

  const doReject = async () => {
    if (busy) return;
    setBusy("reject");
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/reject`, {
        method: "POST",
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not reject this handoff.");
      setConfirming(null);
      setReason("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject this handoff.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Assign / reassign */}
      <div>
        <label htmlFor={`assign-${jobId}`} className="block text-xs font-medium text-gray-600">
          {reassign ? "Reassign delivery person" : "Assign delivery person"}
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
              id={`assign-${jobId}`}
              className="mt-1 w-full rounded border px-2 py-2 text-sm disabled:opacity-50"
              value={selected}
              disabled={busy !== null}
              onChange={(e) => { setSelected(e.target.value); setConfirming(null); setError(null); }}
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
              Only your company&apos;s active, available people can be assigned. Assigning does not pick up the
              parcel — the stage stays “Awaiting pickup” until the person scans PICKUP in the Delivery App.
            </p>

            {confirming === "assign" && selectedPerson ? (
              <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm text-indigo-900">
                  Assign this shipment to <span className="font-semibold">{selectedPerson.name || selectedPerson.id}</span>?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={doAssign}
                    disabled={busy !== null}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy === "assign" ? "Assigning…" : "Confirm assign"}
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={busy !== null}
                    className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { if (selected) setConfirming("assign"); }}
                disabled={!selected || busy !== null}
                className="mt-2 rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {reassign ? "Reassign" : "Assign"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Reject handoff */}
      <div className="border-t pt-3">
        {confirming === "reject" ? (
          <div className="rounded border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-900">Reject this handoff and return it to YOMICO?</p>
            <label className="mt-2 block text-xs text-red-800">
              Reason (optional)
              <textarea
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-gray-800"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Outside our service area"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                onClick={doReject}
                disabled={busy !== null}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "reject" ? "Rejecting…" : "Confirm reject"}
              </button>
              <button
                onClick={() => { setConfirming(null); setReason(""); }}
                disabled={busy !== null}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setConfirming("reject"); setError(null); }}
            disabled={busy !== null}
            className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject handoff
          </button>
        )}
      </div>

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
