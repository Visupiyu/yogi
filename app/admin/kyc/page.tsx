"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logAdminAction } from "@/lib/auditLog";

function tsToText(v: unknown): string {
  if (!v) return "";
  const anyV = v as { toDate?: () => Date; seconds?: number };
  try {
    if (typeof anyV.toDate === "function") return anyV.toDate().toLocaleString();
    if (typeof anyV.seconds === "number") return new Date(anyV.seconds * 1000).toLocaleString();
    if (typeof v === "string") return new Date(v).toLocaleString();
  } catch { /* ignore */ }
  return "";
}

type KycDocType = "gst" | "aadhaar" | "cheque";

// Downloads via the protected server endpoint (never the raw Storage URL) —
// the server authenticates the admin, resolves the document from the
// vendor's own record, and returns it with a real Content-Disposition:
// attachment header. Blob + throwaway <a download> is still needed client
// side because the request must carry the admin's bearer token, which a
// plain link navigation can't do; the filename is read back from the
// response header rather than guessed. Never logs the response URL/headers —
// only a generic message on failure.
async function downloadKycDocument(
  vendorId: string,
  docType: KycDocType,
  fileLabel: string
) {
  try {
    const user = auth.currentUser;
    if (!user) { alert("Please sign in again."); return; }
    const token = await user.getIdToken();
    const res = await fetch(
      `/api/admin/kyc/document?vendorId=${encodeURIComponent(vendorId)}&type=${docType}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || `Could not download this document. (HTTP ${res.status})`);
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch ? filenameMatch[1] : fileLabel;

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    console.error(`Failed to download KYC document (${fileLabel}).`);
    alert("Could not download this document.");
  }
}

// One row of View/Download controls for a single KYC document. Renders
// "Not uploaded" instead of a broken link when the URL is missing, and never
// prints the URL itself as visible text. View still opens the document's own
// Storage URL directly (unchanged); Download goes through the protected
// server endpoint instead of fetching that URL from the browser.
function KycDocumentRow({
  label,
  url,
  vendorId,
  docType,
}: {
  label: string;
  url?: string;
  vendorId: string;
  docType: KycDocType;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs py-0.5">
      <span className="text-gray-600 font-medium">{label}</span>
      {url ? (
        <div className="flex gap-1.5 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white transition"
          >
            View
          </a>
          <button
            type="button"
            onClick={() => void downloadKycDocument(vendorId, docType, label)}
            className="px-2 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition"
          >
            Download
          </button>
        </div>
      ) : (
        <span className="text-gray-400 italic shrink-0">Not uploaded</span>
      )}
    </div>
  );
}

export default function AdminKYCPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const snapshot = await getDocs(collection(db, "vendors"));
      const items: any[] = [];
     snapshot.forEach((docSnap) =>
  items.push({ id: docSnap.id, ...docSnap.data() })
);

items.sort((a, b) => {
  const statusA = a.kycStatus || "Pending";
  const statusB = b.kycStatus || "Pending";

  if (statusA === statusB) return 0;
  if (statusA === "Pending") return -1;
  if (statusB === "Pending") return 1;

  return 0;
});

setVendors(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const [taxBusy, setTaxBusy] = useState<string | null>(null);

  // Admin-only GST verification — routed through the SERVER (Admin SDK), which
  // re-checks admin authorization from the verified token, enforces the policy
  // (Registered/Composition only, valid GSTIN to verify, no duplicate
  // transitions), records the deciding admin + timestamp + rejection reason, and
  // writes an append-only audit entry. The client never writes taxVerification*.
  const decideTaxVerification = async (
    id: string,
    action: "VERIFY" | "REJECT",
    reason?: string
  ) => {
    try {
      setTaxBusy(id);
      const user = auth.currentUser;
      if (!user) { alert("Please sign in again."); return; }
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/seller-tax-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vendorId: id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the HTTP status so a server-side failure is never a silent
        // no-op: e.g. 404 (route not deployed), 403 (not admin), 500 (server /
        // Firebase Admin credential error) — the admin then knows why nothing
        // changed instead of thinking the button "did nothing".
        alert(
          (data?.error ? `${data.error} ` : "Could not update the tax verification. ") +
            `(HTTP ${res.status})`
        );
        return;
      }
      setVendors(
        vendors.map((vendor) =>
          vendor.id === id
            ? {
                ...vendor,
                taxVerificationStatus: data.taxVerificationStatus,
                taxVerifiedAt: data.taxVerifiedAt,
                taxVerifiedBy: data.taxVerifiedBy,
                taxRejectionReason: data.taxRejectionReason,
              }
            : vendor
        )
      );
    } catch (error) {
      console.error(error);
      alert("Could not update the tax verification.");
    } finally {
      setTaxBusy(null);
    }
  };

  const rejectTaxVerification = (id: string) => {
    const reason = window.prompt("Reason for rejecting this seller's GST/tax profile:");
    if (reason === null) return; // cancelled
    if (!reason.trim()) { alert("A rejection reason is required."); return; }
    void decideTaxVerification(id, "REJECT", reason.trim());
  };

  const updateKYC = async (id: string, status: string) => {
    try {
      const previous = vendors.find((vendor) => vendor.id === id);
      await updateDoc(doc(db, "vendors", id), {
        kycStatus: status,
        status: status,
      });
      const uid = previous?.uid;
      if (uid) {
        await setDoc(
          doc(db, "vendors_public", uid),
          { status },
          { merge: true }
        );
      }
      await logAdminAction("kyc_status_change", id, {
        oldStatus: previous?.kycStatus,
        newStatus: status,
      });
      setVendors(
        vendors.map((vendor) =>
          vendor.id === id
            ? { ...vendor, kycStatus: status, status: status }
            : vendor
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Vendor KYC Verification</h1>
          <p className="opacity-90">Review vendor documents</p>
        </div>

        {loading ? (
          <div className="bg-white p-8 rounded-3xl">Loading vendor KYC records...Loading vendor KYC records...</div>
        ) : vendors.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No vendors found.
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow overflow-x-auto p-6">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="text-left py-4 px-3">Vendor</th>
                  <th className="text-left">GST</th>
                  <th className="text-left">GST Status / Verify</th>
                  <th className="text-left">PAN</th>
                  <th className="text-left">Aadhaar</th>
                  <th className="text-left">KYC Documents</th>
                  <th className="text-left">Email</th>
                  <th className="text-left">KYC Status</th>
                  <th className="text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b hover:bg-gray-50 transition"
                  >
                    <td className="py-4 px-3">{vendor.businessName || "-"}</td>
                    <td>{vendor.gstNumber || "-"}</td>
                    <td>
                      {(() => {
                        const gstStatus = vendor.taxProfile?.gstStatus;
                        const needsVerify =
                          gstStatus === "REGISTERED" || gstStatus === "COMPOSITION";
                        const vStatus = vendor.taxVerificationStatus || "PENDING";
                        const busy = taxBusy === vendor.id;
                        return (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-gray-700">
                              {gstStatus || "—"}
                            </span>
                            {needsVerify ? (
                              <>
                                <span className="text-[11px] text-gray-500">
                                  GSTIN: {vendor.taxProfile?.gstin || "—"}
                                </span>
                                <span
                                  className={`inline-block w-fit rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                    vStatus === "VERIFIED"
                                      ? "bg-green-100 text-green-700"
                                      : vStatus === "REJECTED"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {vStatus}
                                </span>
                                {(vendor.taxVerifiedAt || vendor.taxVerifiedBy) && (
                                  <span className="text-[10px] text-gray-400">
                                    {tsToText(vendor.taxVerifiedAt)}
                                    {vendor.taxVerifiedBy ? ` · ${vendor.taxVerifiedBy}` : ""}
                                  </span>
                                )}
                                {vStatus === "REJECTED" && vendor.taxRejectionReason && (
                                  <span className="text-[10px] text-red-600">
                                    Reason: {vendor.taxRejectionReason}
                                  </span>
                                )}
                                <div className="mt-1 flex gap-1">
                                  <button
                                    onClick={() => void decideTaxVerification(vendor.id, "VERIFY")}
                                    disabled={busy || vStatus === "VERIFIED"}
                                    className="text-xs px-2 py-1 rounded bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {busy ? "…" : "Verify"}
                                  </button>
                                  <button
                                    onClick={() => rejectTaxVerification(vendor.id)}
                                    disabled={busy || vStatus === "REJECTED"}
                                    className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </>
                            ) : (
                              <span className="text-[11px] text-gray-400">
                                No verification required
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td>{vendor.panNumber || "-"}</td>
                    <td>{vendor.aadhaarNumber || "-"}</td>
                    <td>
                      <div className="flex flex-col gap-1 min-w-[220px]">
                        <KycDocumentRow label="GST Certificate" url={vendor.gstDocUrl} vendorId={vendor.id} docType="gst" />
                        <KycDocumentRow label="Aadhaar" url={vendor.aadhaarDocUrl} vendorId={vendor.id} docType="aadhaar" />
                        <KycDocumentRow label="Cancelled Cheque" url={vendor.chequeDocUrl} vendorId={vendor.id} docType="cheque" />
                      </div>
                    </td>
                    <td>{vendor.email || "-"}</td>
                    <td>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          vendor.kycStatus === "Approved"
                            ? "bg-green-100 text-green-700"
                            : vendor.kycStatus === "Rejected"
                            ? "bg-red-600 text-white"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {vendor.kycStatus || "Pending"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
  onClick={() => updateKYC(vendor.id, "Approved")}
  disabled={vendor.kycStatus === "Approved"}
  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-white px-4 py-2 rounded-lg"
>
  Approve
</button>
                        <button
  onClick={() => updateKYC(vendor.id, "Rejected")}
  disabled={vendor.kycStatus === "Rejected"}
  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-white px-4 py-2 rounded-lg"
>
  Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-center py-8 text-gray-500">
      Vendor KYC verification for YOMICO.
      </div>
    </div>
  );
}
