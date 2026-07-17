"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminPayoutsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    loadPayouts();
  }, []);

  const loadPayouts = async () => {
    try {
      const [vendorSnapshot, orderSnapshot, payoutSnapshot] = await Promise.all([
        getDocs(collection(db, "vendors")),
        getDocs(collection(db, "orders")),
        getDocs(collection(db, "vendor_payouts")),
      ]);

      // Sum already-paid amounts per vendor from the payouts ledger
      const paidByVendor: Record<string, number> = {};
      payoutSnapshot.forEach((docSnap) => {
        const p: any = docSnap.data();
        if (p.vendorId) {
          paidByVendor[p.vendorId] =
            (paidByVendor[p.vendorId] || 0) + (p.amount || 0);
        }
      });

      const vendorData: any[] = [];

      vendorSnapshot.forEach((vendorDoc) => {
        const vendor: any = vendorDoc.data();

        let sales = 0;
        let commission = 0;
        let earnings = 0;

        orderSnapshot.forEach((orderDoc) => {
          const order: any = orderDoc.data();
          if (order.status === "Cancelled") return; // exclude cancelled

          const vendorItems =
            order.items?.filter((item: any) => item.vendorId === vendorDoc.id) ||
            [];

          if (vendorItems.length) {
            sales += order.finalTotal || order.total || 0;
            commission += order.commission || 0;
            earnings += order.sellerEarning || 0;
          }
        });

        const paidPayout = paidByVendor[vendorDoc.id] || 0;
        const pendingPayout = Math.max(0, earnings - paidPayout);

        vendorData.push({
          id: vendorDoc.id,
          shopName:
            vendor.storeName || vendor.businessName || vendor.shopName || "Vendor",
          sales,
          commission,
          earnings,
          paidPayout,
          pendingPayout,
        });
      });

      setVendors(vendorData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const markPaid = async (vendor: any) => {
    if (vendor.pendingPayout <= 0) {
      alert("Nothing pending for this vendor.");
      return;
    }
    if (
      !confirm(
        `Mark ₹${vendor.pendingPayout.toLocaleString(
          "en-IN"
        )} as paid to ${vendor.shopName}?`
      )
    ) {
      return;
    }

    setSaving(vendor.id);
    try {
      await addDoc(collection(db, "vendor_payouts"), {
        vendorId: vendor.id,
        vendorName: vendor.shopName,
        amount: vendor.pendingPayout,
        status: "Paid",
        createdAt: serverTimestamp(),
      });
      await loadPayouts(); // refresh from the ledger
    } catch (error) {
      console.error(error);
      alert("Failed to record payout.");
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Admin Payout Management</h1>
          <p className="opacity-90">Manage seller settlements</p>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : vendors.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No vendors found.
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow overflow-x-auto p-6">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-4 px-3">Seller</th>
                  <th className="text-left">Sales</th>
                  <th className="text-left">Commission</th>
                  <th className="text-left">Earnings</th>
                  <th className="text-left">Pending</th>
                  <th className="text-left">Paid</th>
                  <th className="text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b hover:bg-gray-50 transition"
                  >
                    <td className="py-4 px-3">{vendor.shopName}</td>
                    <td>₹{vendor.sales.toLocaleString("en-IN")}</td>
                    <td>₹{vendor.commission.toLocaleString("en-IN")}</td>
                    <td>₹{vendor.earnings.toLocaleString("en-IN")}</td>
                    <td className="text-orange-600 font-bold">
                      ₹{vendor.pendingPayout.toLocaleString("en-IN")}
                    </td>
                    <td className="text-green-600 font-bold">
                      ₹{vendor.paidPayout.toLocaleString("en-IN")}
                    </td>
                    <td>
                      <button
                        onClick={() => markPaid(vendor)}
                        disabled={
                          saving === vendor.id || vendor.pendingPayout <= 0
                        }
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition"
                      >
                        {saving === vendor.id
                          ? "Saving..."
                          : vendor.pendingPayout <= 0
                          ? "Settled"
                          : "Mark Paid"}
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
