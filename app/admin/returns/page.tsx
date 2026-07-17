"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminReturnsPage() {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    loadReturns();
  }, []);

  const loadReturns = async () => {
    try {
      const snapshot = await getDocs(collection(db, "returns"));
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setReturns(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "returns", id), { status });
      setReturns(
        returns.map((item) =>
          item.id === id ? { ...item, status } : item
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const shown =
    filter === "All"
      ? returns
      : returns.filter((r) => (r.status || "Pending") === filter);

  const badge = (status: string) =>
    status === "Approved"
      ? "bg-blue-100 text-blue-700"
      : status === "Rejected"
      ? "bg-red-100 text-red-700"
      : status === "Refunded"
      ? "bg-green-100 text-green-700"
      : "bg-yellow-100 text-yellow-700";

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Return Requests</h1>
          <p className="opacity-90">Manage customer returns</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {["All", "Pending", "Approved", "Rejected", "Refunded"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl font-semibold transition ${
                filter === f
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : shown.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center text-gray-500">
            No return requests.
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow p-6 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="py-4 px-3 text-left">Order ID</th>
                  <th className="text-left">Customer</th>
                  <th className="text-left">Reason</th>
                  <th className="text-left">Date</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-4 px-3">
                      {item.orderId?.slice(0, 8) || "-"}
                    </td>
                    <td>{item.customerName || "-"}</td>
                    <td className="max-w-[240px]">{item.reason || "-"}</td>
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
                          <option>Refunded</option>
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
