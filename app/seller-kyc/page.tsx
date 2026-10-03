"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { vendorKycPath } from "@/lib/storagePaths";
import { KYC_FIELDS, type KycDocument, type KycField } from "@/lib/sellerKyc";

// /seller-kyc — the seller's KYC status. Outside /seller on purpose: the
// seller dashboard is only for Approved sellers (app/seller/layout.js), and
// this page is where a Pending or Rejected seller lands instead
// (app/vendor-login). A Rejected seller sees the admin's reason here, corrects
// the details or uploads new documents, and resubmits for review
// (app/api/seller/kyc). Nothing here can approve anything.

type KycView = {
  kycStatus: "Pending" | "Approved" | "Rejected";
  status: string;
  rejectionReason: string | null;
  rejectedAt: string | null;
  resubmittedAt: string | null;
  values: Record<KycField, string>;
  documents: Record<KycDocument, boolean>;
};

const FIELD_LABELS: Record<KycField, string> = {
  gstNumber: "GSTIN (optional)",
  panNumber: "PAN",
  aadhaarNumber: "Aadhaar number",
  accountHolder: "Account holder name",
  bankName: "Bank name",
  accountNumber: "Account number",
  ifsc: "IFSC",
};

const DOC_LABELS: Record<KycDocument, string> = {
  gst: "GST certificate",
  aadhaar: "Aadhaar card",
  cheque: "Cancelled cheque",
};

const MAX_DOC_BYTES = 10 * 1024 * 1024;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default function SellerKycPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<KycView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<KycField, string> | null>(null);
  const [files, setFiles] = useState<Partial<Record<KycDocument, File>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); }), []);

  const load = useCallback(async (u: User) => {
    setLoadError(null);
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/seller/kyc", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoadError(data?.error || "Could not load your KYC status."); return; }
      setView(data as KycView);
      setValues((data as KycView).values);
    } catch {
      setLoadError("Could not load your KYC status. Please check your connection and try again.");
    }
  }, []);

  useEffect(() => { if (user) void load(user); }, [user, load]);

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("vendor");
    router.replace("/vendor-login");
  };

  const resubmit = async () => {
    if (!user || !values) return;
    setFormError(null);
    for (const [key, file] of Object.entries(files) as [KycDocument, File][]) {
      if (file.size >= MAX_DOC_BYTES) { setFormError(`${DOC_LABELS[key]}: the file must be smaller than 10 MB.`); return; }
      if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
        setFormError(`${DOC_LABELS[key]}: upload an image or a PDF.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const documents: Partial<Record<KycDocument, string>> = {};
      for (const [key, file] of Object.entries(files) as [KycDocument, File][]) {
        const path = vendorKycPath(user.uid, key, file);
        await uploadBytes(ref(storage, path), file, { contentType: file.type });
        documents[key] = path;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/seller/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ values, documents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data?.error || "Could not resubmit. Please try again."); return; }
      setSubmitted(true);
      setFiles({});
      await load(user);
    } catch {
      setFormError("Could not upload your documents. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  let body: React.ReactNode;
  if (!authReady) {
    body = <p className="text-gray-600">Loading…</p>;
  } else if (!user) {
    body = (
      <div className="space-y-3">
        <p className="text-gray-700">Please log in to your seller account to see your KYC status.</p>
        <Link href="/vendor-login" className="inline-block rounded-xl bg-green-600 px-5 py-3 font-semibold text-white">Seller login</Link>
      </div>
    );
  } else if (loadError) {
    body = (
      <div className="space-y-3">
        <p className="text-red-700">{loadError}</p>
        <button onClick={() => void load(user)} className="rounded-xl border px-4 py-2">Try again</button>
      </div>
    );
  } else if (!view || !values) {
    body = <p className="text-gray-600">Loading your KYC status…</p>;
  } else if (view.status === "Blocked") {
    body = <p className="text-gray-700">Your seller account has been blocked. Please <Link className="text-blue-600 underline" href="/contact">contact support</Link>.</p>;
  } else if (view.kycStatus === "Approved") {
    body = (
      <div className="space-y-3">
        <p className="rounded-xl bg-green-50 p-4 text-green-800">Your KYC is approved.</p>
        <Link href="/seller" className="inline-block rounded-xl bg-green-600 px-5 py-3 font-semibold text-white">Go to your seller dashboard</Link>
      </div>
    );
  } else if (view.kycStatus === "Pending") {
    body = (
      <div className="space-y-3">
        {submitted && <p className="rounded-xl bg-green-50 p-4 text-green-800">Thank you — your corrections were sent for review.</p>}
        <p className="rounded-xl bg-amber-50 p-4 text-amber-900">
          Your KYC is under review. You can start selling once it is approved — check back here for the decision.
          {view.resubmittedAt ? ` Resubmitted on ${formatDate(view.resubmittedAt)}.` : ""}
        </p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-800">Your KYC was not approved{view.rejectedAt ? ` (${formatDate(view.rejectedAt)})` : ""}.</p>
          <p className="mt-2 text-red-800"><span className="font-semibold">Reason:</span> {view.rejectionReason || "No reason was recorded. Please contact support."}</p>
          <p className="mt-2 text-sm text-red-700">Correct the details below or upload new documents, then resubmit. Your application goes back for review.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {KYC_FIELDS.map((f) => (
            <label key={f} className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">{FIELD_LABELS[f]}</span>
              <input
                value={values[f]}
                onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                className="w-full rounded-xl border p-3 outline-none focus:ring-2 focus:ring-green-500"
                autoComplete="off"
              />
            </label>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Upload a new document (only if it needs replacing)</p>
          {(Object.keys(DOC_LABELS) as KycDocument[]).map((d) => (
            <label key={d} className="block rounded-xl border p-3">
              <span className="block text-sm text-gray-700">
                {DOC_LABELS[d]} <span className="text-gray-500">— {view.documents[d] ? "on file" : "not uploaded"}</span>
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="mt-2 block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFiles((prev) => {
                    const next = { ...prev };
                    if (file) next[d] = file; else delete next[d];
                    return next;
                  });
                }}
              />
            </label>
          ))}
        </div>

        {formError && <p role="alert" className="text-red-700">{formError}</p>}
        <button
          onClick={() => void resubmit()}
          disabled={submitting}
          className="w-full rounded-xl bg-green-600 py-4 font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Resubmit for review"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <p className="text-sm uppercase tracking-widest opacity-80">YOMICO Seller Portal</p>
          <h1 className="text-3xl font-bold">KYC status</h1>
        </div>
      </div>
      <div className="mx-auto -mt-6 max-w-3xl px-4 sm:px-6">
        <div className="rounded-2xl bg-white p-5 shadow-lg sm:p-8">
          {body}
          {user && (
            <button onClick={() => void logout()} className="mt-6 text-sm text-gray-600 underline">Log out</button>
          )}
        </div>
      </div>
    </div>
  );
}
