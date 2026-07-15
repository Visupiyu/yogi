"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

export default function SellerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/vendor-login");
        return;
      }

      try {
        const vendorId = firebaseUser.uid;

        // Scoped by the rules (vendor must be in vendorIds). No orderBy here,
        // so no composite index is required — we sort in code below.
        const q = query(
          collection(db, "orders"),
          where("vendorIds", "array-contains", vendorId)
        );

        const snapshot = await getDocs(q);
        const sellerOrders = [];

        snapshot.forEach((docSnap) => {
          const order = { id: docSnap.id, ...docSnap.data() };
          const myItems = (order.items || []).filter(
            (item) => item.vendorId === vendorId
          );
          if (myItems.length > 0) {
            sellerOrders.push({ ...order, items: myItems });
          }
        });

        // Newest first
        sellerOrders.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );

        setOrders(sellerOrders);
      } catch (error) {
        console.error("Failed to load seller orders:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const updateStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      const currentOrder = orders.find((order) => order.id === orderId);

      if (currentOrder?.userId) {
        await addDoc(collection(db, "notifications"), {
          userId: currentOrder.userId,
          role: "customer",
          title: "📦 Order Updated",
          message: `Your order is now ${newStatus}.`,
          type: "order",
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, "notifications"), {
        role: "seller",
        userId: auth.currentUser?.uid,
        title: "✅ Order Status Changed",
        message: `Order ${orderId.slice(0, 8)} updated to ${newStatus}.`,
        type: "order",
        read: false,
        createdAt: serverTimestamp(),
      });

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );

      alert("Status Updated");
    } catch (err) {
      console.error("Failed to update order:", err);
      alert("Error Updating Status");
    }
  };

  if (loading) {
    return <div className="p-5">Loading...</div>;
  }

  const steps = [
    "Pending",
    "Confirmed",
    "Packed",
    "Shipped",
    "Out For Delivery",
    "Delivered",
  ];

  const filteredOrders = orders.filter(
    (order) =>
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-5">
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 rounded-3xl mb-6">
        <h1 className="text-4xl font-bold">Seller Orders</h1>
        <p className="opacity-90">
          Manage customer orders and delivery status
        </p>
      </div>

      <div className="mb-6 bg-white p-4 rounded-2xl shadow">
        <p className="text-lg font-semibold">Total Orders: {orders.length}</p>
      </div>

      <input
        type="text"
        placeholder="Search Order ID / Customer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border p-4 rounded-2xl mb-6"
      />

      {orders.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl text-center shadow">
          <p className="text-gray-500 text-lg">No orders available yet.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white border rounded-xl p-5 shadow"
            >
              <h2 className="font-bold text-lg">
                Order ID: {order.id.slice(0, 8)}
              </h2>

              <p>Customer: {order.customerName}</p>

              <p>
                Date:{" "}
                {order.createdAt?.toDate
                  ? order.createdAt.toDate().toLocaleDateString()
                  : "-"}
              </p>

              <p>Phone: {order.phone}</p>
              <p>Email: {order.userEmail}</p>
              <p>Address: {order.address}</p>

              <p>
                Payment:{" "}
                <span
                  className={
                    order.paymentStatus === "Paid"
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {order.paymentStatus || "Pending"}
                </span>
              </p>

              <p>Method: {order.paymentMethod || "COD"}</p>
              <p>
                Seller Earnings: ₹
                {(order.sellerEarning || 0).toLocaleString("en-IN")}
              </p>

              <div className="mt-4">
                <p className="font-semibold mb-2">
                  Status:{" "}
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      order.status === "Delivered"
                        ? "bg-green-100 text-green-700"
                        : order.status === "Cancelled"
                        ? "bg-red-100 text-red-700"
                        : order.status === "Out For Delivery"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {order.status}
                  </span>
                </p>

                <select
                  value={order.status}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (
                      value === "Delivered" &&
                      !confirm("Mark this order as Delivered?")
                    ) {
                      return;
                    }
                    updateStatus(order.id, value);
                  }}
                  className="border p-2 rounded-lg"
                >
                  <option>Pending</option>
                  <option>Confirmed</option>
                  <option>Packed</option>
                  <option>Shipped</option>
                  <option>Out For Delivery</option>
                  <option>Delivered</option>
                  <option>Cancelled</option>
                </select>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {steps.map((step, index) => (
                  <div
                    key={index}
                    className={`px-3 py-1 rounded-full text-xs ${
                      steps.indexOf(step) <= steps.indexOf(order.status)
                        ? "bg-green-600 text-white"
                        : "bg-gray-200"
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>

              <hr className="my-4" />

              {order.items.map((item, index) => (
                <div key={index} className="mb-3">
                  <p className="font-semibold">{item.name}</p>
                  <p>
                    ₹{item.price} × {item.qty} = ₹{item.price * item.qty}
                  </p>
                </div>
              ))}

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/seller/orders/${order.id}`}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}