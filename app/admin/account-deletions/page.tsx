"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { AdminDeletionRequestView } from "@/lib/account/deletionRequests";

// Customer account deletion requests (app/api/admin/account-deletions).
//
// Processing is MANUAL. Marking a request "Completed" only records that the
// admin has finished the steps outside this app — it deletes nothing and
// blocks nothing. Orders, invoices/GST, payments, refunds and reward records
// must be kept as required by law.

type Filter = "open" | "all";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  in_review: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};

async function adminFetch(url: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Something went wrong.");
  return body;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "-";

export default function AdminAccountDeletionsPage() {
  const [filter, setFilter] = useState<Filter>("open");
  const [requests, setRequests] = useState<AdminDeletionRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    try {
      const body = await adminFetch(`/api/admin/account-deletions?status=${f}`);
      setRequests(Array.isArray(body.requests) ? body.requests : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) load(filter);
    });
    return () => unsub();
  }, [filter, load]);

  const decide = async (r: AdminDeletionRequestView, status: "in_review" | "completed" | "rejected") => {
    const customerMessage = (messages[r.uid] || "").trim();
    const internalNote = (notes[r.uid] || "").trim();
    if (status === "rejected" && !customerMessage) {
      alert("Add a message telling the customer why the request was not approved.");
      return;
    }
    if (
      status === "completed" &&
      !confirm(
        "Mark as COMPLETED only after you have finished the manual steps outside YOMICO.\n\nThis records the decision — it does not delete or block anything."
      )
    ) {
      return;
    }
    setBusy(r.uid);
    try {
      await adminFetch(`/api/admin/account-deletions/${encodeURIComponent(r.uid)}`, {
        method: "POST",
        body: JSON.stringify({
          status,
          ...(customerMessage ? { customerMessage } : {}),
          ...(internalNote ? { internalNote } : {}),
        }),
      });
      await load(filter);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="bg-gradient-to-r from-gray-800 to-red-700 text-white rounded-3xl p-8 mb-6">
        <h1 className="text-3xl font-bold">🗑 Account Deletion Requests</h1>
        <p className="mt-2 opacity-90">
          Customers ask; you process by hand. Nothing here deletes or blocks an account, and orders, invoices/GST,
          payments, refunds and reward records must be kept.
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {(["open", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-2xl px-5 py-2 font-semibold ${filter === f ? "bg-gray-900 text-white" : "bg-white text-gray-700 shadow"}`}
          >
            {f === "open" ? "Open" : "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-3xl shadow p-10 text-center">Loading...</div>
      ) : error ? (
        <div className="bg-red-50 rounded-3xl p-6 text-red-700">{error}</div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-3xl shadow p-10 text-center text-gray-500">No requests.</div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => {
            const open = r.status === "pending" || r.status === "in_review";
            return (
              <div key={r.uid} className="bg-white rounded-3xl shadow p-6 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold">{r.name || "Customer"}</p>
                    <p className="text-sm text-gray-600 break-all">{r.email}</p>
                    <p className="text-xs text-gray-400 break-all">uid {r.uid}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Requested {fmt(r.requestedAt)} · updated {fmt(r.updatedAt)}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[r.status] || ""}`}>{r.status}</span>
                </div>

                {r.reason && <p className="text-sm text-gray-700">Reason: {r.reason}</p>}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-sm">
                  {[
                    ["Orders", r.account.orders],
                    ["Open orders", r.account.openOrders],
                    ["Open returns", r.account.openReturns],
                    ["Refunds due", r.account.refundsDue],
                    ["Reward points", r.account.rewardBalance],
                  ].map(([label, value]) => (
                    <div key={String(label)} className={`rounded-xl border p-2 ${Number(value) > 0 && label !== "Orders" ? "border-amber-300 bg-amber-50" : ""}`}>
                      <p className="text-gray-500">{label}</p>
                      <p className="font-bold">{value}</p>
                    </div>
                  ))}
                </div>

                {r.customerMessage && <p className="text-sm text-gray-700">Message to customer: {r.customerMessage}</p>}
                {r.internalNote && <p className="text-sm text-gray-500">Internal note: {r.internalNote}</p>}

                {open && (
                  <div className="space-y-2">
                    <textarea
                      value={messages[r.uid] || ""}
                      maxLength={500}
                      onChange={(e) => setMessages((p) => ({ ...p, [r.uid]: e.target.value }))}
                      placeholder="Message to the customer (shown on their Account & Security page; required to reject)"
                      className="w-full rounded-xl border p-3 text-sm"
                      rows={2}
                    />
                    <textarea
                      value={notes[r.uid] || ""}
                      maxLength={1000}
                      onChange={(e) => setNotes((p) => ({ ...p, [r.uid]: e.target.value }))}
                      placeholder="Internal note (admins only)"
                      className="w-full rounded-xl border p-3 text-sm"
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-2">
                      {r.status === "pending" && (
                        <button
                          disabled={busy === r.uid}
                          onClick={() => decide(r, "in_review")}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          Mark in review
                        </button>
                      )}
                      <button
                        disabled={busy === r.uid}
                        onClick={() => decide(r, "completed")}
                        className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Mark completed
                      </button>
                      <button
                        disabled={busy === r.uid}
                        onClick={() => decide(r, "rejected")}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
