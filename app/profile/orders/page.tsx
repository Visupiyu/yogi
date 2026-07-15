"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      try {
        const snapshot = await getDocs(
          query(
            collection(db, "orders"),
            where("userEmail", "==", firebaseUser.email)
          )
        );
        const list: any[] = [];
        snapshot.forEach((docSnap) =>
          list.push({ id: docSnap.id, ...docSnap.data() })
        );
        list.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );
        setOrders(list);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const filtered = orders.filter(
    (order: any) =>
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      (order.customerName || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (status: string) =>
    status === "Delivered"
      ? "bg-green-100 text-green-700"
      : status === "Cancelled"
      ? "bg-red-100 text-red-700"
      : status === "Out For Delivery"
      ? "bg-blue-100 text-blue-700"
      : "bg-yellow-100 text-yellow-700";

  if (loading) {
    return <div className="p-10 text-center">Loading Orders...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-700 text-white rounded-3xl p-8 mb-6 shadow-lg">
          <h1 className="text-3xl md:text-4xl font-bold">My Orders</h1>
          <p className="mt-2 opacity-90">Track all your purchases</p>
        </div>

        {/* SEARCH + COUNT */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Search by order ID or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border rounded-2xl p-4 outline-none focus:ring-2 focus:ring-green-500 transition"
          />
          <div className="bg-white rounded-2xl shadow-sm px-6 flex items-center justify-center font-semibold text-gray-700">
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm p-12 text-center">
            <div className="text-5xl mb-3">📦</div>
            <p className="text-gray-500 mb-6">No orders found.</p>
            <Link href="/">
              <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold transition">
                Start Shopping
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {filtered.map((order: any) => (
              <div
                key={order.id}
                className="bg-white rounded-3xl shadow-sm hover:shadow-md transition p-6"
              >
                {/* TOP */}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold">
                      Order #{order.id.slice(0, 8)}
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                      {order.createdAt?.toDate
                        ? order.createdAt.toDate().toLocaleDateString()
                        : "-"}
                    </p>
                    <p className="text-sm mt-2">
                      Customer: {order.customerName}
                    </p>
                    <p className="text-sm">
                      Payment: {order.paymentMethod || "COD"}
                    </p>
                  </div>

                  <div className="text-left lg:text-right">
                    <span
                      className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${statusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                    <p className="mt-3 font-bold text-2xl">
                      ₹
                      {(
                        order.finalTotal ||
                        order.total ||
                        0
                      ).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>

                <hr className="my-5" />

                {/* ITEMS */}
                <div className="space-y-4">
                  {order.items?.map((item: any, index: number) => (
                    <div key={index} className="flex gap-4 items-center">
                      <img
                        src={item.image || "/no-image.png"}
                        alt=""
                        className="w-16 h-16 rounded-xl object-cover border border-gray-100"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm line-clamp-1">
                          {item.name}
                        </h3>
                        <p className="text-gray-500 text-sm">
                          Qty: {item.qty}
                          {item.size ? ` • ${item.size}` : ""}
                          {item.color ? ` • ${item.color}` : ""}
                        </p>
                      </div>
                      <div className="font-bold">
                        ₹{(item.price * item.qty).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>

                <hr className="my-5" />

                {/* ACTIONS */}
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/profile/orders/${order.id}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                  >
                    👁 View Details
                  </Link>

                  <Link
                    href={`/profile/orders/${order.id}`}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                  >
                    🚚 Track Order
                  </Link>

                  <Link
                    href={order.chatId ? `/chat/${order.chatId}` : "/chat"}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                  >
                    💬 Chat Seller
                  </Link>

                  {order.status === "Delivered" &&
                    !order.returnRequested && (
                      <Link
                        href={`/returns?orderId=${order.id}`}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                      >
                        🔄 Return Request
                      </Link>
                    )}

                  {order.status === "Delivered" &&
                    order.items?.[0]?.id && (
                      <Link
                        href={`/product/${order.items[0].id}`}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                      >
                        ⭐ Write Review
                      </Link>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
