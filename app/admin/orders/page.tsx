"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import Link from "next/link";
import { logAdminAction } from "@/lib/auditLog";
import { PAY_ON_DELIVERY_UPI } from "@/lib/upiPayment";
import { verifyDeliveryPayment } from "@/lib/deliveryPayment";

type Order = {
  id: string;
  customerName: string;
  userEmail?: string;
  userId?: string;
  total: number;
  finalTotal?: number;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  vendorId?: string;
  createdAt: any;
  courierName?: string;
  trackingNumber?: string;
  expectedDelivery?: string;
  paymentAmount?: number;
  paymentTransactionId?: string;
  // Set by lib/onlineOrder.ts when a captured Razorpay payment could not be
  // fulfilled as priced. The order is deliberately NOT rejected — the money
  // is already taken — so it is created and flagged instead. Until an admin
  // clears the flag, app/seller/wallet, app/seller/payouts, app/admin/payouts
  // and app/admin/withdrawals all exclude the order from vendor earnings.
  needsReview?: boolean;
  stockShortfall?: {
    id: string;
    name: string;
    wanted: number;
    available: number;
  }[];
  couponConflict?: boolean;
  rewardShortfall?: number;
  // Set by app/api/cancel-order when a captured ONLINE payment is cancelled.
  // "Required" means real money is owed back and has NOT been returned yet —
  // YOMICO does not move the money itself in this phase, so these fields
  // record an obligation and, once settled elsewhere, the evidence of it.
  refundStatus?: "Required" | "Processing" | "Refunded";
  refundAmountDue?: number;
  refundedAmount?: number;
  refundTransactionId?: string;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const snapshot = await getDocs(collection(db, "orders"));
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          customerName: data.customerName || "Customer",
          userId: data.userId || "",
          userEmail: data.userEmail || "",
          vendorId: data.vendorId || "",
          total: data.total || 0,
          finalTotal: data.finalTotal || data.total,
          paymentMethod: data.paymentMethod || "",
          paymentStatus: data.paymentStatus || "",
          status: data.status || "Pending",
          createdAt: data.createdAt || null,
          courierName: data.courierName || "",
          trackingNumber: data.trackingNumber || "",
          expectedDelivery: data.expectedDelivery || "",
          paymentAmount: data.paymentAmount || 0,
          paymentTransactionId: data.paymentTransactionId || "",
          // Carried through as written. needsReview is absent (not false) on
          // a clean order, and every consumer tests === true, so no default
          // is applied here — coercing it would invent a value the document
          // does not have.
          needsReview: data.needsReview,
          stockShortfall: data.stockShortfall,
          couponConflict: data.couponConflict,
          rewardShortfall: data.rewardShortfall,
          // Same convention: absent means no refund is owed, so no default.
          refundStatus: data.refundStatus,
          refundAmountDue: data.refundAmountDue,
          refundedAmount: data.refundedAmount,
          refundTransactionId: data.refundTransactionId,
        });
      });
      // newest-ish: sort by original timestamp if present is lost after formatting,
      // so leave insertion order; admin can search/filter.
     items.sort((a, b) =>(b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0) );
setOrders(items);
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "Pending").length;
  const deliveredOrders = orders.filter((o) => o.status === "Delivered").length;
  const shippedOrders = orders.filter(
    (o) => o.status === "Shipped" || o.status === "Out For Delivery"
  ).length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  const updateStatus = async (orderId: string, status: string) => {
    try {
      const previousStatus = orders.find((order) => order.id === orderId)?.status;

      // Cancellation is server-authoritative — /api/cancel-order is the single
      // implementation, shared with the customer and seller paths.
      //
      // This path was the weakest of the three: it set status and did nothing
      // else, so an admin cancellation restored no stock, reversed no reward
      // points and released no coupon. The route re-reads the order,
      // authorizes the caller (isAdmin branch) and performs all of it in one
      // Admin SDK transaction. Note it applies CANCELLABLE_STATUSES to admins
      // too, so cancelling a Delivered order is now correctly refused rather
      // than silently restoring stock for goods already delivered.
      //
      // Every other status transition below is unchanged.
      if (status === "Cancelled") {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          alert("Please sign in again.");
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
      } else {
        await updateDoc(doc(db, "orders", orderId), { status });
      }

      await logAdminAction("order_status_change", orderId, {
        oldStatus: previousStatus,
        newStatus: status,
      });

      // Admin notification (include role so it surfaces in the admin bell)
      await addDoc(collection(db, "notifications"), {
        role: "admin",
        title: "Order Status Updated",
        message: `Order ${orderId.slice(0, 8)} status changed to ${status}`,
        type: "order",
        read: false,
        createdAt: serverTimestamp(),
      });

      const currentOrder = orders.find((order) => order.id === orderId);
      if (currentOrder?.userId) {
        await addDoc(collection(db, "notifications"), {
          userId: currentOrder.userId,
          role: "customer",
          title: "📦 Order Updated",
          message: `Your order is now ${status}.`,
          type: "order",
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setOrders(
        orders.map((order) =>
          order.id === orderId ? { ...order, status } : order
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  // Clears the needsReview flag once an admin has dealt with the underlying
  // problem, releasing the order into the vendor payout calculations that
  // currently exclude it.
  //
  // Writes THREE fields and nothing else. finalTotal, total, discount,
  // rewardValue, commission, sellerEarning, items, status and paymentStatus
  // are all left exactly as committed: finalTotal is the amount Razorpay
  // actually captured, and resolving a fulfilment problem must never restate
  // what the customer was charged. Any money owed back to the customer is a
  // refund, which is a separate flow — not this button.
  //
  // Reversible: an admin can re-flag by writing needsReview: true.
  const markReviewed = async (orderId: string) => {
    if (
      !confirm(
        "Mark this order as reviewed?\n\nThis releases it into vendor payout calculations. It does not change the amount charged or issue any refund."
      )
    ) {
      return;
    }

    try {
      await updateDoc(doc(db, "orders", orderId), {
        needsReview: false,
        reviewedAt: serverTimestamp(),
        // Self-attested from the client, like every other admin action on
        // this page. firestore.rules' `allow update: if isAdmin()` controls
        // who may write; this records which admin did.
        reviewedBy: auth.currentUser?.uid || "",
      });

      await logAdminAction("order_review_resolved", orderId, {
        reviewedByEmail: auth.currentUser?.email || "",
      });

      setOrders(
        orders.map((order) =>
          order.id === orderId ? { ...order, needsReview: false } : order
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  // Records that a refund has been INITIATED elsewhere (Razorpay dashboard,
  // UPI, bank transfer). Deliberately does not claim completion — that needs
  // a reference, see recordRefundCompleted below.
  const markRefundProcessing = async (orderId: string) => {
    if (
      !confirm(
        "Mark this refund as in progress?\n\nUse this once you have initiated the refund elsewhere. It does NOT move any money and does not mark the refund complete."
      )
    ) {
      return;
    }

    try {
      await updateDoc(doc(db, "orders", orderId), {
        refundStatus: "Processing",
      });

      await logAdminAction("order_refund_processing", orderId, {
        recordedByEmail: auth.currentUser?.email || "",
      });

      setOrders(
        orders.map((order) =>
          order.id === orderId
            ? { ...order, refundStatus: "Processing" as const }
            : order
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  // Records EVIDENCE of a refund that has already been paid out somewhere
  // else. This button does not send money and must never be usable as a way
  // to declare an order refunded without proof, so both the amount and an
  // external reference (Razorpay refund id / UPI UTR / bank reference) are
  // required before anything is written.
  //
  // paymentStatus is deliberately NOT changed here. Moving it to "Refunded"
  // would alter 18 existing `paymentStatus === "Paid"` checks across the app;
  // that transition belongs to the dedicated refund route in a later phase.
  const recordRefundCompleted = async (order: Order) => {
    const due = Number(order.refundAmountDue || order.finalTotal || 0);

    const amountInput = prompt(
      `Amount actually refunded for order ${order.id.slice(0, 8)} (₹).\n\nAmount owed: ₹${due.toLocaleString(
        "en-IN"
      )}`,
      String(due)
    );
    if (amountInput === null) return;

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid refund amount.");
      return;
    }
    if (amount > due) {
      alert(
        `Refund cannot exceed the amount owed (₹${due.toLocaleString("en-IN")}).`
      );
      return;
    }

    const reference = prompt(
      "Reference for this refund (Razorpay refund id, UPI UTR, or bank reference).\n\nThis is required — it is the evidence that the money actually left."
    );
    if (reference === null) return;

    const refundTransactionId = reference.trim();
    if (!refundTransactionId) {
      alert("A refund reference is required to record a completed refund.");
      return;
    }

    if (
      !confirm(
        `Record this refund as COMPLETED?\n\nAmount: ₹${amount.toLocaleString(
          "en-IN"
        )}\nReference: ${refundTransactionId}\n\nOnly do this if the money has already been returned to the customer.`
      )
    ) {
      return;
    }

    try {
      await updateDoc(doc(db, "orders", order.id), {
        refundStatus: "Refunded",
        refundedAmount: amount,
        refundTransactionId,
        refundedAt: serverTimestamp(),
        refundedBy: auth.currentUser?.uid || "",
      });

      await logAdminAction("order_refund_recorded", order.id, {
        refundedAmount: amount,
        refundTransactionId,
        refundAmountDue: due,
        recordedByEmail: auth.currentUser?.email || "",
      });

      setOrders(
        orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                refundStatus: "Refunded" as const,
                refundedAmount: amount,
                refundTransactionId,
              }
            : o
        )
      );
    } catch (error) {
      console.error(error);
      alert("Couldn't record the refund. Please try again.");
    }
  };

  const updateShipping = async (
    orderId: string,
    field: string,
    value: string
  ) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { [field]: value });
    } catch (error) {
      console.error(error);
    }
  };

  // Only after independently checking YOMICO's own UPI/bank account —
  // this is the one action that promotes AwaitingVerification -> Paid.
  // Guarded here (only ever called when that's the current status) even
  // though the underlying write is admin-unconditional like every other
  // admin order capability in this file — see firestore.rules.
  const verifyPayment = async (order: Order) => {
    if (order.paymentStatus !== "AwaitingVerification") return;
    if (
      !confirm(
        `Confirm ₹${(order.paymentAmount || 0).toLocaleString(
          "en-IN"
        )} was received in YOMICO's UPI account for this order?`
      )
    ) {
      return;
    }

    try {
      await verifyDeliveryPayment(order.id, auth.currentUser?.email || "Admin");
      setOrders(
        orders.map((o) =>
          o.id === order.id ? { ...o, paymentStatus: "Paid" } : o
        )
      );
    } catch (error) {
      console.error(error);
    }
  };
const filtered = orders.filter(
  (order) =>
    order.id.toLowerCase().includes(search.toLowerCase()) ||
    order.customerName.toLowerCase().includes(search.toLowerCase()) ||
    (order.userEmail || "")
      .toLowerCase()
      .includes(search.toLowerCase()) ||
    (order.trackingNumber || "")
      .toLowerCase()
      .includes(search.toLowerCase())
);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">Admin Orders</h1>
          <p className="opacity-90">
            Manage marketplace orders and delivery status
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl shadow-lg">
            <h3>📦 Total Orders</h3>
            <p className="text-3xl font-bold">{totalOrders}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow">
            <h3>⏳ Pending</h3>
            <p className="text-3xl font-bold text-yellow-600">{pendingOrders}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow">
            <h3>✅ Delivered</h3>
            <p className="text-3xl font-bold text-green-600">
              {deliveredOrders}
            </p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow">
            <h3>💰 Revenue</h3>
            <p className="text-3xl font-bold text-blue-600">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow">
            <h3>🚚 In Transit</h3>
            <p className="text-3xl font-bold text-blue-600">{shippedOrders}</p>
          </div>
        </div>

        <input
          type="text"
          placeholder="Search Order ID, Customer, Email or Tracking Number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border p-4 rounded-3xl shadow-lg mb-6"
        />

        {loading ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">
            <p className="text-lg text-gray-500">Loading Orders...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow p-6 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="text-left py-4 px-2">Order ID</th>
                  <th className="text-left py-4">Customer</th>
                  <th className="text-left py-4">Amount</th>
                  <th className="text-left py-4">Status</th>
                  <th className="text-left py-4">Date</th>
                  <th className="text-left py-4">Courier</th>
                  <th className="text-left py-4">Tracking</th>
                  <th className="text-left py-4">Expected Delivery</th>
                  <th className="text-left py-4">Invoice</th>
                  <th className="text-left py-4">POD Payment</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-500">
                      No Orders Found
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b hover:bg-gray-50 transition align-top"
                    >
                      <td className="py-4 px-2">{order.id.slice(0, 8)}</td>
                      <td>{order.customerName}</td>
                      <td>
                        ₹
                        {(order.finalTotal || order.total)?.toLocaleString(
                          "en-IN"
                        )}
                      </td>
                      <td>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            order.status === "Delivered"
                              ? "bg-green-600 text-white"
                              :order.status === "Cancelled"
                               ? "bg-red-600 text-white"
                              : order.status === "Out For Delivery"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {order.status}
                        </span>

                        {order.needsReview === true && (
                          <div className="mt-2 border border-amber-300 bg-amber-50 rounded-lg p-2">
                            <p className="text-amber-800 text-xs font-bold">
                              ⚠ Needs Review
                            </p>

                            <p className="text-amber-700 text-[11px] mt-1">
                              Payment was captured. Vendor earnings for this
                              order are withheld until reviewed.
                            </p>

                            <ul className="text-amber-900 text-[11px] mt-1 list-disc list-inside space-y-0.5">
                              {(order.stockShortfall || []).map((s) => (
                                <li key={s.id}>
                                  {s.name}: wanted {s.wanted}, had {s.available}
                                </li>
                              ))}
                              {order.couponConflict === true && (
                                <li>Coupon already redeemed by this customer</li>
                              )}
                              {(order.rewardShortfall || 0) > 0 && (
                                <li>
                                  Reward shortfall: {order.rewardShortfall}{" "}
                                  points
                                </li>
                              )}
                            </ul>

                            <button
                              onClick={() => markReviewed(order.id)}
                              className="mt-2 bg-amber-600 hover:bg-amber-700 transition text-white px-3 py-1.5 rounded-lg text-xs"
                            >
                              Mark Reviewed
                            </button>
                          </div>
                        )}

                        {/* Refund obligation. YOMICO does not move money from
                            this screen — these controls record what happened
                            elsewhere, which is why the labels say "Record". */}
                        {order.refundStatus === "Required" && (
                          <div className="mt-2 border border-red-300 bg-red-50 rounded-lg p-2">
                            <p className="text-red-800 text-xs font-bold">
                              ⚠ Refund Required — money NOT yet returned
                            </p>
                            <p className="text-red-700 text-[11px] mt-1">
                              Amount owed: ₹
                              {Number(
                                order.refundAmountDue || 0
                              ).toLocaleString("en-IN")}
                              . Refund the customer in Razorpay (or by UPI /
                              bank transfer), then record it here.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => markRefundProcessing(order.id)}
                                className="bg-orange-600 hover:bg-orange-700 transition text-white px-3 py-1.5 rounded-lg text-xs"
                              >
                                Mark In Progress
                              </button>
                              <button
                                onClick={() => recordRefundCompleted(order)}
                                className="bg-red-600 hover:bg-red-700 transition text-white px-3 py-1.5 rounded-lg text-xs"
                              >
                                Record Refund
                              </button>
                            </div>
                          </div>
                        )}

                        {order.refundStatus === "Processing" && (
                          <div className="mt-2 border border-orange-300 bg-orange-50 rounded-lg p-2">
                            <p className="text-orange-800 text-xs font-bold">
                              ⏳ Refund In Progress
                            </p>
                            <p className="text-orange-700 text-[11px] mt-1">
                              Initiated but not yet confirmed. Amount owed: ₹
                              {Number(
                                order.refundAmountDue || 0
                              ).toLocaleString("en-IN")}
                              .
                            </p>
                            <button
                              onClick={() => recordRefundCompleted(order)}
                              className="mt-2 bg-red-600 hover:bg-red-700 transition text-white px-3 py-1.5 rounded-lg text-xs"
                            >
                              Record Refund
                            </button>
                          </div>
                        )}

                        {order.refundStatus === "Refunded" && (
                          <div className="mt-2 border border-green-300 bg-green-50 rounded-lg p-2">
                            <p className="text-green-800 text-xs font-bold">
                              ✅ Refund Recorded
                            </p>
                            <p className="text-green-700 text-[11px] mt-1">
                              ₹
                              {Number(
                                order.refundedAmount || 0
                              ).toLocaleString("en-IN")}{" "}
                              · Ref: {order.refundTransactionId || "—"}
                            </p>
                          </div>
                        )}

                        <div className="w-full bg-gray-200 h-2 rounded-full mt-2">
                          <div
                            className={`h-2 rounded-full bg-green-600 ${
                              order.status === "Pending"
                                ? "w-[15%]"
                                : order.status === "Confirmed"
                                ? "w-[30%]"
                                : order.status === "Packed"
                                ? "w-[50%]"
                                : order.status === "Shipped"
                                ? "w-[70%]"
                                : order.status === "Out For Delivery"
                                ? "w-[90%]"
                                : order.status === "Delivered"
                                ? "w-full"
                                : "w-0"
                            }`}
                          />
                        </div>

                       <select
  value={order.status}
  onChange={(e) => {const value = e.target.value;
    if (value === "Cancelled" && !confirm("Are you sure you want to cancel this order?")
    ) {return;}
    updateStatus(order.id, value);
  }}
                          className="border p-2 rounded-lg mt-2"
                        >
                          <option>Pending</option>
                          <option>Confirmed</option>
                          <option>Packed</option>
                          <option>Shipped</option>
                          <option>Out For Delivery</option>
                          <option>Delivered</option>
                          <option>Cancelled</option>
                        </select>
                      </td>
                      <td>{order.createdAt ? order.createdAt.toDate().toLocaleDateString("en-IN"): "-"}</td>
                      <td>
                        <input
                          type="text"
                          defaultValue={order.courierName || ""}
                         onBlur={(e) => updateShipping( order.id, "courierName", e.target.value.trim() )}
                          className="border p-2 rounded-lg w-32"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          defaultValue={order.trackingNumber || ""}
                        onBlur={(e) => updateShipping(order.id,"trackingNumber", e.target.value.trim())}
                          className="border p-2 rounded-lg w-40"
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          min={new Date().toISOString().split("T")[0]}
                          defaultValue={order.expectedDelivery || ""}
                          onBlur={(e) =>
                            updateShipping(
                              order.id,
                              "expectedDelivery",
                              e.target.value
                            )
                          }
                          className="border p-2 rounded-lg"
                        />
                      </td>
                      <td>
  {order.paymentStatus === "Paid" ? (
    <a
      href={`/admin/orders/${order.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 transition text-white px-3 py-2 rounded-lg inline-block"
    >
      Invoice
    </a>
  ) : (
    <span className="bg-gray-300 text-gray-600 px-3 py-2 rounded-lg inline-block">
      Unpaid
    </span>
  )}
</td>
                      <td>
                        {order.paymentMethod !== PAY_ON_DELIVERY_UPI ? (
                          "-"
                        ) : order.paymentStatus === "Paid" ? (
                          <span className="text-green-700 font-semibold">
                            Payment Verified
                          </span>
                        ) : order.paymentStatus === "AwaitingVerification" ? (
                          <div>
                            <p className="text-xs text-gray-500">
                              Ref: {order.paymentTransactionId}
                            </p>
                            <p className="text-xs text-gray-500 mb-1">
                              ₹{(order.paymentAmount || 0).toLocaleString("en-IN")}
                            </p>
                            <button
                              onClick={() => verifyPayment(order)}
                              className="bg-green-600 hover:bg-green-700 transition text-white px-3 py-2 rounded-lg text-sm"
                            >
                              Verify Payment
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-center py-8 text-gray-500">
        Order Management powered by YOMICO
      </div>
    </div>
  );
}
