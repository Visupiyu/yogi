"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import {
  BUSINESS_TYPES,
  CHANGE_SECTIONS,
  CHANGE_SECTION_LABELS,
  FIELD_LABELS,
  sectionRequiresDocument,
  type ChangeSection,
  type SellerBusinessView,
} from "@/lib/sellerBusiness";

// Seller Business — the seller's business details as the server holds them.
// Everything is read from /api/seller/business (masked where sensitive); a
// change is a REQUEST an admin approves (/api/seller/business/change-request).
// Nothing on this page writes the vendor record directly.

type RequestView = {
  id: string;
  section: ChangeSection | null;
  status: string;
  changes: Record<string, string>;
  previous: Record<string, string>;
  hasDocument: boolean;
  createdAt: string | null;
  decidedAt: string | null;
  decisionReason: string;
};

function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function when(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-IN");
}

function badgeClass(value: string | null): string {
  const v = (value || "").toUpperCase();
  if (v === "APPROVED" || v === "VERIFIED") return "bg-green-100 text-green-700";
  if (v === "REJECTED" || v === "BLOCKED") return "bg-red-100 text-red-700";
  if (v === "CANCELLED") return "bg-gray-100 text-gray-600";
  return "bg-yellow-100 text-yellow-700";
}

function Badge({ label, value }: { label: string; value: string | null }) {
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badgeClass(value)}`}>
      {label}: {value || "Not set"}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 break-all sm:text-right">{value || "-"}</span>
    </div>
  );
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("signed-out");
  const token = await user.getIdToken();
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
  });
}

export default function SellerBusinessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<SellerBusinessView | null>(null);
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [editing, setEditing] = useState<ChangeSection | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [confirmAccount, setConfirmAccount] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One key per submission attempt, kept until the server answers, so a retry
  // after a network failure cannot create a second request.
  const pendingKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await authedFetch("/api/seller/business");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not load your business profile.");
        return;
      }
      setProfile(data.profile);
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      setError("Could not load your business profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) void load();
      else setLoading(false);
    });
    return () => unsubscribe();
  }, [load]);

  const pendingFor = (section: ChangeSection) =>
    requests.find((r) => r.section === section && r.status === "PENDING") || null;

  const startEdit = (section: ChangeSection) => {
    if (!profile) return;
    const current: Record<string, string> = {
      ...profile.business,
      ...profile.contact,
      ...profile.address,
      accountHolder: profile.bank.accountHolder,
      bankName: profile.bank.bankName,
      ifsc: profile.bank.ifsc,
      // The stored account number is never sent to the browser; a bank change
      // always re-enters the full new number.
      accountNumber: "",
    };
    const next: Record<string, string> = {};
    for (const f of CHANGE_SECTIONS[section]) next[f] = current[f] || "";
    setForm(next);
    setConfirmAccount("");
    setProof(null);
    pendingKey.current = null;
    setEditing(section);
  };

  const submit = async () => {
    if (!editing) return;
    const user = auth.currentUser;
    if (!user) {
      alert("Please sign in again.");
      return;
    }
    if (editing === "bank") {
      if (form.accountNumber.replace(/\s/g, "") !== confirmAccount.replace(/\s/g, "")) {
        alert("The account numbers do not match.");
        return;
      }
      if (!proof) {
        alert("Upload a cancelled cheque or bank statement for the new account.");
        return;
      }
    }
    setSubmitting(true);
    try {
      let documentPath: string | undefined;
      if (sectionRequiresDocument(editing) && proof) {
        // The seller's own KYC folder: storage.rules allow the owner to create
        // new image/PDF files there (< 10MB) and never to replace or delete one.
        const safeName = proof.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").slice(0, 80);
        documentPath = `vendor-kyc/${user.uid}/bankproof-${Date.now()}-${safeName}`;
        await uploadBytes(ref(storage, documentPath), proof);
      }
      const key = pendingKey.current || newKey();
      pendingKey.current = key;
      const res = await authedFetch("/api/seller/business/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          section: editing,
          values: form,
          idempotencyKey: key,
          ...(documentPath ? { documentPath } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status < 500) pendingKey.current = null;
      if (!res.ok) {
        alert(data?.error || "Could not submit your request.");
        return;
      }
      alert("Your change request was sent to the YOMICO team for review.");
      setEditing(null);
      await load();
    } catch {
      alert("Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (!confirm("Cancel this change request?")) return;
    try {
      const res = await authedFetch("/api/seller/business/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data?.error || "Could not cancel this request.");
      await load();
    } catch {
      alert("Could not cancel this request.");
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-100 p-4 md:p-6">Loading...</div>;
  }
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 md:p-6">
        <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow p-8 text-red-600">
          {error || "Could not load your business profile."}
        </div>
      </div>
    );
  }

  const sectionCard = (section: ChangeSection, rows: { label: string; value: string }[], note?: string) => {
    const pending = pendingFor(section);
    return (
      <div className="bg-white rounded-3xl shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-bold">{CHANGE_SECTION_LABELS[section]}</h2>
          {pending ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
                Change pending review
              </span>
              <button
                onClick={() => cancelRequest(pending.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Cancel request
              </button>
            </div>
          ) : (
            <button
              onClick={() => startEdit(section)}
              className="text-sm bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl font-semibold"
            >
              Request change
            </button>
          )}
        </div>
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
        {note && <p className="text-xs text-gray-500 mt-3">{note}</p>}
        {pending && (
          <div className="mt-4 bg-yellow-50 rounded-xl p-4 text-sm">
            <p className="font-semibold mb-2">Requested on {when(pending.createdAt)}</p>
            {Object.keys(pending.changes).map((f) => (
              <p key={f} className="break-all">
                {FIELD_LABELS[f as keyof typeof FIELD_LABELS] || f}: {pending.previous[f] || "-"} →{" "}
                <strong>{pending.changes[f] || "-"}</strong>
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 sm:p-8 rounded-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold">Seller Business</h1>
          <p className="opacity-90 mt-1 break-words">
            {profile.business.businessName || "Your business"}
            {profile.sellerNumber ? ` · ${profile.sellerNumber}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge label="Account" value={profile.accountStatus} />
            <Badge label="KYC" value={profile.kycStatus} />
            <Badge label="GST" value={profile.tax.verificationStatus} />
            <Badge label="Login email" value={profile.emailVerified ? "Verified" : "Not verified"} />
          </div>
        </div>

        <p className="text-sm text-gray-600">
          Business, contact, address and bank details are verified by YOMICO. Changes are sent
          for review and apply only once approved. Store logo, banner and description are edited
          in <Link href="/seller/settings" className="text-blue-600 hover:underline">Store Settings</Link>.
        </p>

        {sectionCard("business", [
          { label: "Business name", value: profile.business.businessName },
          { label: "Owner name", value: profile.business.fullName },
          { label: "Business type", value: profile.business.businessType },
        ])}

        {sectionCard("contact", [
          { label: "Business phone", value: profile.contact.businessPhone },
          { label: "Business email", value: profile.contact.email },
        ], "Your login email is managed separately and is not changed by this request.")}

        {sectionCard("address", [
          { label: "Street / area", value: profile.address.street },
          { label: "Unit / building", value: profile.address.unit },
          { label: "City", value: profile.address.city },
          { label: "State", value: profile.address.state },
          { label: "PIN code", value: profile.address.zipCode },
        ], "Returns are collected from this address.")}

        {sectionCard("bank", [
          { label: "Account holder", value: profile.bank.accountHolder },
          { label: "Bank", value: profile.bank.bankName },
          { label: "Account number", value: profile.bank.accountNumberMasked },
          { label: "IFSC", value: profile.bank.ifsc },
          { label: "Last changed", value: profile.bank.updatedAt ? when(profile.bank.updatedAt) : "At registration" },
        ], "Payouts are sent to this account. A change needs a cancelled cheque or bank statement.")}

        <div className="bg-white rounded-3xl shadow p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xl font-bold">GST &amp; tax</h2>
            <Link href="/seller/tax" className="text-sm bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl font-semibold">
              Manage tax profile
            </Link>
          </div>
          <Row label="GST status" value={profile.tax.gstStatus || "Not set"} />
          <Row label="GSTIN" value={profile.tax.gstin} />
          <Row label="Legal name" value={profile.tax.legalName} />
          <Row label="Trade name" value={profile.tax.tradeName} />
          <Row label="Verification" value={profile.tax.verificationStatus || "Not submitted"} />
          {profile.tax.rejectionReason && <Row label="Reason" value={profile.tax.rejectionReason} />}
        </div>

        <div className="bg-white rounded-3xl shadow p-6">
          <h2 className="text-xl font-bold mb-3">Identity &amp; KYC</h2>
          <Row label="PAN" value={profile.identity.panMasked} />
          <Row label="Aadhaar" value={profile.identity.aadhaarMasked} />
          <Row label="GST number declared at registration" value={profile.identity.gstNumberDeclared} />
          <Row label="GST certificate" value={profile.documents.gst ? "On file" : "Not uploaded"} />
          <Row label="Aadhaar document" value={profile.documents.aadhaar ? "On file" : "Not uploaded"} />
          <Row label="Cancelled cheque" value={profile.documents.cheque ? "On file" : "Not uploaded"} />
          <Row label="Seller agreement" value={profile.agreementAccepted ? "Accepted at registration" : "Not recorded"} />
          <p className="text-xs text-gray-500 mt-3">
            Identity numbers and KYC documents are verified by YOMICO and cannot be changed here.
            Contact support if they need correcting.
          </p>
        </div>

        {requests.length > 0 && (
          <div className="bg-white rounded-3xl shadow p-6">
            <h2 className="text-xl font-bold mb-3">Change requests</h2>
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="border rounded-xl p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{r.section ? CHANGE_SECTION_LABELS[r.section] : "Change"}</span>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badgeClass(r.status)}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-gray-500 mt-1">Requested {when(r.createdAt)}</p>
                  {r.decidedAt && <p className="text-gray-500">Decided {when(r.decidedAt)}</p>}
                  {r.decisionReason && <p className="text-red-600 mt-1">Reason: {r.decisionReason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-1">Request change: {CHANGE_SECTION_LABELS[editing]}</h2>
            <p className="text-sm text-gray-500 mb-4">
              Your current details stay in place until YOMICO approves the change.
            </p>
            <div className="space-y-3">
              {(CHANGE_SECTIONS[editing] as readonly string[]).map((field) => (
                <div key={field}>
                  <label className="text-sm font-semibold">
                    {FIELD_LABELS[field as keyof typeof FIELD_LABELS]}
                  </label>
                  {field === "businessType" ? (
                    <select
                      className="w-full mt-1 border rounded-xl p-3"
                      value={form[field] || ""}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    >
                      <option value="">Select</option>
                      {BUSINESS_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="w-full mt-1 border rounded-xl p-3"
                      value={form[field] || ""}
                      inputMode={["businessPhone", "zipCode", "accountNumber"].includes(field) ? "numeric" : undefined}
                      autoComplete="off"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [field]: field === "ifsc" ? e.target.value.toUpperCase() : e.target.value,
                        })
                      }
                    />
                  )}
                </div>
              ))}
              {editing === "bank" && (
                <>
                  <div>
                    <label className="text-sm font-semibold">Confirm account number</label>
                    <input
                      className="w-full mt-1 border rounded-xl p-3"
                      value={confirmAccount}
                      inputMode="numeric"
                      autoComplete="off"
                      onChange={(e) => setConfirmAccount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold">Cancelled cheque or bank statement (image or PDF, under 10MB)</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="w-full mt-1 text-sm"
                      onChange={(e) => setProof(e.target.files?.[0] || null)}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-3 mt-6">
              <button
                onClick={() => setEditing(null)}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 font-semibold"
              >
                Close
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit for review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
