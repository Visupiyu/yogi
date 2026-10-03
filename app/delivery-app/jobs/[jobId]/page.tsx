"use client";

// Job detail + execution (2B-6B-1). Drives the existing POST /api/delivery/scan
// FSM. The server is authoritative — buttons are UX hints only, and after every
// successful action we re-fetch authoritative state (never fabricate the next
// state). scanToken is never shown; the expected OTP is never displayed (the
// person types what the customer tells them). Person-to-person scan handovers
// (HANDOVER_INITIATE/CONFIRM) are intentionally not exposed here; the company
// hub handovers (Rider 1 -> origin hub, destination hub -> Rider 2) are, via
// their own server endpoints (see the hub panel below).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import QrScanner from "@/app/delivery-app/_components/QrScanner";
import { authedFetch, submitScan, type ScanAction, type ScanPayload } from "@/lib/deliveryApp/scanClient";

type JobDetail = {
  id: string;
  orderNumber?: string;
  vendorName?: string;
  shipmentNumber?: string;
  providerType?: string | null;
  status: string;
  currentStage?: string | null;
  custody?: { holderKind?: string | null; personId?: string | null } | null;
  pickup?: { sellerName?: string; area?: string } | null;
  drop?: { customerName?: string; phone?: string; address?: string; slot?: string | null } | null;
  parcel?: { items?: { name?: string; qty?: number }[] } | null;
  // Company hub journey signals — all server-derived (GET /api/delivery/jobs/[jobId]).
  pickupLegStatus?: string | null;
  originHub?: { name?: string } | null;
  destinationHub?: { name?: string } | null;
  task?: { finalMileHandoverState?: "ready" | "awaiting_rider_confirmation" | "confirmed" } | null;
  // Customer delivery-code STATUS (never the code) — see otpService.deliveryOtpView.
  deliveryOtp?: {
    state?: "not_issued" | "active" | "expired" | "locked" | "used" | "unavailable";
    attemptsRemaining?: number | null;
    delivery?: { inApp?: string; email?: string; sms?: string; anyDelivered?: boolean } | null;
  } | null;
};

// What the rider needs to know about the customer's code before asking for it.
// Plain language, and an explicit fallback that stays inside the normal
// workflow: never hand over without a verified code — the customer can resend
// it from their order page; if they still can't get it, record a failed attempt.
function otpStatusLines(o: JobDetail["deliveryOtp"]): { tone: "ok" | "warn" | "bad"; lines: string[] } | null {
  if (!o?.state) return null;
  const d = o.delivery;
  const left = typeof o.attemptsRemaining === "number" ? ` ${o.attemptsRemaining} wrong entr${o.attemptsRemaining === 1 ? "y" : "ies"} left before it locks.` : "";
  switch (o.state) {
    case "unavailable":
      return { tone: "bad", lines: ["Delivery codes are unavailable right now, so delivery can't be confirmed. Do not hand over — record a failed attempt and contact your dispatcher."] };
    case "not_issued":
      return { tone: "warn", lines: ["No delivery code has been issued yet. Mark the parcel \"Out for delivery\" to send one to the customer."] };
    case "used":
      return null;
    case "locked":
      return { tone: "bad", lines: ["Too many wrong codes — this code is locked. Ask the customer to tap \"Resend delivery code\" on their order page, then enter the new code."] };
    case "expired":
      return { tone: "warn", lines: ["The customer's code has expired. Ask them to tap \"Resend delivery code\" on their order page."] };
    case "active": {
      if (!d) return { tone: "warn", lines: ["The code is being sent to the customer.", `Ask for it at the door.${left}`] };
      if (!d.anyDelivered) {
        return {
          tone: "bad",
          lines: [
            "The code could NOT be delivered to the customer (email and app notification both failed).",
            "Ask them to tap \"Resend delivery code\" on their order page. If they still can't get it, do not hand over — report a failed attempt (customer unavailable / OTP not received).",
          ],
        };
      }
      if (d.email !== "sent") {
        return {
          tone: "warn",
          lines: [
            "The code was NOT emailed — it is only in the customer's YOMICO app notifications (bell icon).",
            `If they can't find it, they can tap "Resend delivery code" on their order page.${left}`,
          ],
        };
      }
      return { tone: "ok", lines: [`Code sent to the customer's email and YOMICO notifications.${left}`] };
    }
  }
  return null;
}

const EXCEPTION_CODES = [
  "CUSTOMER_UNAVAILABLE", "SELLER_UNAVAILABLE", "DAMAGED_PACKAGE",
  "WRONG_PACKAGE", "WRONG_SHIPMENT_SCAN", "FAILED_PICKUP", "FAILED_DELIVERY",
] as const;

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = typeof params?.jobId === "string" ? params.jobId : Array.isArray(params?.jobId) ? params.jobId[0] : "";

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // In-memory scanned payload for the current job session — reusable for
  // intermediate actions only, and ONLY when its shipmentNumber matches the
  // job currently displayed (see cachedOrScan). NEVER persisted.
  const [sessionPayload, setSessionPayload] = useState<ScanPayload | null>(null);
  const [scannerFor, setScannerFor] = useState<{ action: ScanAction; otp?: string; exceptionCode?: string; notes?: string } | null>(null);
  // Synchronous in-flight guard: blocks a second same-tick submission before
  // React re-renders the disabled state. One user action → one clientEventId.
  const inFlightRef = useRef(false);

  const [otp, setOtp] = useState("");
  const [panel, setPanel] = useState<"none" | "attempt" | "exception">("none");
  const [formCode, setFormCode] = useState<string>("CUSTOMER_UNAVAILABLE");
  const [formNotes, setFormNotes] = useState("");

  const loadDetail = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch(`/api/delivery/jobs/${encodeURIComponent(jobId)}`);
      const data = await res.json();
      // 401 = no/expired session. 403 = this person is not the job's current
      // assignee — which is the NORMAL outcome for Rider 1 once the origin hub
      // has confirmed receipt (assignment legitimately moves on). Authorization
      // is deliberately not loosened to keep the old rider on the job.
      if (res.status === 401) { setError("Your session has expired. Please sign in again."); return; }
      if (res.status === 403) {
        setError("This job is no longer assigned to you. If you just handed it over (for example to a hub), your part is complete — return to My jobs.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Could not load this job.");
      setDetail(data.job as JobDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this job.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // On jobId change (and first mount): never carry a previous job's state into
  // the new one — clear the cached scan payload, OTP, panels and feedback, and
  // drop the old detail so Job A is never shown/actioned while Job B loads.
  useEffect(() => {
    setSessionPayload(null);
    setOtp("");
    setPanel("none");
    setFeedback(null);
    setDetail(null);
    setLoading(true);
  }, [jobId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const pickedUp = useMemo(() => {
    const k = detail?.custody?.holderKind;
    return !!k && k !== "SELLER" && k !== "CUSTOMER";
  }, [detail]);
  const delivered = detail?.status === "Delivered";
  const terminal = delivered || detail?.status === "Cancelled" || detail?.status === "Returned";

  // Company hub journey (the SAME Company Job — never a second job). Every flag
  // below is read straight from the server read model; nothing is inferred here,
  // and the server re-validates role, custody and state on each action.
  //   Rider 1: pickup leg PickedUp -> may declare the handover to the origin hub;
  //            HandoverInitiated -> waiting for the origin hub person to confirm.
  //   Rider 2: final-mile handover "awaiting_rider_confirmation" -> may confirm
  //            receipt from the destination hub; "ready" -> hub person not yet released it.
  const isCompanyJob = detail?.providerType === "COMPANY";
  const canHandToOriginHub = !terminal && isCompanyJob && detail?.pickupLegStatus === "PickedUp";
  const awaitingOriginHubReceipt = !terminal && isCompanyJob && detail?.pickupLegStatus === "HandoverInitiated";
  const finalMileState = isCompanyJob ? detail?.task?.finalMileHandoverState : undefined;
  // Depart is only ever legal for a parcel-holding rider whose leg is
  // PickedUp/HandoverConfirmed. The server rejects it for YOMICO Direct and for a
  // company FINAL-MILE leg (Rider 2 goes straight from "Assigned" to Out for
  // delivery), so those cases never see the button.
  const canDepart = isCompanyJob && finalMileState === undefined;
  const canConfirmHubReceipt = !terminal && finalMileState === "awaiting_rider_confirmation";
  const awaitingHubRelease = !terminal && finalMileState === "ready";
  const inHubHandoverPhase = canHandToOriginHub || awaitingOriginHubReceipt || canConfirmHubReceipt || awaitingHubRelease;

  // Perform an action with a known payload (from a fresh scan or session cache).
  // The synchronous inFlightRef guard ensures two same-tick taps cannot start
  // two submissions (and thus two clientEventIds) before the disabled state
  // re-renders. It clears on both success and failure.
  const perform = useCallback(async (action: ScanAction, payload: ScanPayload, extra?: { otp?: string; exceptionCode?: string; notes?: string }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(action);
    setFeedback(null);
    try {
      const r = await submitScan({ payload, action, otp: extra?.otp, exceptionCode: extra?.exceptionCode, notes: extra?.notes });
      if (r.ok) {
        setSessionPayload(payload); // cache for subsequent intermediate actions (memory only)
        setFeedback({ type: "success", msg: `${action.replace(/_/g, " ").toLowerCase()} recorded.` });
        setPanel("none"); setOtp(""); setFormNotes("");
        await loadDetail(); // authoritative re-read
      } else {
        setFeedback({ type: "error", msg: r.error });
      }
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  }, [loadDetail]);

  // Company hub handover actions — NO-BODY POSTs to the existing, fully
  // server-authoritative company-job endpoints (the server resolves the caller
  // from the verified token and re-checks role/custody/state). Same in-flight
  // guard as scans; the job is re-read after success, never assumed.
  const hubAction = useCallback(async (kind: "ORIGIN_HANDOVER" | "DESTINATION_RECEIPT") => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(kind);
    setFeedback(null);
    try {
      const path = kind === "ORIGIN_HANDOVER" ? "hub-intake" : "destination-handover/confirm";
      const res = await authedFetch(`/api/delivery/company/jobs/${encodeURIComponent(jobId)}/${path}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: "error", msg: (data?.error as string) || "Could not complete this step." });
        return;
      }
      setFeedback({
        type: "success",
        msg: kind === "ORIGIN_HANDOVER"
          ? "Handover recorded. Waiting for the hub person to confirm receipt."
          : "Receipt confirmed. This shipment is now with you.",
      });
      await loadDetail(); // authoritative re-read
    } catch {
      setFeedback({ type: "error", msg: "Network error. Please try again." });
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  }, [jobId, loadDetail]);

  // Fresh-scan-required actions (PICKUP, DELIVER): always open the scanner.
  const scanThen = (action: ScanAction, extra?: { otp?: string; exceptionCode?: string; notes?: string }) => {
    if (busy || inFlightRef.current) return;
    setScannerFor({ action, ...extra });
  };
  // Intermediate/report actions: reuse the session payload ONLY when it belongs
  // to the exact job currently displayed (shipmentNumber match). Any doubt →
  // require a fresh physical scan. This invariant is enforced here, not by
  // relying on route/component reuse.
  const cachedOrScan = (action: ScanAction, extra?: { exceptionCode?: string; notes?: string }) => {
    if (busy || inFlightRef.current) return;
    const currentShipment = detail?.shipmentNumber;
    const cacheMatchesCurrentJob =
      !!sessionPayload && !!currentShipment && sessionPayload.shipmentNumber === currentShipment;
    if (cacheMatchesCurrentJob) void perform(action, sessionPayload as ScanPayload, extra);
    else setScannerFor({ action, ...extra });
  };

  const onScanned = (payload: ScanPayload) => {
    const pending = scannerFor;
    setScannerFor(null);
    if (!pending) return;
    void perform(pending.action, payload, { otp: pending.otp, exceptionCode: pending.exceptionCode, notes: pending.notes });
  };

  if (loading) return <div className="rounded border bg-white p-8 text-center text-gray-500">Loading job…</div>;
  if (error) return (
    <div className="rounded border bg-red-50 p-6 text-center text-red-700">
      <p className="mb-3">{error}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => { setLoading(true); void loadDetail(); }} className="rounded bg-black px-3 py-2 text-sm text-white">Retry</button>
        <Link href="/delivery-app" className="rounded border bg-white px-3 py-2 text-sm text-gray-800">Back to my jobs</Link>
      </div>
    </div>
  );
  if (!detail) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-all font-mono text-xs text-gray-600">{detail.shipmentNumber || "—"}</span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium">{detail.status}</span>
        </div>
        <p className="mt-1 text-lg font-semibold">{detail.currentStage || "—"}</p>
        <p className="break-words text-sm text-gray-500">{detail.vendorName || "Seller"} · Order {detail.orderNumber || "—"}</p>
      </div>

      {/* Pickup / drop */}
      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Pickup</p>
          <p className="text-sm font-medium">{detail.pickup?.sellerName || "—"}</p>
          {detail.pickup?.area ? <p className="break-words text-sm text-gray-500">{detail.pickup.area}</p> : null}
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Deliver to</p>
          <p className="break-words text-sm font-medium">{detail.drop?.customerName || "—"}</p>
          {detail.drop?.address ? <p className="break-words text-sm text-gray-600">{detail.drop.address}</p> : null}
          {detail.drop?.phone ? <a href={`tel:${detail.drop.phone}`} className="mt-1 inline-block text-sm text-blue-600 underline">Call {detail.drop.phone}</a> : null}
        </div>
        {detail.parcel?.items?.length ? (
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs uppercase text-gray-400">Items</p>
            <ul className="mt-1 text-sm text-gray-700">
              {detail.parcel.items.map((it, i) => <li key={i} className="break-words">{it.name} × {it.qty}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      {feedback && (
        <div className={`rounded px-3 py-2 text-sm ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{feedback.msg}</div>
      )}

      {/* Actions */}
      {terminal ? (
        <div className="rounded-lg border bg-green-50 p-4 text-center text-sm text-green-800">
          {delivered ? "Delivered." : `This job is ${detail.status}.`}
        </div>
      ) : (
        <div className="space-y-3">
          {inHubHandoverPhase && (
            <div className="rounded-lg border bg-white p-4 space-y-3">
              {canHandToOriginHub && (
                <>
                  <p className="text-sm font-medium text-gray-800">
                    Hand this shipment to the origin hub{(detail.originHub?.name) ? `: ${detail.originHub.name}` : ""}.
                  </p>
                  <p className="text-xs text-gray-500">Tap only when you are physically handing the parcel to the hub person. They will then confirm receipt.</p>
                  <button
                    onClick={() => { if (window.confirm("Confirm you are handing this shipment to the origin hub?")) void hubAction("ORIGIN_HANDOVER"); }}
                    disabled={!!busy}
                    className="w-full rounded-lg bg-teal-600 px-4 py-4 text-base font-semibold text-white disabled:opacity-50">
                    {busy === "ORIGIN_HANDOVER" ? "Recording handover…" : "Hand to origin hub"}
                  </button>
                </>
              )}
              {awaitingOriginHubReceipt && (
                <>
                  <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Waiting for the hub person{(detail.originHub?.name) ? ` at ${detail.originHub.name}` : ""} to confirm receipt. Once they do, this job leaves your list.
                  </p>
                  <button onClick={() => void loadDetail()} disabled={!!busy}
                    className="w-full rounded-lg border bg-white px-3 py-3 text-sm font-medium disabled:opacity-50">Refresh status</button>
                </>
              )}
              {canConfirmHubReceipt && (
                <>
                  <p className="text-sm font-medium text-gray-800">
                    The hub person{(detail.destinationHub?.name) ? ` at ${detail.destinationHub.name}` : ""} is handing you this shipment.
                  </p>
                  <p className="text-xs text-gray-500">Tap only after you have physically received the parcel. This makes you responsible for it.</p>
                  <button
                    onClick={() => { if (window.confirm("Confirm you have received this shipment from the hub?")) void hubAction("DESTINATION_RECEIPT"); }}
                    disabled={!!busy}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-4 text-base font-semibold text-white disabled:opacity-50">
                    {busy === "DESTINATION_RECEIPT" ? "Confirming receipt…" : "Confirm I received this shipment"}
                  </button>
                </>
              )}
              {awaitingHubRelease && (
                <>
                  <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Waiting for the hub person{(detail.destinationHub?.name) ? ` at ${detail.destinationHub.name}` : ""} to hand this shipment over to you.
                  </p>
                  <button onClick={() => void loadDetail()} disabled={!!busy}
                    className="w-full rounded-lg border bg-white px-3 py-3 text-sm font-medium disabled:opacity-50">Refresh status</button>
                </>
              )}
            </div>
          )}
          {inHubHandoverPhase ? null : !pickedUp ? (
            <button onClick={() => scanThen("PICKUP")} disabled={!!busy}
              className="w-full rounded-lg bg-black px-4 py-4 text-base font-semibold text-white disabled:opacity-50">
              {busy === "PICKUP" ? "Recording pickup…" : "Scan & pick up"}
            </button>
          ) : (
            <>
              <div className={`grid gap-3 ${canDepart ? "grid-cols-2" : "grid-cols-1"}`}>
                {canDepart && (
                  <button onClick={() => cachedOrScan("DEPART")} disabled={!!busy}
                    className="rounded-lg border bg-white px-3 py-3 text-sm font-medium disabled:opacity-50">
                    {busy === "DEPART" ? "…" : "Depart"}
                  </button>
                )}
                <button onClick={() => cachedOrScan("OUT_FOR_DELIVERY")} disabled={!!busy}
                  className="rounded-lg border bg-white px-3 py-3 text-sm font-medium disabled:opacity-50">
                  {busy === "OUT_FOR_DELIVERY" ? "…" : "Out for delivery"}
                </button>
              </div>

              {/* Deliver (fresh scan + customer OTP) */}
              <div className="rounded-lg border bg-white p-4">
                {(() => {
                  const status = otpStatusLines(detail?.deliveryOtp);
                  if (!status) return null;
                  const tone =
                    status.tone === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : status.tone === "warn"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-red-200 bg-red-50 text-red-900";
                  return (
                    <div role="status" className={`mb-3 rounded border p-2 text-xs ${tone}`}>
                      {status.lines.map((line) => <p key={line}>{line}</p>)}
                    </div>
                  );
                })()}
                <label className="block text-sm font-medium text-gray-700">Customer OTP</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\s/g, ""))} inputMode="numeric"
                  placeholder="Enter the code the customer gives you"
                  className="mt-1 w-full rounded border px-3 py-3 text-base" />
                <button onClick={() => scanThen("DELIVER", { otp })} disabled={!!busy || !otp}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-4 text-base font-semibold text-white disabled:opacity-50">
                  {busy === "DELIVER" ? "Confirming delivery…" : "Scan & deliver"}
                </button>
                <p className="mt-1 text-[11px] text-gray-400">Ask the customer for their delivery code; it is verified by the server.</p>
              </div>

              {/* Report failed attempt */}
              <button onClick={() => setPanel(panel === "attempt" ? "none" : "attempt")} disabled={!!busy}
                className="w-full rounded-lg border bg-white px-3 py-3 text-sm font-medium disabled:opacity-50">Report failed attempt</button>
              {panel === "attempt" && (
                <div className="rounded-lg border bg-white p-4 space-y-2">
                  <select value={formCode} onChange={(e) => setFormCode(e.target.value)} className="w-full rounded border px-2 py-2 text-sm">
                    {EXCEPTION_CODES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                  <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full rounded border px-2 py-2 text-sm" />
                  <button onClick={() => cachedOrScan("ATTEMPT_FAILED", { exceptionCode: formCode, notes: formNotes })} disabled={!!busy}
                    className="w-full rounded bg-red-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50">
                    {busy === "ATTEMPT_FAILED" ? "Recording…" : "Submit failed attempt"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Exception (available while active) */}
          <button onClick={() => setPanel(panel === "exception" ? "none" : "exception")} disabled={!!busy}
            className="w-full rounded-lg border bg-white px-3 py-3 text-sm font-medium disabled:opacity-50">Report exception</button>
          {panel === "exception" && (
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <select value={formCode} onChange={(e) => setFormCode(e.target.value)} className="w-full rounded border px-2 py-2 text-sm">
                {EXCEPTION_CODES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full rounded border px-2 py-2 text-sm" />
              <button onClick={() => cachedOrScan("EXCEPTION", { exceptionCode: formCode, notes: formNotes })} disabled={!!busy}
                className="w-full rounded bg-amber-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50">
                {busy === "EXCEPTION" ? "Recording…" : "Submit exception"}
              </button>
            </div>
          )}
        </div>
      )}

      {scannerFor && (
        <QrScanner
          title={scannerFor.action === "PICKUP" ? "Scan to pick up" : scannerFor.action === "DELIVER" ? "Scan to deliver" : "Scan shipment"}
          onResult={onScanned}
          onClose={() => setScannerFor(null)}
        />
      )}
    </div>
  );
}
