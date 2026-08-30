"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAdminAction } from "@/lib/auditLog";

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

  // Admin-only GST verification. Sets taxVerificationStatus on the vendor
  // (the vendor rule allows an admin to write it; sellers cannot). This is the
  // only path to VERIFIED.
  const updateTaxVerification = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "vendors", id), { taxVerificationStatus: status });
      await logAdminAction("tax_verification_change", id, { newStatus: status });
      setVendors(
        vendors.map((vendor) =>
          vendor.id === id ? { ...vendor, taxVerificationStatus: status } : vendor
        )
      );
    } catch (error) {
      console.error(error);
    }
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
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600">
                          {vendor.taxProfile?.gstStatus || "—"}
                          {vendor.taxVerificationStatus
                            ? ` · ${vendor.taxVerificationStatus}`
                            : ""}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              updateTaxVerification(vendor.id, "VERIFIED")
                            }
                            className="text-xs px-2 py-1 rounded bg-green-600 text-white"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() =>
                              updateTaxVerification(vendor.id, "REJECTED")
                            }
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>{vendor.panNumber || "-"}</td>
                    <td>{vendor.aadhaarNumber || "-"}</td>
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
