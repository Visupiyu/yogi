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

// Mirrors isLegalOrderStatusTransition in firestore.rules — used here
// only to keep the dropdown from offering a move the rule would reject.
const NEXT_STATUSES = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out For Delivery"],
  "Out For Delivery": ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

// The ONLY paymentMethod a vendor may mark Paid by themselves. Kept as an
// explicit allow-list so an unrecognised or newly-added method is refused
// by default rather than silently permitted.
const VENDOR_SELF_PAID_METHODS = ["COD"];
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
          const order = { ...docSnap.data(), id: docSnap.id };
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
      const currentOrder = orders.find((order) => order.id === orderId);

      // Cancellation is server-authoritative — /api/cancel-order is the single
      // implementation, the same one app/orders (customer) already calls.
      //
      // This path used to set status and restore stock from the browser and
      // nothing else, so a seller-cancelled order left the customer's reward
      // points credited for an order that never happened AND their coupon
      // still consumed. Which button was pressed silently changed the
      // financial outcome. The route re-reads the order, authorizes the
      // caller against it (vendorIds branch), and does status + stock/sales +
      // reward reversal + coupon release in one Admin SDK transaction.
      //
      // Every other status transition below is unchanged.
      if (newStatus === "Cancelled") {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          alert("Please login first");
          router.push("/vendor-login");
          return;
        }

        const idToken = await currentUser.getIdToken();

        const response = await fetch("/api/cancel-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ orderId }),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data?.error || "Couldn't cancel this order.");
          return;
        }

        // The route does not write notifications, so this stays here —
        // same wording and shape as before.
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

        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, status: newStatus } : order
          )
        );

        return;
      }

      const payload = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };

      // Legacy cash-COD orders collect payment on delivery — mark it paid
      // in the same write, matching what the Firestore rule allows a
      // seller to do.
      //
      // ALLOW-LIST, not a deny-list. This previously excluded only
      // "ONLINE" and "PAY_ON_DELIVERY_UPI", so every other value defaulted
      // to permitted — and production carries four distinct paymentMethod
      // values, including "UPI" and the display string
      // "Pay on Delivery (UPI Only)". That let a vendor self-certify
      // payment on orders whose money had not been verified, which with
      // the fulfilled+paid payout gate also unlocks their own earnings.
      //
      // "COD" is the only value that legitimately settles in cash at the
      // door with no second party to verify it (see PaymentMethod in
      // lib/payment.ts). Everything else — known or unknown, now or later
      // — is blocked by default: Pay on Delivery (UPI Only) moves to Paid
      // only via the delivery partner's transaction-reference write plus
      // admin verification, and ONLINE is already Paid at creation.
      if (
        newStatus === "Delivered" &&
        VENDOR_SELF_PAID_METHODS.includes(currentOrder?.paymentMethod) &&
        currentOrder?.paymentStatus !== "Paid"
      ) {
        payload.paymentStatus = "Paid";
      }

      await updateDoc(doc(db, "orders", orderId), payload);

      // The client-side stock/sales restore that stood here is gone —
      // cancellation returns above, and /api/cancel-order performs the
      // restoration inside the same transaction as the status change, so a
      // failed write can no longer leave stock and status disagreeing.

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

              <p>Method: {order.paymentMethod || "Pay on Delivery (UPI Only)"}</p>
              <p>
                Seller Earnings: ₹
                {(() => {
                  // order.sellerEarning is the WHOLE order's earnings —
                  // wrong for a multi-vendor order. order.items here is
                  // already filtered to just this seller's own items.
                  const subtotal = order.items.reduce(
                    (sum, item) => sum + (item.price || 0) * (item.qty || 0),
                    0
                  );
                  return (subtotal - Math.round(subtotal * 0.1)).toLocaleString("en-IN");
                })()}
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

                {NEXT_STATUSES[order.status]?.length > 0 ? (
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
                    <option value={order.status}>{order.status}</option>
                    {NEXT_STATUSES[order.status].map((next) => (
                      <option key={next} value={next}>
                        {next}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500">
                    No further status changes available.
                  </p>
                )}
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