"use client";

import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { computeVendorEarningsBreakdown } from "@/lib/vendorPayable";

/** A fresh idempotency key for one payout attempt. */
function newPayoutKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export default function AdminPayoutsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  // Per seller: the key of a payout attempt that has not had a definite answer
  // yet, so a retry after a network failure is the SAME request server-side.
  const payoutKeys = useRef<Record<string, string>>({});

  useEffect(() => {
    loadPayouts();
  }, []);

  const loadPayouts = async () => {
    try {
      const [
        vendorSnapshot,
        orderSnapshot,
        payoutSnapshot,
        withdrawalSnapshot,
        refundedReturnsSnapshot,
        itemRequestSnapshot,
        sellerOrderSnapshot,
      ] = await Promise.all([
        getDocs(collection(db, "vendors")),
        getDocs(collection(db, "orders")),
        getDocs(collection(db, "vendor_payouts")),
        getDocs(collection(db, "withdrawals")),
        getDocs(query(collection(db, "returns"), where("status", "==", "Refunded"))),
        getDocs(collection(db, "itemRequests")),
        getDocs(collection(db, "sellerOrders")),
      ]);

      // Refund-adjusted earnings use lib/vendorPayable — the SAME authoritative
      // calc the withdrawal request + settlement routes use — so this screen no
      // longer overstates what a vendor is owed by ignoring returns. It accounts
      // for item-level itemRequests returns, legacy full refunds, and
      // single-vendor legacy partial refunds. `orders` must carry the doc id so
      // returns can be matched to their order.
      const ordersWithId = orderSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const legacyReturns = refundedReturnsSnapshot.docs.map((d) => d.data());
      const itemRequests = itemRequestSnapshot.docs.map((d) => d.data());
      const sellerOrders = sellerOrderSnapshot.docs.map((d) => d.data());

      // Sum already-paid amounts per vendor from the payouts ledger.
      // Keyed by the seller's auth uid — the same id order items use —
      // not the vendors-collection document id.
      const paidByVendor: Record<string, number> = {};
      payoutSnapshot.forEach((docSnap) => {
        const p: any = docSnap.data();
        if (p.vendorId) {
          paidByVendor[p.vendorId] =
            (paidByVendor[p.vendorId] || 0) + (p.amount || 0);
        }
      });

      // A seller can also get paid via their own withdrawal request
      // (app/seller/wallet) instead of a direct admin settlement — that
      // was a separate ledger this page never checked, so an already-paid
      // withdrawal still showed as "Pending" here and risked being paid
      // again via "Mark Paid" below. New withdrawal docs carry vendorId
      // directly; older ones (pre-fix) only have vendorEmail, matched via
      // the vendor list already being loaded.
      const uidByEmail: Record<string, string> = {};
      vendorSnapshot.forEach((docSnap) => {
        const v: any = docSnap.data();
        if (v.email && v.uid) uidByEmail[v.email] = v.uid;
      });

      withdrawalSnapshot.forEach((docSnap) => {
        const w: any = docSnap.data();
        // Reserve open requests too, not just settled ones. Counting only
        // "Paid" meant a seller with a Pending request still showed their
        // full earnings as payable here, while their own wallet had already
        // deducted it (app/seller/wallet subtracts Pending + Approved from
        // the available balance). An admin settling that figure via
        // "Mark Paid" wrote a vendor_payouts row, and the untouched request
        // could then ALSO be marked Paid on app/admin/withdrawals — paying
        // the same earnings twice, with Math.max(0, ...) below hiding the
        // resulting negative balance. Both pages now reserve the same set.
        if (!["Paid", "Pending", "Approved"].includes(w.status)) return;
        const vendorUid = w.vendorId || uidByEmail[w.vendorEmail];
        if (!vendorUid) return;
        paidByVendor[vendorUid] =
          (paidByVendor[vendorUid] || 0) + (w.amount || 0);
      });

      const vendorData: any[] = [];

      vendorSnapshot.forEach((vendorDoc) => {
        const vendor: any = vendorDoc.data();

        // Every figure from lib/vendorPayable's single breakdown — the same
        // calculation (and the same inputs, incl. the sellerOrders delivery
        // snapshots) the seller API, withdrawal request and settlement use.
        // Gated to Delivered + Paid + !needsReview orders inside it.
        const breakdown = computeVendorEarningsBreakdown({
          vendorUid: vendor.uid,
          orders: ordersWithId,
          itemRequests,
          legacyReturns,
          sellerOrders,
        });
        const sales = breakdown.grossSales;
        const commission = breakdown.commission; // always ₹0
        const deliveryCharges =
          breakdown.sellerDeliveryCharges + breakdown.returnLogisticsCharges;
        const earnings = breakdown.adjustedEarnings;

        const paidPayout = paidByVendor[vendor.uid] || 0;
        const pendingPayout = Math.max(0, earnings - paidPayout);

        vendorData.push({
          id: vendorDoc.id,
          uid: vendor.uid,
          shopName:
            vendor.storeName || vendor.businessName || vendor.shopName || "Vendor",
          sales,
          commission,
          deliveryCharges,
          earnings,
          paidPayout,
          pendingPayout,
        });
      });

      setVendors(vendorData);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't load this page's data. Please check your connection and refresh to try again.");
    } finally {
      setLoading(false);
    }
  };

  const markPaid = async (vendor: any) => {
    // Payouts are whole rupees. This figure is only what the admin is asking
    // to pay — the server re-derives the payable and refuses anything larger.
    const amount = Math.floor(Number(vendor.pendingPayout) || 0);
    if (amount <= 0) {
      alert("Nothing pending for this vendor.");
      return;
    }
    if (
      !confirm(
        `Mark ₹${amount.toLocaleString(
          "en-IN"
        )} as paid to ${vendor.shopName}?`
      )
    ) {
      return;
    }

    setSaving(vendor.id);
    try {
      // SERVER-AUTHORITATIVE: /api/admin/record-payout verifies the admin,
      // recomputes this seller's payable with the shared engine, and records
      // the payout and its audit entry in one idempotent transaction. The
      // browser never writes vendor_payouts (firestore.rules deny it).
      const user = auth.currentUser;
      if (!user) {
        alert("Please sign in again.");
        return;
      }
      const key = payoutKeys.current[vendor.uid] || newPayoutKey();
      payoutKeys.current[vendor.uid] = key;
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/record-payout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendorUid: vendor.uid, amount, idempotencyKey: key }),
      });
      const data = await res.json().catch(() => ({}));
      // A definite answer (success or refusal) retires the key; a server
      // error keeps it so a retry cannot record the payout twice.
      if (res.status < 500) delete payoutKeys.current[vendor.uid];
      if (!res.ok) {
        alert(data?.error || "Failed to record payout.");
      }
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
                  <th className="text-left">Delivery</th>
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
                    <td>₹{vendor.deliveryCharges.toLocaleString("en-IN")}</td>
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
