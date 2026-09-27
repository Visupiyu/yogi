"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { CHANGE_SECTION_LABELS, FIELD_LABELS, type ChangeSection } from "@/lib/sellerBusiness";

// Admin review of seller business-change requests. Every read and decision
// goes through /api/admin/business-change-requests (admin-verified on the
// server); this page never writes a vendor record itself.

type AdminRequest = {
  id: string;
  vendorUid: string;
  vendorDocId: string;
  vendorName: string;
  section: ChangeSection | null;
  fields: string[];
  status: string;
  changes: Record<string, string>;
  previous: Record<string, string>;
  hasDocument: boolean;
  createdAt: string | null;
  decidedAt: string | null;
  decidedBy: string;
  decisionReason: string;
};

const FILTERS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"] as const;

function when(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-IN");
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("signed-out");
  const token = await user.getIdToken();
  return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } });
}

export default function AdminBusinessRequestsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/admin/business-change-requests?status=${status}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Could not load change requests.");
        return;
      }
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      alert("Could not load change requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) void load(filter);
    });
    return () => unsubscribe();
  }, [filter, load]);

  const decide = async (r: AdminRequest, action: "APPROVE" | "REJECT") => {
    let reason = "";
    if (action === "REJECT") {
      const input = window.prompt("Reason for rejecting this change (the seller will see it):");
      if (input === null) return;
      reason = input.trim();
      if (reason.length < 3) {
        alert("A rejection reason is required.");
        return;
      }
    } else if (!confirm(`Approve this ${r.section ? CHANGE_SECTION_LABELS[r.section].toLowerCase() : ""} change for ${r.vendorName || "this seller"}?`)) {
      return;
    }
    setBusy(r.id);
    try {
      const res = await authedFetch("/api/admin/business-change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: r.id, action, ...(reason ? { reason } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data?.error || "Could not save this decision.");
      await load(filter);
    } catch {
      alert("Could not save this decision.");
    } finally {
      setBusy("");
    }
  };

  const viewDocument = async (r: AdminRequest) => {
    try {
      const res = await authedFetch(
        `/api/admin/business-change-requests/document?requestId=${encodeURIComponent(r.id)}&mode=view`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || `Could not open this document. (HTTP ${res.status})`);
        return;
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      alert("Could not open this document.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 sm:p-8 rounded-3xl mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold">Seller Business Changes</h1>
          <p className="opacity-90">Review sellers&apos; requests to change business, contact, address and bank details</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                filter === f ? "bg-indigo-600 text-white" : "bg-white hover:bg-gray-50"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">No change requests.</div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => (
              <div key={r.id} className="bg-white rounded-3xl shadow p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold break-words">{r.vendorName || "Seller"}</h2>
                    <p className="text-sm text-gray-500">
                      {r.section ? CHANGE_SECTION_LABELS[r.section] : "Unknown section"} · requested {when(r.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100">{r.status}</span>
                </div>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-2">Field</th>
                        <th className="text-left px-2">Current</th>
                        <th className="text-left px-2">Requested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(r.changes).map((f) => (
                        <tr key={f} className="border-b">
                          <td className="py-2 px-2">{FIELD_LABELS[f as keyof typeof FIELD_LABELS] || f}</td>
                          <td className="px-2 break-all">{r.previous[f] || "-"}</td>
                          <td className="px-2 break-all font-semibold">{r.changes[f] || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {r.decidedAt && (
                  <p className="text-sm text-gray-500 mt-3">
                    Decided {when(r.decidedAt)}{r.decidedBy ? ` by ${r.decidedBy}` : ""}
                    {r.decisionReason ? ` — ${r.decisionReason}` : ""}
                  </p>
                )}

                <div className="flex flex-wrap gap-3 mt-4">
                  {r.hasDocument && (
                    <button
                      onClick={() => viewDocument(r)}
                      className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold"
                    >
                      View proof document
                    </button>
                  )}
                  {r.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => decide(r, "APPROVE")}
                        disabled={busy === r.id}
                        className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(r, "REJECT")}
                        disabled={busy === r.id}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
