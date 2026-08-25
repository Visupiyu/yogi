"use client";

import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { PAY_ON_DELIVERY_UPI } from "@/lib/upiPayment";
import { ORDER_STEPS, TOTAL_STEPS, getStep } from "@/lib/orderTracking";
import {
  RETURN_WINDOW_DAYS,
  canRequestReturn,
  returnWindowEndsAt,
} from "@/lib/returnEligibility";

// Display-only — the underlying paymentStatus values themselves
// (Pending/AwaitingVerification/Paid) are unchanged; this just avoids
// showing the internal "AwaitingVerification" wording to customers.
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  Pending: "Pending",
  AwaitingVerification: "Awaiting Verification",
  Paid: "Paid",
};

export default function OrderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        alert("Please login first");
        router.push("/login");
        return;
      }
      try {
        const ref = doc(db, "orders", orderId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          alert("Order not found");
          router.push("/orders");
          return;
        }

        const data: any = { id: snap.id, ...snap.data() };
        const allowed =
          data.userEmail?.trim().toLowerCase() ===
          user.email?.trim().toLowerCase();

        if (!allowed) {
          router.push("/orders");
          return;
        }

        setOrder(data);
      } catch (err) {
        console.error("Order page error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [orderId, router]);
  const openSellerChat = async () => {
     console.log("Firebase User:", auth.currentUser);
  console.log("Order:", order);
  console.log("First Item:", order?.items?.[0]);

  if (!order?.items?.length) return;

  try {

    const item = order.items[0];

    const q = query(
      collection(db, "chats"),
      where("orderId", "==", order.id),
      where("sellerId", "==", item.vendorId)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      router.push(`/chat/${snapshot.docs[0].id}`);
      return;
    }

    const chatRef = await addDoc(
  collection(db, "chats"),
  {
    orderId: order.id,

    sellerId: item.vendorId,
    sellerName: item.vendorName || "",

    customerId: order.userId,
    customerName: order.customerName,
    customerEmail: order.userEmail,

    productId: item.id,
    productName: item.name,
    productImage: item.image || "",

    lastMessage: "Conversation started",
    lastSender: "system",

    sellerUnread: 0,
    customerUnread: 0,

    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
  }
);

    router.push(`/chat/${chatRef.id}`);

  } catch (error: any) {

  console.error("Chat Error:", error);

  alert(error.message);

}
};

  // getStep() and the labels now live in lib/orderTracking.ts, shared with
  // app/orders and app/track-order. They were duplicated per page and had
  // already drifted apart; one definition prevents that recurring.
  const steps = ORDER_STEPS;

  // Same server-authoritative cancellation the orders list uses — the request
  // shape, confirmation, error handling and success behaviour are identical.
  // /api/cancel-order re-reads the order, authorizes the caller against it and
  // performs status + stock/sales + reward reversal + coupon release in one
  // Admin SDK transaction, so there is no cancellation logic to duplicate here
  // and none is added.
  const cancelOrder = async () => {
    if (!confirm("Cancel this order?")) return;

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        alert("Please login first");
        router.push("/login");
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

      setOrder((prev: any) => ({ ...prev, status: "Cancelled" }));
    } catch (error) {
      console.error("Cancel Error:", error);
      alert("Couldn't cancel this order.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-600 border-t-transparent"></div>
        <p className="mt-5 font-semibold">Loading your order...</p>
      </div>
    );
  }

  if (!order) return null;

  return (
    <section className="bg-gray-50 min-h-screen py-10">
      <div className="max-w-6xl mx-auto px-5">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold">Order Details</h1>
            <p className="text-gray-500 mt-2">Order #{order.id.slice(0, 8)}</p>
          </div>
          <Link
            href="/orders"
            className="px-5 py-3 rounded-xl bg-gray-800 text-white hover:bg-black"
          >
            ← Back to Orders
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT: CUSTOMER */}
          <div className="lg:col-span-2 bg-white rounded-3xl shadow border p-8">
            <h2 className="text-2xl font-bold mb-6">Customer Details</h2>
            <div className="space-y-3">
              <p><strong>Name:</strong> {order.customerName}</p>
              <p><strong>Email:</strong> {order.userEmail}</p>
              <p><strong>Phone:</strong> {order.phone}</p>
              <p><strong>Customer ID:</strong> {order.userId?.slice(0, 8)}</p>
              <p><strong>Address:</strong> {order.address}</p>
              <p>
                <strong>Ordered On:</strong>{" "}
                {order.createdAt?.seconds
                  ? new Date(
                      order.createdAt.seconds * 1000
                    ).toLocaleString()
                  : "-"}
              </p>
            </div>
          </div>

          {/* RIGHT: PAYMENT */}
          <div className="bg-white rounded-3xl shadow border p-8">
            <h2 className="text-2xl font-bold mb-6">Payment Summary</h2>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Total</span>
                <span className="font-bold text-green-700">
                  ₹{(order.finalTotal || order.total)?.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Method</span>
                <span>
                  {order.paymentMethod === PAY_ON_DELIVERY_UPI
                    ? "Pay on Delivery (UPI Only)"
                    : order.paymentMethod}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Payment Status</span>
                <span
                  className={`font-semibold ${
                    order.paymentStatus === "Paid"
                      ? "text-green-600"
                      : "text-orange-600"
                  }`}
                >
                  {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                </span>
              </div>

              {order.paymentMethod === PAY_ON_DELIVERY_UPI && (
                <div className="flex justify-between">
                  <span>Amount to Pay</span>
                  <span className="font-bold text-green-700">
                    ₹{(order.paymentAmount || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Items</span>
                <span>{order.items?.length || 0}</span>
              </div>

              <div className="flex justify-between">
                <span>Order Status</span>
                <span
                  className={`font-semibold ${
                    order.status === "Delivered"
                      ? "text-green-600"
                      : order.status === "Cancelled" ||
                        order.status === "Delivery Failed"
                      ? "text-red-600"
                      : "text-blue-600"
                  }`}
                >
                  {order.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CANCEL — same Pending-only condition the orders list uses, so a
            customer can cancel from the page they opened to look at the order
            instead of having to navigate back to the list. */}
        {order.status === "Pending" && (
          <div className="mt-8 bg-white rounded-3xl shadow border p-6">
            <button
              onClick={cancelOrder}
              className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-700 transition text-white font-semibold"
            >
              ❌ Cancel Order
            </button>
          </div>
        )}

        {/* TRACKING (or cancelled notice) */}
        {order.status === "Cancelled" ? (
          <div className="mt-8 bg-red-50 border border-red-200 rounded-3xl p-8">
            <h2 className="text-2xl font-bold text-red-700">
              ❌ Order Cancelled
            </h2>
            <p className="mt-3 text-gray-700">This order has been cancelled.</p>
          </div>
        ) : order.status === "Delivery Failed" ? (
          <div className="mt-8 bg-orange-50 border border-orange-200 rounded-3xl p-8">
            <h2 className="text-2xl font-bold text-orange-700">
              ⚠️ Delivery Attempt Failed
            </h2>
            <p className="mt-3 text-gray-700">
              We couldn&apos;t deliver your order. Our delivery partner will retry soon.
            </p>
          </div>
        ) : (
          <div className="mt-8 bg-white rounded-3xl shadow border p-8">
            <h2 className="text-2xl font-bold mb-8">🚚 Order Tracking</h2>
            <div className="flex items-center justify-between overflow-x-auto">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-center flex-1 min-w-[120px]"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                        getStep(order.status) >= index + 1
                          ? "bg-green-600"
                          : "bg-gray-300"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <p className="mt-3 text-sm text-center">{step}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-3 rounded-full ${
                        getStep(order.status) > index + 1
                          ? "bg-green-600"
                          : "bg-gray-300"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* DELIVERY PROGRESS */}

<div className="mt-8 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8">

  <h2 className="text-2xl font-bold">
    📦 Delivery Progress
  </h2>

  <p className="mt-4 text-lg">
    Current Status:
    <span className="font-bold ml-2">
      {order.status}
    </span>
  </p>

  <div className="mt-6 w-full bg-white/20 rounded-full h-4">

    <div
      className="bg-white h-4 rounded-full transition-all duration-500"
      style={{
        width: `${(getStep(order.status) / TOTAL_STEPS) * 100}%`,
      }}
    />

  </div>

  <p className="mt-4 text-sm opacity-90">
    Your order is moving through our delivery process.
  </p>

</div>

        {/* DELIVERY DETAILS */}
        <div className="mt-8 bg-white rounded-3xl shadow border p-8">
          <h2 className="text-2xl font-bold mb-6">📦 Delivery Details</h2>
          {order.expectedDelivery ||
          order.courierName ||
          order.trackingNumber ? (
            <div className="space-y-4">
              {order.expectedDelivery && (
                <div className="flex justify-between">
                  <span>Expected Delivery</span>
                  <span className="font-semibold">
                    {order.expectedDelivery}
                  </span>
                </div>
              )}
              {order.courierName && (
                <div className="flex justify-between">
                  <span>Courier Partner</span>
                  <span className="font-semibold">{order.courierName}</span>
                </div>
              )}
              {order.trackingNumber && (
                <div className="flex justify-between items-center">
                  <span>Tracking Number</span>
                  <span className="font-semibold">{order.trackingNumber}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="text-4xl mb-4">🚚</div>
              <p className="text-lg font-medium text-gray-700">
                Delivery partner has not been assigned yet.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Tracking details will appear once your order is shipped.
              </p>
            </div>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <Link
  href={`/invoice/${order.id}`}
  target="_blank"
  className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center"
>
  🖨 Print Invoice
</Link>

          <button
  onClick={openSellerChat}
  className="
    h-12
    rounded-xl
    bg-green-600
    hover:bg-green-700
    text-white
    font-semibold
    flex
    items-center
    justify-center
    w-full
  "
>
  💬 Contact Seller
</button>

          <Link
            href="/orders"
            className="h-12 rounded-xl bg-gray-800 hover:bg-black text-white font-semibold flex items-center justify-center"
          >
            ← Back to Orders
          </Link>

        {/* ORDERED PRODUCTS */}
        <div className="mt-8 bg-white rounded-3xl shadow border p-8">
          <h2 className="text-2xl font-bold mb-8">📦 Ordered Products</h2>
          <div className="space-y-6">
            {order.items?.map((item: any, index: number) => (
              <div
                key={index}
                className="border rounded-2xl p-5 flex flex-col md:flex-row gap-6 items-center hover:shadow-md transition"
              >
                <img
                  src={item.image || "/no-image.png"}
                  alt={item.name}
                  className="w-28 h-28 rounded-2xl object-cover border"
                />

                <div className="flex-1">
                  <p className="text-gray-500 text-sm">
                    Category: {item.category || "-"}
                  </p>
                  <h3 className="text-xl font-bold">{item.name}</h3>

                  <div className="mt-3 space-y-2 text-gray-600">
                    <p>
                      🏬 Seller:{" "}
                      <span className="font-semibold">
                        {item.vendorName || "-"}
                      </span>
                    </p>
                    <p>📦 Quantity: {item.qty}</p>
                    {item.color && <p>🎨 Color: {item.color}</p>}
                    {item.size && <p>📏 Size: {item.size}</p>}
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-3xl font-bold text-green-700">
                    ₹{(item.price * item.qty).toLocaleString("en-IN")}
                  </p>
                  <p className="text-gray-500">Item Total</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* ORDER SUMMARY */}

<div className="mt-8 bg-white rounded-3xl shadow border p-8">

  <h2 className="text-2xl font-bold mb-6">
    💰 Order Summary
  </h2>

  <div className="space-y-4">

    <div className="flex justify-between">
      <span>Subtotal</span>
      <span>₹{order.total?.toLocaleString("en-IN")}</span>
    </div>

    <div className="flex justify-between">
      <span>Shipping</span>
      <span>₹{order.shippingCharge || 0}</span>
    </div>

    <div className="flex justify-between font-bold text-xl border-t pt-4">
      <span>Total Paid</span>
      <span>
        ₹{(order.finalTotal || order.total)?.toLocaleString("en-IN")}
      </span>
    </div>

    {/* Refund status — read-only. Present only on a cancelled order whose
        payment was actually captured; absent on every other order, so
        nothing renders for the normal case. Wording stays honest about
        whether the money has actually been returned yet. */}
    {order.refundStatus === "Required" && (
      <div className="border-t pt-4 text-sm">
        <p className="font-semibold text-amber-700">Refund pending</p>
        <p className="text-gray-600 mt-1">
          A refund of ₹
          {Number(order.refundAmountDue || 0).toLocaleString("en-IN")} is being
          arranged for this cancelled order. It has not been sent yet.
        </p>
      </div>
    )}

    {order.refundStatus === "Processing" && (
      <div className="border-t pt-4 text-sm">
        <p className="font-semibold text-orange-700">Refund in progress</p>
        <p className="text-gray-600 mt-1">
          Your refund of ₹
          {Number(order.refundAmountDue || 0).toLocaleString("en-IN")} has been
          initiated. Banks usually take 5–7 business days.
        </p>
      </div>
    )}

    {order.refundStatus === "Refunded" && (
      <div className="border-t pt-4 text-sm">
        <p className="font-semibold text-green-700">Refunded</p>
        <p className="text-gray-600 mt-1">
          ₹{Number(order.refundedAmount || 0).toLocaleString("en-IN")} has been
          refunded
          {order.refundTransactionId
            ? ` · Ref: ${order.refundTransactionId}`
            : ""}
          .
        </p>
      </div>
    )}

  </div>

</div>

        {/* DELIVERY SUCCESS */}
        {order.status === "Delivered" && (
          <div className="mt-8 bg-green-50 border border-green-200 rounded-3xl p-8">
            <h2 className="text-2xl font-bold text-green-700">
              🎉 Order Delivered Successfully
            </h2>
            <p className="mt-3 text-gray-700">
            Thank you for shopping with YOMICO.
            </p>
            {/* Return action only while eligible. Delivered-only behaviour is
                preserved — this block already required it — with the 7-day
                window added on top. canRequestReturn() is the same rule
                /api/request-return enforces server-side. */}
            {canRequestReturn(order) ? (
              <Link
                href={`/returns?orderId=${order.id}`}
                className="inline-flex mt-6 px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold"
              >
                Request Return
              </Link>
            ) : (
              <p className="mt-6 text-sm text-gray-600">
                {returnWindowEndsAt(order)
                  ? `The ${RETURN_WINDOW_DAYS}-day return window closed on ${returnWindowEndsAt(
                      order
                    )!.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}.`
                  : `The ${RETURN_WINDOW_DAYS}-day return window has closed.`}
              </p>
            )}
          </div>
        )}
        </div>
      </section>
  );
}
