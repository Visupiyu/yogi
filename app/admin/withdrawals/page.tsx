"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { computeVendorShare } from "@/lib/vendorEarnings";

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWithdrawals();
  }, []);

  const loadWithdrawals = async () => {
    try {
      const snapshot = await getDocs(collection(db, "withdrawals"));
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setWithdrawals(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Recomputes what this vendor may still be paid, from live data, using
  // the SAME model app/admin/payouts/page.tsx applies — the shared
  // computeVendorShare() helper over Delivered + Paid orders, minus every
  // other commitment already recorded against them. Deliberately not a
  // second earnings formula: the only thing duplicated here is the filter.
  //
  // Returns null when the vendor cannot be identified, which must block the
  // settlement rather than default to "payable".
  const payableForWithdrawal = async (
    settling: any
  ): Promise<number | null> => {
    const [vendorSnapshot, orderSnapshot, payoutSnapshot, withdrawalSnapshot] =
      await Promise.all([
        getDocs(collection(db, "vendors")),
        getDocs(collection(db, "orders")),
        getDocs(collection(db, "vendor_payouts")),
        getDocs(collection(db, "withdrawals")),
      ]);

    // Legacy rows carry only vendorEmail; newer ones carry vendorId
    // directly (firestore.rules now pins it to the requester's uid).
    let vendorUid: string = settling.vendorId || "";
    if (!vendorUid && settling.vendorEmail) {
      vendorSnapshot.forEach((docSnap) => {
        const v: any = docSnap.data();
        if (v.email === settling.vendorEmail && v.uid) vendorUid = v.uid;
      });
    }
    if (!vendorUid) return null;

    let earnings = 0;
    orderSnapshot.forEach((orderDoc) => {
      const order: any = orderDoc.data();
      // Same fulfilled-and-paid gate as the payouts page and the seller
      // wallet: money is only payable once the goods arrived AND the
      // customer's payment actually landed.
      // An order flagged needsReview was PAID but could not be fulfilled as
      // priced — short stock, a coupon already spent, or a reward balance
      // that moved (see lib/onlineOrder.ts). Its items[] still carry the
      // full requested quantities, so computeVendorShare() would credit the
      // vendor for units that were never in stock. Excluded until an admin
      // resolves the flag; the Delivered + Paid gate alone cannot see it.
      if (
        order.status !== "Delivered" ||
        order.paymentStatus !== "Paid" ||
        order.needsReview === true
      )
        return;
      const s = computeVendorShare(order, vendorUid);
      if (s) earnings += s.vendorEarning;
    });

    let committed = 0;

    // Direct admin settlements.
    payoutSnapshot.forEach((docSnap) => {
      const p: any = docSnap.data();
      if (p.vendorId === vendorUid) committed += Number(p.amount || 0);
    });

    // Every OTHER withdrawal already settled or reserved. The one being
    // settled is excluded by document id: it is itself a Pending/Approved
    // reservation, so counting it here would subtract the same amount
    // twice and make a legitimate request look unaffordable. Excluding it
    // turns the comparison below into "does this request fit in what is
    // left after every other commitment?", which is the real question.
    withdrawalSnapshot.forEach((docSnap) => {
      if (docSnap.id === settling.id) return;
      const w: any = docSnap.data();
      if (!["Paid", "Pending", "Approved"].includes(w.status)) return;
      const wUid = w.vendorId || "";
      if (wUid !== vendorUid) return;
      committed += Number(w.amount || 0);
    });

    return earnings - committed;
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      // Only settlement moves money, so only settlement is verified here.
      // Every other transition stays exactly as it was for this step.
      if (status === "Paid") {
        const settling = withdrawals.find((item) => item.id === id);
        if (!settling) {
          console.error("Withdrawal not found:", id);
          alert("Could not load this withdrawal. Please refresh and retry.");
          return;
        }

        const payable = await payableForWithdrawal(settling);

        if (payable === null) {
          console.error("Cannot resolve vendor for withdrawal:", id);
          alert(
            "Cannot identify the vendor for this withdrawal. Not marking it paid."
          );
          return;
        }

        const amount = Number(settling.amount || 0);

        if (amount > payable) {
          console.error("Insufficient balance for withdrawal", id, {
            amount,
            payable,
          });
          alert(
            "Insufficient balance.\n\n" +
              `Requested: ₹${amount.toLocaleString("en-IN")}\n` +
              `Payable now: ₹${payable.toLocaleString("en-IN")}\n\n` +
              "This withdrawal was NOT marked paid."
          );
          return;
        }
      }

      await updateDoc(doc(db, "withdrawals", id), { status });
      setWithdrawals(
        withdrawals.map((item) =>
          item.id === id ? { ...item, status } : item
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const badge = (status: string) =>
    status === "Approved"
      ? "bg-blue-100 text-blue-700"
      : status === "Paid"
      ? "bg-green-100 text-green-700"
      : status === "Rejected"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* HEADER (sibling of the content) */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Withdrawal Requests</h1>
          <p className="opacity-90">Manage vendor withdrawals</p>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : withdrawals.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No withdrawal requests.
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow overflow-x-auto p-6">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="text-left py-4 px-3">Vendor</th>
                  <th className="text-left">Amount</th>
                  <th className="text-left">Requested</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-4 px-3">{item.vendorName || "-"}</td>
                    <td>
                      ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                    </td>
                    <td>
                      {item.createdAt?.seconds
                        ? new Date(
                            item.createdAt.seconds * 1000
                          ).toLocaleDateString()
                        : "-"}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${badge(
                            item.status || "Pending"
                          )}`}
                        >
                          {item.status || "Pending"}
                        </span>
                        <select
                          value={item.status || "Pending"}
                          onChange={(e) =>
                            updateStatus(item.id, e.target.value)
                          }
                          className="border p-2 rounded-lg"
                        >
                          <option>Pending</option>
                          <option>Approved</option>
                          <option>Rejected</option>
                          <option>Paid</option>
                        </select>
                      </div>
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
