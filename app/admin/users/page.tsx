"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { toast } from "sonner";

// Admin access is AUTHORITATIVE here: the list comes from /api/admin/staff,
// which reads the same adminRoles records firestore.rules' isAdmin() and every
// admin API consult (lib/adminAccess). Only the owner account can grant or
// revoke; other admins see the list read-only.
//
// The old "staff" table (adminUsers collection) never granted access — it is
// kept below, clearly labelled, only so existing entries can be reviewed and
// removed.

type AdminRow = {
  uid: string;
  email: string;
  active: boolean;
  grantedByEmail: string;
  grantedAt: string | null;
  revokedAt: string | null;
};

type LegacyRow = { id: string; name: string; email: string; role: string; status: string };

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("en-IN") : "—";
}

export default function AdminUsersPage() {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [legacy, setLegacy] = useState<LegacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch("/api/admin/staff");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "load failed");
      setOwnerEmail(String(data.owner?.email || ""));
      setAdmins(Array.isArray(data.admins) ? data.admins : []);
      setViewerIsOwner(data.viewerIsOwner === true);
    } catch {
      setLoadError("We couldn't load admin access. Please check your connection and try again.");
    }
    try {
      const snapshot = await getDocs(collection(db, "adminUsers"));
      setLegacy(
        snapshot.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: typeof data.name === "string" ? data.name : "—",
            email: typeof data.email === "string" ? data.email : "—",
            role: typeof data.role === "string" ? data.role : "—",
            status: typeof data.status === "string" ? data.status : "—",
          };
        })
      );
    } catch {
      setLegacy([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grant = async () => {
    const email = grantEmail.trim().toLowerCase();
    if (!email) return;
    if (!confirm(`Give ${email} FULL admin access to YOMICO?\n\nThey will be able to manage orders, refunds, sellers, payouts and settings.`)) return;
    setBusy(true);
    try {
      const res = await authedFetch("/api/admin/staff", { method: "POST", body: JSON.stringify({ action: "grant", email }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "Couldn't grant admin access.");
        return;
      }
      toast.success(`${data.email || email} is now an admin.`);
      setGrantEmail("");
      await load();
    } catch {
      toast.error("Couldn't grant admin access. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: AdminRow) => {
    if (!confirm(`Revoke admin access for ${row.email}?\n\nIt stops working within about a minute.`)) return;
    setBusy(true);
    try {
      const res = await authedFetch("/api/admin/staff", { method: "POST", body: JSON.stringify({ action: "revoke", uid: row.uid }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "Couldn't revoke admin access.");
        return;
      }
      toast.success(`Admin access revoked for ${row.email}.`);
      await load();
    } catch {
      toast.error("Couldn't revoke admin access. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const deleteLegacy = async (row: LegacyRow) => {
    if (!confirm(`Delete the old directory entry for ${row.email}?\n\nThis entry never granted access; deleting it changes nothing about who can sign in.`)) return;
    try {
      await deleteDoc(doc(db, "adminUsers", row.id));
      toast.success("Directory entry deleted.");
      setLegacy((rows) => rows.filter((r) => r.id !== row.id));
    } catch {
      toast.error("Delete failed.");
    }
  };

  const activeCount = admins.filter((a) => a.active).length;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 sm:p-8 rounded-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold">Admin Access</h1>
          <p className="opacity-90">Who can sign in to the YOMICO admin panel</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-4 mb-6 text-sm">
          This list is what actually grants access. An account is an admin only if it is the owner account or has an
          active role below — both require a verified email. {viewerIsOwner
            ? "As the owner, you can grant and revoke access."
            : "Only the owner account can grant or revoke access."}
        </div>

        {loadError && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 mb-6 text-sm">
            {loadError}{" "}
            <button onClick={() => void load()} className="underline font-semibold">Retry</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-bold">Owner</h2>
            <p className="text-gray-700 mt-2 break-all">{ownerEmail || "—"}</p>
            <p className="text-xs text-gray-500 mt-1">Always an admin. Cannot be revoked.</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-xl font-bold">Granted admins</h2>
            <p className="text-4xl font-bold text-green-600 mt-2">{activeCount}</p>
          </div>
        </div>

        {viewerIsOwner && (
          <div className="bg-white rounded-2xl shadow p-6 mb-8">
            <h2 className="text-lg font-bold mb-1">Grant admin access</h2>
            <p className="text-sm text-gray-600 mb-4">
              The person must already have a YOMICO account with a verified email. Seller and delivery accounts
              can't be made admins — use a separate account.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                aria-label="Email to grant admin access"
                placeholder="name@example.com"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                className="flex-1 min-w-0 border p-3 rounded-xl"
              />
              <button
                onClick={() => void grant()}
                disabled={busy || !grantEmail.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 transition text-white px-6 py-3 rounded-xl"
              >
                Grant access
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl shadow p-10 text-center">Loading admin access…</div>
        ) : (
          <div className="bg-white rounded-2xl shadow p-6 overflow-x-auto mb-8">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-4 px-3">Email</th>
                  <th className="text-left py-4">Status</th>
                  <th className="text-left py-4">Granted by</th>
                  <th className="text-left py-4">Granted</th>
                  <th className="text-left py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-500">
                      No admin roles have been granted. Only the owner account has access.
                    </td>
                  </tr>
                ) : (
                  admins.map((row) => (
                    <tr key={row.uid} className="border-b hover:bg-gray-50">
                      <td className="py-4 px-3 break-all">{row.email}</td>
                      <td>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            row.active ? "bg-green-600 text-white" : "bg-gray-300 text-gray-800"
                          }`}
                        >
                          {row.active ? "Active" : `Revoked ${formatDate(row.revokedAt)}`}
                        </span>
                      </td>
                      <td className="break-all">{row.grantedByEmail || "—"}</td>
                      <td>{formatDate(row.grantedAt)}</td>
                      <td>
                        {viewerIsOwner && row.active ? (
                          <button
                            onClick={() => void revoke(row)}
                            disabled={busy}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 transition text-white px-3 py-1 rounded-lg"
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {legacy.length > 0 && (
          <div className="bg-white rounded-2xl shadow p-6 overflow-x-auto">
            <h2 className="text-lg font-bold">Old staff directory (does not grant access)</h2>
            <p className="text-sm text-gray-600 mb-4">
              These entries were a contact list only. Nobody below can sign in to the admin panel unless they also
              appear in the access list above.
            </p>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-3 px-3">Name</th>
                  <th className="text-left py-3">Email</th>
                  <th className="text-left py-3">Label</th>
                  <th className="text-left py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {legacy.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-3 px-3">{row.name}</td>
                    <td className="break-all">{row.email}</td>
                    <td className="text-gray-600 text-sm">
                      {row.role} · {row.status}
                    </td>
                    <td>
                      <button
                        onClick={() => void deleteLegacy(row)}
                        className="bg-gray-200 hover:bg-gray-300 transition text-gray-800 px-3 py-1 rounded-lg text-sm"
                      >
                        Delete entry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
