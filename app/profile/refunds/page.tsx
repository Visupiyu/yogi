"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import {
  REFUND_DESTINATION_LABEL,
  isTerminal,
  stagesFor,
  statusLabel,
  statusTone,
  type ItemRequestType,
} from "@/lib/itemRequests";

// Customer refund/request history.
//
// Primary: the new per-item itemRequests (return + replace), read by the owner
// (firestore.rules: userId == uid). Secondary: the legacy order-level `returns`
// records, so older requests still show. Both are read-only here.

const TONE_BADGE: Record<string, string> = {
  ok: "bg-green-100 text-green-700 border-green-300",
  bad: "bg-red-100 text-red-700 border-red-300",
  running: "bg-blue-100 text-blue-700 border-blue-300",
  idle: "bg-amber-100 text-amber-700 border-amber-300",
};

type ItemRequest = {
  id: string;
  requestNumber?: string;
  type?: ItemRequestType;
  status?: string;
  orderId?: string;
  reason?: string;
  item?: { name?: string; image?: string; qty?: number };
  refund?: { amount?: number };
  pickup?: {
    proposedAt?: unknown;
    counterAt?: unknown;
    scheduledAt?: unknown;
    customerResponse?: unknown;
    partner?: unknown;
  };
  createdAt?: { seconds?: number };
};

/** Firestore Timestamp | ISO | epoch | {seconds} -> Date | null. */
function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const c = v as { toDate?: () => Date; seconds?: number };
  if (typeof c.toDate === "function") {
    try {
      const d = c.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof c.seconds === "number") return new Date(c.seconds * 1000);
  return null;
}

function fmtDateTime(v: unknown): string {
  const d = toDate(v);
  return d
    ? d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";
}

export default function RefundsPage() {
  const [requests, setRequests] = useState<ItemRequest[]>([]);
  const [legacy, setLegacy] = useState<{ id: string; [k: string]: unknown }[]>([]);
  const [loading, setLoading] = useState(true);
  // Pickup-slot negotiation (customer accept / counter). Keyed per request.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counterInputs, setCounterInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const reqSnap = await getDocs(
          query(collection(db, "itemRequests"), where("userId", "==", user.uid))
        );
        const items: ItemRequest[] = [];
        reqSnap.forEach((d) => items.push({ id: d.id, ...(d.data() as object) }));
        items.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );
        setRequests(items);

        // Legacy order-level returns, matched by email as before.
        if (user.email) {
          const legacySnap = await getDocs(
            query(collection(db, "returns"), where("userEmail", "==", user.email))
          );
          const legacyItems: { id: string; [k: string]: unknown }[] = [];
          legacySnap.forEach((d) => legacyItems.push({ id: d.id, ...d.data() }));
          setLegacy(legacyItems);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [reloadKey]);

  // Respond to a proposed pickup slot: accept it, or counter with a different
  // time. The customer never writes the request directly — this calls the
  // existing server respond route, which verifies ownership and the state.
  const respond = async (
    requestId: string,
    action: "accept" | "counter",
    when?: string
  ) => {
    setError("");
    const user = auth.currentUser;
    if (!user) return;
    if (action === "counter") {
      if (!when) {
        setError("Please choose a pickup date and time.");
        return;
      }
      const chosen = new Date(when);
      // Date.now() is read inside this async click handler (not during render),
      // so this is a legitimate use; the purity lint only fires because respond
      // is referenced from inside a .map() callback.
      // eslint-disable-next-line react-hooks/purity
      if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
        setError("Please choose a valid future date and time.");
        return;
      }
    }
    try {
      setBusyId(requestId);
      const token = await user.getIdToken();
      const res = await fetch("/api/item-request/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          action,
          ...(action === "counter" && when
            ? { counterAt: new Date(when).toISOString() }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Couldn't submit your response.");
        return;
      }
      setCounterInputs((p) => ({ ...p, [requestId]: "" }));
      setReloadKey((k) => k + 1);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white p-6 sm:p-8 rounded-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold">My Returns & Refunds</h1>
          <p className="opacity-90">Track your return and replacement requests</p>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">
            Loading...
          </div>
        ) : requests.length === 0 && legacy.length === 0 ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center text-gray-500">
            <p className="mb-4">You have no return or replacement requests yet.</p>
            <Link
              href="/orders"
              className="inline-flex px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold"
            >
              View My Orders
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const type: ItemRequestType =
                r.type === "replace" ? "replace" : "return";
              const status = r.status || "REQUESTED";
              const tone = statusTone(status);
              const stages = stagesFor(type);
              const idx = stages.indexOf(status);
              // Pickup negotiation: the customer acts only while a slot is
              // awaiting them (PICKUP_PROPOSED).
              const isProposed = status === "PICKUP_PROPOSED";
              const proposedOn = fmtDateTime(r.pickup?.proposedAt);
              const counterOn = fmtDateTime(r.pickup?.counterAt);
              const confirmedOn = fmtDateTime(r.pickup?.scheduledAt);
              const partner =
                typeof r.pickup?.partner === "string" ? r.pickup.partner : "";
              const respondingThis = busyId === r.id;
              return (
                <div key={r.id} className="bg-white rounded-3xl shadow p-5">
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.item?.image || "/no-image.png"}
                      alt={r.item?.name || "Product"}
                      className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">
                        {r.item?.name || "Product"}
                      </p>
                      <p className="text-xs text-gray-500">
                        <span className="capitalize">{type}</span>
                        {r.requestNumber ? ` #${r.requestNumber}` : ""} · Order{" "}
                        {r.orderId?.slice(0, 8) || "-"} · Qty {r.item?.qty ?? 1}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${TONE_BADGE[tone]} shrink-0`}
                    >
                      {statusLabel(type, status)}
                    </span>
                  </div>

                  {!isTerminal(status) && idx >= 0 && (
                    <p className="mt-3 text-xs text-gray-500">
                      Step {idx + 1} of {stages.length}
                      {type === "return" &&
                      typeof r.refund?.amount === "number" &&
                      r.refund.amount > 0
                        ? ` · Refund ₹${r.refund.amount.toLocaleString(
                            "en-IN"
                          )} as ${REFUND_DESTINATION_LABEL}`
                        : type === "replace"
                        ? " · Replacement in progress"
                        : ""}
                    </p>
                  )}

                  {r.reason && (
                    <p className="mt-2 text-sm text-gray-600">
                      Reason: {r.reason}
                    </p>
                  )}

                  {/* Pickup negotiation — the customer accepts the proposed slot
                      or proposes a different time. Gated on the STATUS
                      (PICKUP_PROPOSED), driven entirely through the existing
                      /api/item-request/respond route (no client Firestore
                      writes). Returns only. */}
                  {type === "return" && isProposed && (
                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm text-gray-800">
                        {proposedOn ? (
                          <>
                            Proposed pickup:{" "}
                            <span className="font-semibold">{proposedOn}</span>
                          </>
                        ) : (
                          "YOMICO has proposed a pickup time."
                        )}
                      </p>
                      {r.pickup?.customerResponse === "countered" &&
                        counterOn && (
                          <p className="text-xs text-amber-700 mt-1">
                            You asked for {counterOn} — awaiting a new proposal.
                          </p>
                        )}

                      <div className="mt-3">
                        <button
                          disabled={respondingThis}
                          onClick={() => respond(r.id, "accept")}
                          className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold"
                        >
                          {respondingThis ? "Saving…" : "Accept pickup time"}
                        </button>
                      </div>

                      <div className="mt-3">
                        <p className="text-gray-600 text-xs mb-1">
                          Propose a different time
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="datetime-local"
                            value={counterInputs[r.id] || ""}
                            onChange={(e) =>
                              setCounterInputs((p) => ({
                                ...p,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="border rounded-lg px-2 py-1 text-sm"
                          />
                          <button
                            disabled={respondingThis || !counterInputs[r.id]}
                            onClick={() =>
                              respond(r.id, "counter", counterInputs[r.id])
                            }
                            className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60 text-sm font-semibold"
                          >
                            {respondingThis ? "Saving…" : "Submit new time"}
                          </button>
                        </div>
                      </div>

                      {error && (
                        <p className="text-xs text-red-600 mt-2">{error}</p>
                      )}
                    </div>
                  )}

                  {/* Confirmed appointment once the customer (or admin) has
                      confirmed the slot. */}
                  {type === "return" &&
                    !isProposed &&
                    !isTerminal(status) &&
                    confirmedOn && (
                      <p className="mt-3 text-sm text-green-700 font-semibold">
                        ✓ Confirmed pickup: {confirmedOn}
                        {partner ? ` · ${partner}` : ""}
                      </p>
                    )}
                </div>
              );
            })}

            {legacy.length > 0 && (
              <div className="pt-4">
                <h2 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wide">
                  Earlier requests
                </h2>
                <div className="space-y-3">
                  {legacy.map((item) => (
                    <div key={item.id} className="bg-white rounded-2xl shadow p-4">
                      <p className="font-semibold text-sm">
                        Order: {String(item.orderId || "-").slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Reason: {String(item.reason || "-")}
                      </p>
                      <p className="text-sm mt-1">
                        Status:{" "}
                        <span
                          className={
                            item.status === "Refunded"
                              ? "text-green-600 font-semibold"
                              : item.status === "Rejected"
                              ? "text-red-600 font-semibold"
                              : "text-blue-600 font-semibold"
                          }
                        >
                          {String(item.status || "Pending")}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
