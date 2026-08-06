"use client";

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

export default function RecentOrders() {

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const unsub = onAuthStateChanged(auth, async (user) => {

      if (!user) {
        setLoading(false);
        return;
      }

      try {

        const q = query(
          collection(db, "orders"),
          where("vendorIds", "array-contains", user.uid)
        );

        const snapshot = await getDocs(q);

        const sellerOrders: any[] = [];

        snapshot.forEach((docSnap) => {

          const order = {
            id: docSnap.id,
            ...docSnap.data(),
          };

          sellerOrders.push(order);

        });

        sellerOrders.sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        );

        setOrders(sellerOrders.slice(0, 5));

      } catch (err) {

        console.error(err);

      } finally {

        setLoading(false);

      }

    });

    return () => unsub();

  }, []);
  return (
  <div className="rounded-2xl border bg-white p-6 shadow-sm">

    <div className="mb-6 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        📋 Recent Orders
      </h2>

      <Link
        href="/seller/orders"
        className="text-blue-600 hover:underline"
      >
        View All
      </Link>

    </div>

    {loading ? (

      <div className="py-10 text-center text-gray-500">
        Loading...
      </div>

    ) : orders.length === 0 ? (

      <div className="py-10 text-center text-gray-500">
        No recent orders found.
      </div>

    ) : (

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead>

            <tr className="border-b">

              <th className="p-3 text-left">Order</th>

              <th className="p-3 text-left">Customer</th>

              <th className="p-3 text-left">Amount</th>

              <th className="p-3 text-left">Status</th>

            </tr>

          </thead>

          <tbody>

            {orders.map((order) => (

              <tr
                key={order.id}
                className="border-b hover:bg-gray-50"
              >

                <td className="p-3 font-medium">
                  #{order.id.slice(0, 8)}
                </td>

                <td className="p-3">
                  {order.customerName}
                </td>

                <td className="p-3">
                  ₹{Number(order.finalTotal || order.total || 0).toLocaleString("en-IN")}
                </td>

                <td className="p-3">

                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium
                    ${
                      order.status === "Delivered"
                        ? "bg-green-100 text-green-700"
                        : order.status === "Cancelled"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {order.status}
                  </span>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    )}

  </div>
);
}