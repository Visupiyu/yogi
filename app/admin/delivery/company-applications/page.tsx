"use client";

// Admin — Delivery Company applications review (Phase 2).
//
// Lists deliveryCompanyApplications and lets an admin review the company,
// authorised-person and bank details plus the bank-proof document, then Approve
// or Reject. Approval goes through the server route
// (POST /api/delivery/admin/company-applications/[id]/approve), which creates
// the operational deliveryCompanies record (status Active) and ties ownerUid to
// the applicant's existing Auth uid via the existing owner-provisioning
// guardrails — no company-creation or owner logic is duplicated here, and no
// second Auth account is created. Reject is a direct admin status update.
//
// SECURITY: the bank proof is stored as a Storage object PATH. This page
// resolves it to a view URL ONLY on demand (a rules-checked admin getDownloadURL)
// and opens it transiently — never written back to Firestore, never logged.
import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { logAdminAction } from "@/lib/auditLog";

type CompanyApplication = {
  id: string;
  uid?: string;
  companyName?: string;
  legalName?: string;
  businessType?: string;
  gstNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  businessAddress?: { line?: string; city?: string; state?: string; pincode?: string };
  serviceAreas?: string[];
  bankAccountHolder?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  chequeDocPath?: string;
  authorisedPerson?: { name?: string; designation?: string; phone?: string; email?: string };
  status?: string;
  rejectionReason?: string;
  createdCompanyId?: string;
  createdAt?: { toDate?: () => Date } | null;
};

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const idToken = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

function fmtDate(v: CompanyApplication["createdAt"]): string {
  try { return v?.toDate ? v.toDate().toLocaleString() : "—"; } catch { return "—"; }
}

export default function AdminCompanyApplicationsPage() {
  const [apps, setApps] = useState<CompanyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CompanyApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = async () => {
    setError(null);
    try {
      const snap = await getDocs(collection(db, "deliveryCompanyApplications"));
      const items: CompanyApplication[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyApplication, "id">) }));
      items.sort((a, b) => {
        const rank = (s?: string) => (s === "Pending" || !s ? 0 : s === "Approved" ? 1 : 2);
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
        const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bt - at;
      });
      setApps(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const count = (s: string) => apps.filter((a) => (a.status || "Pending") === s).length;

  const viewDoc = async (path?: string) => {
    if (!path) { setFeedback({ type: "error", msg: "No document on file." }); return; }
    try {
      const url = await getDownloadURL(ref(storage, path));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setFeedback({ type: "error", msg: "Could not open the document. It may be missing or access was denied." });
    }
  };

  const refreshSelected = async () => {
    await load();
    setSelected((prev) => (prev ? apps.find((a) => a.id === prev.id) ?? prev : prev));
  };

  const approve = async (app: CompanyApplication) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      // Server route creates the Active company + ties ownerUid + marks the
      // application Approved (idempotent). We do NOT write the company or the
      // application status from the client.
      const res = await authedFetch(`/api/delivery/admin/company-applications/${encodeURIComponent(app.id)}/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not approve this application.");
      await logAdminAction("delivery_company_application_approved", app.id, { companyId: data?.companyId });
      setFeedback({ type: "success", msg: data?.alreadyApproved ? "Already approved — company exists." : "Approved. Company created and owner provisioned." });
      await refreshSelected();
    } catch (e) {
      setFeedback({ type: "error", msg: e instanceof Error ? e.message : "Approval failed." });
    } finally {
      setBusy(false);
    }
  };

  const reject = async (app: CompanyApplication) => {
    if (busy) return;
    const reason = window.prompt("Reason for rejecting this company application (optional):", "") ?? "";
    setBusy(true);
    setFeedback(null);
    try {
      await updateDoc(doc(db, "deliveryCompanyApplications", app.id), {
        status: "Rejected",
        reviewedBy: auth.currentUser?.uid || "admin",
        reviewedAt: serverTimestamp(),
        rejectionReason: reason.trim().slice(0, 500),
      });
      await logAdminAction("delivery_company_application_rejected", app.id, { uid: app.uid });
      setFeedback({ type: "success", msg: "Application rejected." });
      await refreshSelected();
    } catch (e) {
      setFeedback({ type: "error", msg: e instanceof Error ? e.message : "Rejection failed." });
    } finally {
      setBusy(false);
    }
  };

  const badge = (s?: string) => {
    const status = s || "Pending";
    const tone = status === "Approved" ? "bg-green-100 text-green-700" : status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800";
    return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-900 to-teal-700 p-6 text-white">
        <h1 className="text-2xl md:text-3xl font-bold">Delivery Company Applications</h1>
        <p className="opacity-90 text-sm">Review and approve companies applying to deliver for YOMICO.</p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Pending" value={count("Pending")} tone="text-amber-700" bg="bg-amber-50" />
        <Stat label="Approved" value={count("Approved")} tone="text-green-700" bg="bg-green-50" />
        <Stat label="Rejected" value={count("Rejected")} tone="text-red-700" bg="bg-red-50" />
      </div>

      {feedback && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      <div className="mb-3 flex justify-end">
        <button onClick={() => { setLoading(true); void load(); }} disabled={loading} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-gray-500">Loading applications…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">{error}</div>
      ) : apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-gray-500">No applications yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Authorised person</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{a.companyName || "—"}</td>
                  <td className="px-3 py-2">{a.authorisedPerson?.name || "—"}</td>
                  <td className="px-3 py-2">{a.contactPhone || a.contactEmail || "—"}</td>
                  <td className="px-3 py-2">{a.businessAddress?.city || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(a.createdAt)}</td>
                  <td className="px-3 py-2">{badge(a.status)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => { setSelected(a); setFeedback(null); }} className="rounded border px-2 py-1 text-xs hover:bg-gray-100">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{selected.companyName || "Application"}</h2>
              <button onClick={() => setSelected(null)} className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100">✕</button>
            </div>
            <div className="mb-3">{badge(selected.status)}</div>

            <Group title="Company">
              <Row k="Company name" v={selected.companyName} />
              <Row k="Legal name" v={selected.legalName} />
              <Row k="Business type" v={selected.businessType} />
              <Row k="GSTIN" v={selected.gstNumber} />
              <Row k="Service areas" v={(selected.serviceAreas || []).join(", ")} />
            </Group>
            <Group title="Business contact & address">
              <Row k="Contact email" v={selected.contactEmail} />
              <Row k="Contact phone" v={selected.contactPhone} />
              <Row k="Address" v={selected.businessAddress?.line} />
              <Row k="City" v={selected.businessAddress?.city} />
              <Row k="State" v={selected.businessAddress?.state} />
              <Row k="PIN code" v={selected.businessAddress?.pincode} />
            </Group>
            <Group title="Authorised person">
              <Row k="Name" v={selected.authorisedPerson?.name} />
              <Row k="Designation" v={selected.authorisedPerson?.designation} />
              <Row k="Phone" v={selected.authorisedPerson?.phone} />
              <Row k="Email (login)" v={selected.authorisedPerson?.email} />
            </Group>
            <Group title="Bank">
              <Row k="Account holder" v={selected.bankAccountHolder} />
              <Row k="Bank" v={selected.bankName} />
              <Row k="Account number" v={selected.accountNumber} />
              <Row k="IFSC" v={selected.ifsc} />
            </Group>
            <Group title="Documents">
              <button onClick={() => void viewDoc(selected.chequeDocPath)} className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 text-left">
                📄 View bank cancelled cheque / proof
              </button>
              <p className="mt-2 text-[11px] text-gray-400">Opens in a new tab via a private, access-controlled link.</p>
            </Group>

            {selected.status === "Approved" && selected.createdCompanyId ? (
              <p className="mt-2 rounded bg-green-50 px-3 py-2 text-xs text-green-700">Company created · id {selected.createdCompanyId}</p>
            ) : null}
            {selected.status === "Rejected" && selected.rejectionReason ? (
              <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">Reason: {selected.rejectionReason}</p>
            ) : null}

            {(selected.status || "Pending") === "Pending" ? (
              <div className="mt-5 flex gap-2 border-t pt-4">
                <button onClick={() => void approve(selected)} disabled={busy} className="flex-1 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Working…" : "Approve"}
                </button>
                <button onClick={() => void reject(selected)} disabled={busy} className="flex-1 rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">
                  Reject
                </button>
              </div>
            ) : (
              <p className="mt-5 border-t pt-4 text-sm text-gray-500">This application has been {(selected.status || "").toLowerCase()}.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, bg }: { label: string; value: number; tone: string; bg: string }) {
  return (
    <div className={`rounded-2xl border ${bg} p-4`}>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs font-medium text-gray-500">{label}</p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-gray-100 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-gray-400">{k}</dt>
      <dd className="text-right text-gray-800 break-all">{v || "—"}</dd>
    </div>
  );
}
