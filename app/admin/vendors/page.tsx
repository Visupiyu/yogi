"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, updateDoc, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/auditLog";

type Vendor = {
  id: string;
  uid: string;
  fullName: string;
  businessName: string;
  email: string;
  businessPhone: string;
  gstNumber: string;
  city: string;
  state: string;
  status: string;
};

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const snapshot = await getDocs(collection(db, "vendors"));
      const items: Vendor[] = [];
      snapshot.forEach((docSnap) => {
        const data: any = docSnap.data();
        items.push({
          id: docSnap.id,
          uid: data.uid || "",
          fullName: data.fullName || "-",
          businessName: data.businessName || data.storeName || "-",
          email: data.email || "-",
          businessPhone: data.businessPhone || "-",
          gstNumber: data.gstNumber || "-",
          city: data.city || "-",
          state: data.state || "-",
          status: data.status || "Pending",
        });
      });
      setVendors(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = vendors.filter(
    (vendor) =>
      vendor.fullName.toLowerCase().includes(search.toLowerCase()) ||
      vendor.businessName.toLowerCase().includes(search.toLowerCase()) ||
      vendor.email.toLowerCase().includes(search.toLowerCase())
  );

  const updateVendorStatus = async (vendor: Vendor, status: string) => {
    try {
      // Login (vendor-login/page.tsx) gates on kycStatus before status, and
      // a vendor's kycStatus defaults to "Pending" at registration. Approving
      // or rejecting here without also syncing kycStatus left vendors
      // permanently unable to log in even after being "Approved" on this
      // page — mirrors the sync admin/kyc/page.tsx's updateKYC already does.
      const updates: Record<string, string> =
        status === "Approved" || status === "Rejected"
          ? { status, kycStatus: status }
          : { status };
      await updateDoc(doc(db, "vendors", vendor.id), updates);
      if (vendor.uid) {
        await setDoc(
          doc(db, "vendors_public", vendor.uid),
          { status },
          { merge: true }
        );
      }
      await logAdminAction("vendor_status_change", vendor.id, {
        oldStatus: vendor.status,
        newStatus: status,
      });
      toast.success(`Vendor ${status}.`);
      loadVendors();
    } catch (error) {
      console.error(error);
      toast.error("Update failed.");
    }
  };

  const backfillPublicProfiles = async () => {
    // One-time migration: vendors registered before the vendors_public
    // mirror existed have no public-safe profile yet, so they're invisible
    // on /store, /seller/[id] and the homepage Top Vendors strip. Safe to
    // re-run any time (idempotent merge writes).
    setBackfilling(true);
    try {
      const snapshot = await getDocs(collection(db, "vendors"));
      let count = 0;
      for (const vendorDoc of snapshot.docs) {
        const data: any = vendorDoc.data();
        if (!data.uid) continue;
        await setDoc(
          doc(db, "vendors_public", data.uid),
          {
            uid: data.uid,
            businessName: data.businessName || "",
            fullName: data.fullName || "",
            email: data.email || "",
            businessPhone: data.businessPhone || "",
            businessType: data.businessType || "",
            city: data.city || "",
            state: data.state || "",
            storeLogo: data.storeLogo || "",
            storeBanner: data.storeBanner || "",
            rating: data.rating || 0,
            totalOrders: data.totalOrders || 0,
            totalSales: data.totalSales || 0,
            totalRevenue: data.totalRevenue || 0,
            status: data.status || "Pending",
            createdAt: data.createdAt || null,
          },
          { merge: true }
        );
        count++;
      }
      toast.success(`Backfilled ${count} vendor public profiles.`);
    } catch (error) {
      console.error(error);
      toast.error("Backfill failed.");
    } finally {
      setBackfilling(false);
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Vendor", "Business", "Email", "Phone", "GST", "City", "State", "Status"],
      ...filtered.map((v) => [
        v.fullName,
        v.businessName,
        v.email,
        v.businessPhone,
        v.gstNumber,
        v.city,
        v.state,
        v.status,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const badge = (status: string) =>
    status === "Approved"
      ? "bg-green-100 text-green-700"
      : status === "Rejected"
      ? "bg-red-100 text-red-700"
      : status === "Blocked"
      ? "bg-gray-200 text-gray-700"
      : "bg-yellow-100 text-yellow-700";

  const count = (s: string) => vendors.filter((v) => v.status === s).length;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">🏪 Vendor Management</h1>
          <p className="mt-2 opacity-90">Manage all marketplace vendors</p>
        </div>

        <div className="flex justify-end gap-3 mb-6">
          <button
            onClick={backfillPublicProfiles}
            disabled={backfilling}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition text-white px-6 py-3 rounded-xl"
            title="One-time: populate public storefront profiles for vendors that registered before this existed"
          >
            {backfilling ? "Backfilling..." : "🔄 Backfill Public Profiles"}
          </button>
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-700 transition text-white px-6 py-3 rounded-xl"
          >
            📥 Export CSV
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow">
            <p>Total Vendors</p>
            <h2 className="text-3xl font-bold">{vendors.length}</h2>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <p>Approved</p>
            <h2 className="text-3xl font-bold text-green-600">
              {count("Approved")}
            </h2>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <p>Pending</p>
            <h2 className="text-3xl font-bold text-yellow-600">
              {count("Pending")}
            </h2>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <p>Rejected</p>
            <h2 className="text-3xl font-bold text-red-600">
              {count("Rejected")}
            </h2>
          </div>
        </div>

        <input
          placeholder="Search vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded-xl p-4 mb-6"
        />

        {loading ? (
          <div className="bg-white rounded-2xl p-10 text-center">Loading...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="p-4 text-left">Vendor</th>
                  <th className="p-4 text-left">Business</th>
                  <th className="p-4 text-left">Email</th>
                  <th className="p-4 text-left">Phone</th>
                  <th className="p-4 text-left">GST</th>
                  <th className="p-4 text-left">Location</th>
                  <th className="p-4 text-left">Status</th>
                  <th className="p-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-500">
                      No vendors found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((vendor) => (
                    <tr
                      key={vendor.id}
                      className="border-b align-top hover:bg-gray-50"
                    >
                      <td className="p-4">{vendor.fullName}</td>
                      <td>{vendor.businessName}</td>
                      <td>{vendor.email}</td>
                      <td>{vendor.businessPhone}</td>
                      <td>{vendor.gstNumber}</td>
                      <td>
                        {vendor.city}, {vendor.state}
                      </td>
                      <td>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${badge(
                            vendor.status
                          )}`}
                        >
                          {vendor.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              updateVendorStatus(vendor, "Approved")
                            }
                            className="bg-green-600 hover:bg-green-700 transition text-white px-3 py-1 rounded-lg"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() =>
                              updateVendorStatus(vendor, "Rejected")
                            }
                            className="bg-red-600 hover:bg-red-700 transition text-white px-3 py-1 rounded-lg"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() =>
                              updateVendorStatus(
                                vendor,
                                vendor.status === "Blocked"
                                  ? "Approved"
                                  : "Blocked"
                              )
                            }
                            className="bg-gray-700 hover:bg-gray-800 transition text-white px-3 py-1 rounded-lg"
                          >
                            {vendor.status === "Blocked" ? "Unblock" : "Block"}
                          </button>
                        </div>

                        <div className="flex gap-3 mt-3 text-sm">
                          <Link
                            href={`/store/${vendor.uid}`}
                            className="text-blue-600 font-semibold hover:underline"
                          >
                            Products
                          </Link>
                          <Link
                            href={`/admin/payouts`}
                            className="text-green-600 font-semibold hover:underline"
                          >
                            Earnings
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
