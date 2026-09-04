"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { app, auth, db } from "@/lib/firebase";
import { applyReturnStatusUpdate } from "@/lib/returns";
import {
  REFUND_DESTINATION_LABEL,
  isLegalTransition,
  isTerminal,
  nextStage,
  statusLabel,
  statusTone,
  type ItemRequestType,
} from "@/lib/itemRequests";

// Admin management of BOTH systems:
//   - itemRequests (new, per-item Return/Replace) — driven through the
//     server transition route, which enforces the state machine, credits the
//     refund and reserves replacement stock. The admin never writes the doc
//     directly (firestore.rules denies it).
//   - the legacy order-level `returns` collection — left working, via
//     lib/returns.applyReturnStatusUpdate, so historical requests still resolve.

const TONE_BADGE: Record<string, string> = {
  ok: "bg-green-100 text-green-700",
  bad: "bg-red-100 text-red-700",
  running: "bg-blue-100 text-blue-700",
  idle: "bg-amber-100 text-amber-700",
};

type ItemRequest = {
  id: string;
  type?: ItemRequestType;
  status?: string;
  orderId?: string;
  customerName?: string;
  vendorId?: string;
  reason?: string;
  comments?: string;
  needsReview?: boolean;
  item?: { name?: string; image?: string; qty?: number };
  refund?: { amount?: number };
  pickup?: {
    requestedAt?: { seconds?: number; toDate?: () => Date };
    proposedAt?: { seconds?: number; toDate?: () => Date };
    counterAt?: { seconds?: number; toDate?: () => Date };
    scheduledAt?: { seconds?: number; toDate?: () => Date };
    requestedBy?: string;
    customerResponse?: string;
    partner?: string;
  };
  createdAt?: { seconds?: number };
};

// Format a Firestore Timestamp-like value as an IST date + time.
function fmtWhen(
  ts: { seconds?: number; toDate?: () => Date } | undefined
): string {
  const d =
    ts && typeof ts.toDate === "function"
      ? ts.toDate()
      : ts && typeof ts.seconds === "number"
      ? new Date(ts.seconds * 1000)
      : null;
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

export default function AdminReturnsPage() {
  const [requests, setRequests] = useState<ItemRequest[]>([]);
  const [legacy, setLegacy] = useState<{ id: string; [k: string]: unknown }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"All" | "return" | "replace">("All");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Admin's chosen pickup datetime per request (datetime-local value), sent to
  // the transition API when scheduling a pickup.
  const [pickupInputs, setPickupInputs] = useState<Record<string, string>>({});
  // Admin's confirmed pickup partner per request, sent when scheduling.
  const [partnerInputs, setPartnerInputs] = useState<Record<string, string>>({});
  // Bumped to force a reload after a transition, so the fetch (and its
  // setState calls) stay inside the effect rather than a called-out function.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      // ===== TEMPORARY DIAGNOSTIC — remove after root-cause investigation =====
      // Non-sensitive: logs project id, the admin's email/verification state and
      // the token's email_verified claim (NEVER the token itself), then reads
      // the two collections SEPARATELY so we can see exactly which one Firestore
      // denies. This does not change any business logic.
      try {
        const u = auth.currentUser;
        const tokenRes = u ? await u.getIdTokenResult() : null;
        console.log("[returns-diag] client projectId:", app.options.projectId);
        console.log(
          "[returns-diag] currentUser.email:",
          u?.email,
          "| emailVerified:",
          u?.emailVerified
        );
        console.log(
          "[returns-diag] token claims.email:",
          tokenRes?.claims?.email,
          "| claims.email_verified:",
          tokenRes?.claims?.email_verified,
          "| claims.aud(project):",
          tokenRes?.claims?.aud
        );
      } catch (e) {
        console.log("[returns-diag] could not read auth/token state:", e);
      }

      // ---- itemRequests read (isolated) ----
      try {
        const reqSnap = await getDocs(collection(db, "itemRequests"));
        console.log("[returns-diag] itemRequests read OK — docs:", reqSnap.size);
        if (active) {
          const items: ItemRequest[] = [];
          reqSnap.forEach((d) =>
            items.push({ id: d.id, ...(d.data() as object) })
          );
          items.sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          );
          setRequests(items);
        }
      } catch (error) {
        console.error("[returns-diag] itemRequests read DENIED:", error);
      }

      // ---- legacy returns read (isolated) ----
      try {
        const legacySnap = await getDocs(collection(db, "returns"));
        console.log("[returns-diag] returns read OK — docs:", legacySnap.size);
        if (active) {
          const legacyItems: { id: string; [k: string]: unknown }[] = [];
          legacySnap.forEach((d) =>
            legacyItems.push({ id: d.id, ...d.data() })
          );
          legacyItems.sort(
            (a, b) =>
              ((b as { createdAt?: { seconds?: number } }).createdAt?.seconds ||
                0) -
              ((a as { createdAt?: { seconds?: number } }).createdAt?.seconds ||
                0)
          );
          setLegacy(legacyItems);
        }
      } catch (error) {
        console.error("[returns-diag] returns read DENIED:", error);
      }

      if (active) setLoading(false);
      // ===== END TEMPORARY DIAGNOSTIC =====
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Every itemRequests change goes through the transition route (Admin SDK):
  // it validates the move, credits refunds and reserves replacement stock.
  const transition = async (
    requestId: string,
    toStatus: string,
    pickupAt?: string,
    pickupPartner?: string
  ) => {
    const user = auth.currentUser;
    if (!user) {
      alert("Please sign in again.");
      return;
    }
    try {
      setBusyId(requestId);
      const token = await user.getIdToken();
      const res = await fetch("/api/item-request/transition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          toStatus,
          ...(pickupAt ? { pickupAt } : {}),
          ...(pickupPartner ? { pickupPartner } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Could not update the request.");
        return;
      }
      setReloadKey((k) => k + 1);
    } catch (error) {
      console.error(error);
      alert("Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  const updateLegacy = async (id: string, status: string) => {
    try {
      const rec = legacy.find((r) => r.id === id);
      await applyReturnStatusUpdate(db, { ...rec, id }, status);
      setLegacy(
        legacy.map((item) => (item.id === id ? { ...item, status } : item))
      );
    } catch (error) {
      console.error(error);
    }
  };

  const shown =
    typeFilter === "All"
      ? requests
      : requests.filter((r) => (r.type || "return") === typeFilter);

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 sm:p-8 rounded-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold">Returns & Replacements</h1>
          <p className="opacity-90">Per-item requests — approve, progress, refund</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(["All", "return", "replace"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-4 py-2 rounded-xl font-semibold capitalize transition ${
                typeFilter === f
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              {f === "All" ? "All" : f === "return" ? "Returns" : "Replacements"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : shown.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No {typeFilter === "All" ? "" : typeFilter} requests.
          </div>
        ) : (
          <div className="space-y-4">
            {shown.map((r) => {
              const type: ItemRequestType = r.type === "replace" ? "replace" : "return";
              const status = r.status || "REQUESTED";
              const tone = statusTone(status);
              const next = nextStage(type, status);
              const canReject = isLegalTransition(type, status, "REJECTED");
              const busy = busyId === r.id;

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-3xl shadow p-5 flex flex-col gap-4"
                >
                  <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex items-center gap-3 lg:w-1/3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.item?.image || "/no-image.png"}
                      alt={r.item?.name || "Product"}
                      className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {r.item?.name || "Product"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Qty {r.item?.qty ?? 1} · Order{" "}
                        {r.orderId?.slice(0, 8) || "-"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.customerName || "Customer"} · Seller{" "}
                        {r.vendorId?.slice(0, 6) || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="lg:flex-1 text-sm">
                    <p>
                      <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold capitalize mr-2">
                        {type}
                      </span>
                      {type === "return" && typeof r.refund?.amount === "number" && (
                        <span className="text-gray-700">
                          Refund &#8377;
                          {r.refund.amount.toLocaleString("en-IN")} ·{" "}
                          {REFUND_DESTINATION_LABEL}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-gray-600">Reason: {r.reason || "-"}</p>
                    {r.comments && (
                      <p className="mt-1 text-gray-500 text-xs">
                        &ldquo;{r.comments}&rdquo;
                      </p>
                    )}
                    {r.needsReview && (
                      <p className="mt-1 text-amber-700 text-xs font-semibold">
                        ⚠ No delivery date on record — verify eligibility.
                      </p>
                    )}
                    {r.pickup?.proposedAt && status === "PICKUP_PROPOSED" && (
                      <p className="mt-1 text-blue-700 text-xs">
                        Proposed pickup: {fmtWhen(r.pickup.proposedAt)}
                        {r.pickup.customerResponse === "countered" &&
                        r.pickup.counterAt
                          ? ` · customer countered → ${fmtWhen(r.pickup.counterAt)}`
                          : r.pickup.customerResponse === "pending"
                          ? " · awaiting customer"
                          : ""}
                      </p>
                    )}
                    {r.pickup?.scheduledAt && (
                      <p className="mt-1 text-green-700 text-xs font-semibold">
                        ✓ Confirmed pickup: {fmtWhen(r.pickup.scheduledAt)}
                        {r.pickup.partner ? ` · ${r.pickup.partner}` : ""}
                      </p>
                    )}
                  </div>

                  <div className="lg:w-64 flex flex-col gap-2">
                    <span
                      className={`self-start px-3 py-1 rounded-full text-xs font-semibold ${TONE_BADGE[tone]}`}
                    >
                      {statusLabel(type, status)}
                    </span>

                    {!isTerminal(status) && (
                      <div className="flex flex-wrap gap-2 items-center">
                        {/* Forward step (approve, mark received, etc.). The
                            pickup propose / confirm / assign controls live in
                            their own labelled section below the row. */}
                        {next &&
                          next !== "PICKUP_PROPOSED" &&
                          next !== "PICKUP_ASSIGNED" &&
                          status !== "PICKUP_PROPOSED" && (
                            <button
                              disabled={busy}
                              onClick={() => transition(r.id, next)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white"
                            >
                              {busy ? "..." : `Mark ${statusLabel(type, next)}`}
                            </button>
                          )}

                        {canReject && (
                          <button
                            disabled={busy}
                            onClick={() => transition(r.id, "REJECTED")}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    )}
                    {type === "replace" && status === "APPROVED" && (
                      <p className="text-xs text-gray-400">
                        Seller now prepares and ships the replacement.
                      </p>
                    )}
                  </div>
                  </div>

                  {/* PICKUP NEGOTIATION — a full-width, clearly-labelled section
                      so the admin always sees how to move an approved return
                      forward. Returns only; the state machine is unchanged (a
                      slot can only be proposed once the return is APPROVED). */}
                  {type === "return" && !isTerminal(status) && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-2">
                        Pickup
                      </p>

                      {/* Before approval, point the admin at the next step. */}
                      {(status === "REQUESTED" || status === "UNDER_REVIEW") && (
                        <p className="text-xs text-gray-400">
                          Approve this return to propose a pickup date &amp; time.
                        </p>
                      )}

                      {/* Propose a slot once the return is APPROVED. No partner
                          is assigned at this stage. */}
                      {next === "PICKUP_PROPOSED" && (
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="datetime-local"
                            value={pickupInputs[r.id] || ""}
                            onChange={(e) =>
                              setPickupInputs((p) => ({
                                ...p,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="text-sm border rounded-lg px-2 py-1"
                          />
                          <button
                            disabled={busy}
                            onClick={() => {
                              const v = pickupInputs[r.id];
                              if (!v) {
                                alert("Choose a pickup date and time.");
                                return;
                              }
                              transition(
                                r.id,
                                "PICKUP_PROPOSED",
                                new Date(v).toISOString()
                              );
                            }}
                            className="text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white"
                          >
                            {busy ? "Saving…" : "Propose pickup"}
                          </button>
                        </div>
                      )}

                      {/* Awaiting the customer: re-propose after a counter, or
                          confirm the slot on their behalf. */}
                      {status === "PICKUP_PROPOSED" && (
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="datetime-local"
                            value={pickupInputs[r.id] || ""}
                            onChange={(e) =>
                              setPickupInputs((p) => ({
                                ...p,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="text-sm border rounded-lg px-2 py-1"
                          />
                          <button
                            disabled={busy}
                            onClick={() => {
                              const v = pickupInputs[r.id];
                              if (!v) {
                                alert("Choose a pickup date and time.");
                                return;
                              }
                              transition(
                                r.id,
                                "PICKUP_PROPOSED",
                                new Date(v).toISOString()
                              );
                            }}
                            className="text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white"
                          >
                            {busy ? "Saving…" : "Re-propose slot"}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => transition(r.id, "PICKUP_CONFIRMED")}
                            className="text-sm font-semibold px-4 py-2 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            Confirm on customer&apos;s behalf
                          </button>
                        </div>
                      )}

                      {/* Assign a delivery partner once the slot is confirmed. */}
                      {next === "PICKUP_ASSIGNED" && (
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Delivery partner"
                            value={partnerInputs[r.id] || ""}
                            onChange={(e) =>
                              setPartnerInputs((p) => ({
                                ...p,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="text-sm border rounded-lg px-2 py-1"
                          />
                          <button
                            disabled={busy}
                            onClick={() => {
                              const p = partnerInputs[r.id]?.trim();
                              if (!p) {
                                alert("Enter a delivery partner.");
                                return;
                              }
                              transition(r.id, "PICKUP_ASSIGNED", undefined, p);
                            }}
                            className="text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white"
                          >
                            {busy ? "Saving…" : "Assign partner"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Legacy order-level returns, preserved. */}
        {legacy.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4 text-gray-700">
              Legacy order-level returns
            </h2>
            <div className="bg-white rounded-3xl shadow p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-100">
                    <th className="py-3 px-3 text-left">Order</th>
                    <th className="text-left">Customer</th>
                    <th className="text-left">Reason</th>
                    <th className="text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {legacy.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-3">
                        {String(item.orderId || "-").slice(0, 8)}
                      </td>
                      <td>{String(item.customerName || "-")}</td>
                      <td className="max-w-[240px]">
                        {String(item.reason || "-")}
                      </td>
                      <td>
                        <select
                          value={String(item.status || "Pending")}
                          onChange={(e) => updateLegacy(item.id, e.target.value)}
                          className="border p-2 rounded-lg"
                        >
                          <option>Pending</option>
                          <option>Approved</option>
                          <option>Rejected</option>
                          <option>Refunded</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
