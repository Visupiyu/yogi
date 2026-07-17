"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

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

  const updateStatus = async (id: string, status: string) => {
    try {
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
