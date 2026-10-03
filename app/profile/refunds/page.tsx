"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  fetchAccountReturns,
  formatDate,
  respondToPickup,
  type AccountReturns,
} from "@/lib/account/accountClient";
import { useRouter } from "next/navigation";
import { customerLoginUrl } from "@/lib/authRedirect";
import ProductImage from "@/components/ProductImage";

// Returns & Refunds. Everything comes from app/api/account/returns — the
// customer's own requests, legacy returns and ONE refund timeline across all
// three refund sources (item returns, cancelled online orders, legacy
// returns), as fixed fields. YOMICO proposes each pickup slot; the customer can
// confirm it or ask for another time (app/api/item-request/respond). The
// customer never picks the first slot.

type Tab = "requests" | "refunds";

const TONE: Record<string, string> = {
  ok: "bg-green-100 text-green-700",
  bad: "bg-red-100 text-red-700",
  running: "bg-blue-100 text-blue-700",
  idle: "bg-gray-100 text-gray-700",
};
const REFUND_TONE: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  "not-refunded": "bg-red-100 text-red-700",
  processing: "bg-blue-100 text-blue-700",
  due: "bg-amber-100 text-amber-800",
};

export default function RefundsPage() {
  const router = useRouter();
  const [data, setData] = useState<AccountReturns | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("requests");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counterInputs, setCounterInputs] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const result = await fetchAccountReturns();
    setData(result.data);
    setLoadError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Signed out: send to the customer login (back here afterwards) and stay
        // in the loading state meanwhile — never render a signed-out wallet/
        // refunds page as if it were an empty account.
        router.push(customerLoginUrl());
        return;
      }
      load();
    });
    return () => unsub();
  }, [load, router]);

  const respond = async (id: string, action: "accept" | "counter") => {
    setBusyId(id);
    setActionError((p) => ({ ...p, [id]: "" }));
    const counter = counterInputs[id];
    const result = await respondToPickup(
      id,
      action,
      action === "counter" && counter ? new Date(counter).toISOString() : undefined
    );
    setBusyId(null);
    if (result.error) {
      setActionError((p) => ({ ...p, [id]: result.error || "" }));
      return;
    }
    setCounterInputs((p) => ({ ...p, [id]: "" }));
    load();
  };

  const requests = data?.requests || [];
  const legacy = data?.legacyReturns || [];
  const refunds = data?.refunds || [];

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <Link href="/profile" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4">
          ← Back to Profile
        </Link>
        <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white p-6 sm:p-8 rounded-3xl mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold">Returns & Refunds</h1>
          <p className="opacity-90">Track your returns, pickups and every refund in one place</p>
        </div>

        <div className="mb-6 flex gap-2">
          {(["requests", "refunds"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-2xl px-5 py-2 font-semibold ${tab === t ? "bg-gray-900 text-white" : "bg-white text-gray-700 shadow"}`}
            >
              {t === "requests" ? `Returns & replacements (${requests.length + legacy.length})` : `Refunds (${refunds.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">Loading...</div>
        ) : loadError && !data ? (
          <div className="bg-red-50 rounded-3xl p-6 text-red-700">{loadError}</div>
        ) : tab === "requests" ? (
          requests.length === 0 && legacy.length === 0 ? (
            <div className="bg-white rounded-3xl shadow p-10 text-center text-gray-500">
              <p className="mb-4">You have no return or replacement requests yet.</p>
              <Link href="/orders" className="inline-block bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-semibold">
                View My Orders
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((r) => {
                const busy = busyId === r.id;
                return (
                  <div key={r.id} className="bg-white rounded-3xl shadow p-5">
                    <div className="flex items-center gap-4">
                      <ProductImage
                        src={r.item.image}
                        alt={r.item.name}
                        className="w-16 h-16 rounded-xl object-cover border shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{r.item.name}</p>
                        <p className="text-xs text-gray-500">
                          <span className="capitalize">{r.type}</span>
                          {r.requestNumber ? ` #${r.requestNumber}` : ""}
                          {r.orderNumber ? ` · Order ${r.orderNumber}` : ""} · Qty {r.item.qty}
                        </p>
                        <p className="text-xs text-gray-400">Requested {formatDate(r.createdAt)}</p>
                      </div>
                      <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${TONE[r.tone]}`}>{r.statusLabel}</span>
                    </div>

                    {r.step && (
                      <p className="mt-3 text-xs text-gray-500">
                        Step {r.step.index + 1} of {r.step.total}
                        {r.refund && r.refund.amount > 0
                          ? ` · Refund ₹${r.refund.amount.toLocaleString("en-IN")} as ${r.refund.destinationLabel}`
                          : r.type === "replace"
                          ? " · Replacement in progress"
                          : ""}
                      </p>
                    )}
                    {r.refund?.status === "credited" && (
                      <p className="mt-2 text-sm text-green-700">
                        ₹{r.refund.amount.toLocaleString("en-IN")} credited as {r.refund.destinationLabel}
                        {r.refund.creditedAt ? ` on ${formatDate(r.refund.creditedAt)}` : ""}
                        {r.refund.refundNumber ? ` · Ref ${r.refund.refundNumber}` : ""}
                      </p>
                    )}
                    {r.reason && <p className="mt-2 text-sm text-gray-600">Reason: {r.reason}</p>}

                    {r.pickup && r.pickup.canRespond && (
                      <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm text-gray-800">
                          {r.pickup.proposedAt ? (
                            <>
                              YOMICO proposed a pickup on{" "}
                              <span className="font-semibold">{formatDate(r.pickup.proposedAt, true)}</span>
                            </>
                          ) : (
                            "YOMICO has proposed a pickup time."
                          )}
                        </p>
                        {r.pickup.customerResponse === "countered" && r.pickup.counterAt && (
                          <p className="text-xs text-amber-700 mt-1">
                            You asked for {formatDate(r.pickup.counterAt, true)} — waiting for YOMICO to confirm a time.
                          </p>
                        )}
                        <div className="mt-3">
                          <button
                            disabled={busy}
                            onClick={() => respond(r.id, "accept")}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                          >
                            {busy ? "Saving…" : "Confirm this pickup time"}
                          </button>
                        </div>
                        {r.pickup.countersLeft > 0 ? (
                          <div className="mt-3">
                            <p className="text-gray-600 text-xs mb-1">
                              Ask for another time ({r.pickup.countersLeft} request{r.pickup.countersLeft === 1 ? "" : "s"} left)
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="datetime-local"
                                value={counterInputs[r.id] || ""}
                                onChange={(e) => setCounterInputs((p) => ({ ...p, [r.id]: e.target.value }))}
                                className="border rounded-xl px-3 py-2 text-sm"
                              />
                              <button
                                disabled={busy || !counterInputs[r.id]}
                                onClick={() => respond(r.id, "counter")}
                                className="bg-white border border-blue-300 text-blue-700 disabled:opacity-60 px-4 py-2 rounded-xl text-sm font-semibold"
                              >
                                {busy ? "Saving…" : "Request this time"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-gray-600">
                            You&apos;ve used all your requests for another time. Please confirm the proposed time or contact support.
                          </p>
                        )}
                        {actionError[r.id] && <p className="text-xs text-red-600 mt-2">{actionError[r.id]}</p>}
                      </div>
                    )}

                    {r.pickup && !r.pickup.canRespond && r.pickup.scheduledAt && !r.pickup.pickedUpAt && (
                      <p className="mt-3 text-sm text-gray-700">
                        Pickup confirmed for <span className="font-semibold">{formatDate(r.pickup.scheduledAt, true)}</span>
                        {r.pickup.partner ? ` · ${r.pickup.partner}` : ""}
                      </p>
                    )}
                    {r.pickup?.pickedUpAt && (
                      <p className="mt-3 text-sm text-gray-700">Picked up on {formatDate(r.pickup.pickedUpAt, true)}</p>
                    )}

                    {r.timeline.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-gray-500">Timeline</summary>
                        <ol className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3">
                          {r.timeline.map((t, i) => (
                            <li key={i} className="text-xs text-gray-600">
                              <span className="font-semibold">{t.label}</span>
                              {t.at ? ` · ${formatDate(t.at, true)}` : ""} · by {t.by}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                );
              })}

              {legacy.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wide">Earlier whole-order returns</h2>
                  <div className="space-y-3">
                    {legacy.map((item) => (
                      <div key={item.id} className="bg-white rounded-2xl shadow p-4 flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{item.orderNumber ? `Order ${item.orderNumber}` : "Order return"}</p>
                          {item.reason && <p className="text-sm text-gray-600">Reason: {item.reason}</p>}
                          <p className="text-xs text-gray-400">{formatDate(item.createdAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{item.status}</p>
                          {item.refundAmount > 0 && (
                            <p className="text-xs text-gray-500">₹{item.refundAmount.toLocaleString("en-IN")} · {item.refundMethod}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : refunds.length === 0 ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center text-gray-500">No refunds yet.</div>
        ) : (
          <div className="space-y-3">
            {refunds.map((f, i) => (
              <div key={`${f.source}-${f.reference}-${i}`} className="bg-white rounded-2xl shadow p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      ₹{f.amount.toLocaleString("en-IN")}{" "}
                      <span className="text-sm font-normal text-gray-500">
                        · {f.source === "order-cancellation" ? "Cancelled order" : "Return"}
                        {f.orderNumber ? ` · Order ${f.orderNumber}` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 break-words">
                      To {f.destinationLabel} · Ref {f.reference}
                      {f.providerReference ? ` · Payment ref …${f.providerReference}` : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {f.requestedAt ? `Requested ${formatDate(f.requestedAt)}` : ""}
                      {f.completedAt ? ` · Completed ${formatDate(f.completedAt)}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${REFUND_TONE[f.status]}`}>{f.statusLabel}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
