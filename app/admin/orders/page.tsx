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
import {
  confirmationTiming,
  deliveryTiming,
  formatIst,
  relativeToNow,
} from "@/lib/orderTiming";
import {
  deriveFulfilmentStage,
  fulfilmentStageLabel,
  stageCounts,
  type ItemFulfilmentMap,
} from "@/lib/itemFulfilment";
import {
  CONFIRMATION_SLA_TEXT,
  CONFIRMATION_SLA_TONE,
  DELIVERY_SLA_TEXT,
  DELIVERY_SLA_TONE,
  formatRemaining,
  orderSlaRow,
  shortOrderLabel,
  type SlaTone,
} from "@/lib/orderSla";

type Order = {
  id: string;
  customerName: string;
  userEmail?: string;
  userId?: string;
  total: number;
  finalTotal?: number;
  status: string;
  orderNumber?: string;
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
  // Timing. Clock A runs from createdAt and is derived on read (createdAt is
  // on every order, including legacy ones); confirmedLate and
  // adminConfirmDeadlineAt are recorded by app/api/confirm-order for the
  // audit trail. Clock B runs from confirmedAt and is stored as
  // deliveryDeadlineAt. See lib/orderTiming.ts.
  vendorIds?: string[];
  confirmedAt?: unknown;
  confirmedBy?: string;
  confirmedLate?: boolean;
  adminConfirmDeadlineAt?: unknown;
  deliveryDeadlineAt?: unknown;
  deliveredAt?: unknown;
};

// Every seller on the order, listed separately with their own fulfilment
// state — a multi-seller order is never collapsed into one status.
function SellerFulfilmentList({
  records,
}: {
  records?: SellerFulfilment[];
}) {
  if (!records || records.length === 0) {
    return (
      <span className="text-xs text-gray-500">
        No seller records (unconfirmed)
      </span>
    );
  }

  return (
    <ul className="space-y-1.5">
      {records.map((record) => {
        // Derived, never stored — the least advanced item in the record.
        const stage = deriveFulfilmentStage(record.itemFulfilment) ?? "—";
        const counts = stageCounts(record.itemFulfilment);
        const lines = record.items || [];

        return (
          <li key={record.id} className="text-xs">
            <span className="font-mono" title={record.vendorId}>
              {record.vendorId.slice(0, 8)}
            </span>{" "}
            <SlaBadge
              tone={stage === "Delivered" ? "ok" : "running"}
              text={fulfilmentStageLabel(stage)}
            />
            <span className="text-gray-400"> (summary)</span>

            <span className="block text-gray-500 mt-0.5">
              ₹{Number(record.vendorEarning || 0).toLocaleString("en-IN")}
              {record.trackingNumber ? ` · ${record.trackingNumber}` : ""}
              {" · "}
              {Object.entries(counts)
                .map(([k, n]) => `${n} ${fulfilmentStageLabel(k)}`)
                .join(", ")}
            </span>

            {/* Each product tracked separately — the seller-level badge above
                is only a roll-up of these. */}
            <ul className="mt-1 ml-3 space-y-0.5 border-l pl-2">
              {lines.map((item, index) => {
                const key = item.itemKey || `${index}`;
                const entry = record.itemFulfilment?.[key];

                return (
                  <li key={key} className="text-[11px] text-gray-700">
                    {String(item.name ?? "item")} × {String(item.qty ?? 1)} —{" "}
                    <span
                      className={
                        entry?.status === "Delivered"
                          ? "text-green-700 font-semibold"
                          : "text-blue-700 font-semibold"
                      }
                    >
                      {fulfilmentStageLabel(entry?.status)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function SlaBadge({ tone, text }: { tone: SlaTone; text: string }) {
  const cls =
    tone === "breach"
      ? "bg-red-100 text-red-800 border-red-300"
      : tone === "ok"
      ? "bg-green-100 text-green-800 border-green-300"
      : tone === "running"
      ? "bg-blue-100 text-blue-800 border-blue-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

  return (
    <span
      className={`inline-block border rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${cls}`}
    >
      {text}
    </span>
  );
}

type SellerFulfilment = {
  id: string;
  orderId: string;
  vendorId: string;
  /** Per line item — the source of truth. The seller-level stage is derived. */
  itemFulfilment?: ItemFulfilmentMap;
  items?: { itemKey?: string; name?: unknown; qty?: unknown }[];
  itemCount?: number;
  vendorEarning?: number;
  courierPartner?: string;
  trackingNumber?: string;
  dispatchDate?: string;
  expectedDelivery?: string;
  confirmedAt?: unknown;
  deliveryDeadlineAt?: unknown;
  deliveredAt?: unknown;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // The SLA table is a separate view rather than a second table always on the
  // page: its countdowns need a ticking clock, and running that behind the
  // order-management table would re-render it every second for nothing.
  // Per-seller fulfilment records, grouped by their parent orderId. Admin
  // reads the whole collection; firestore.rules restricts every other caller
  // to their own vendorId.
  const [sellerRecords, setSellerRecords] = useState<
    Record<string, SellerFulfilment[]>
  >({});

  const [view, setView] = useState<"orders" | "sla">("orders");
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  useEffect(() => {
    if (view !== "sla") return;

    // No synchronous setState here — the first interval tick refreshes the
    // clock a second later, which is invisible against hour/minute
    // countdowns and avoids a cascading render on view switch.
    const id = setInterval(() => setNowTick(new Date()), 1000);

    return () => clearInterval(id);
  }, [view]);

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
          orderNumber: data.orderNumber || "",
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
          // Timing fields the confirm API (app/api/confirm-order) stamps.
          // Without carrying these through, orderSlaRow() receives an order
          // with createdAt but no confirmedAt and reads a genuinely confirmed
          // order as "confirmed before the feature existed": Confirmed shows
          // "—", Clock A reads "No placement time", Clock B reads "Awaiting
          // Confirmation". They are read-only here — no clock is recomputed,
          // no field is duplicated; this just hands the SLA page the data the
          // Order type already declares.
          confirmedAt: data.confirmedAt || null,
          confirmedBy: data.confirmedBy || "",
          // Absent (not false) on an order confirmed on time; orderSlaRow
          // tests === true, so it is carried through as written, not defaulted.
          confirmedLate: data.confirmedLate,
          adminConfirmDeadlineAt: data.adminConfirmDeadlineAt || null,
          deliveryDeadlineAt: data.deliveryDeadlineAt || null,
          deliveredAt: data.deliveredAt || null,
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

      // Per-seller fulfilment records for the SLA view. Nested so a failure
      // here — the collection may not exist yet on a project where nothing
      // has been confirmed since this shipped — cannot lose the orders.
      try {
        const sellerSnap = await getDocs(collection(db, "sellerOrders"));
        const grouped: Record<string, SellerFulfilment[]> = {};

        sellerSnap.forEach((docSnap) => {
          const data = docSnap.data() as Omit<SellerFulfilment, "id">;
          if (!data.orderId) return;

          (grouped[data.orderId] ||= []).push({ id: docSnap.id, ...data });
        });

        for (const list of Object.values(grouped)) {
          list.sort((a, b) => a.vendorId.localeCompare(b.vendorId));
        }

        setSellerRecords(grouped);
      } catch (sellerError) {
        console.error("Failed to load seller fulfilment records:", sellerError);
      }
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
      // Confirmation is server-authoritative because it is what starts the
      // seller's two clocks. /api/confirm-order stamps ONE confirmedAt and
      // derives both the 24h response deadline and the 72h packing ceiling
      // from it, inside a transaction. Writing status straight from here
      // would confirm the order with no deadlines at all, and the seller
      // could then never respond — the rules require all three fields.
      if (status === "Confirmed" && previousStatus === "Pending") {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          alert("Please sign in again.");
          return;
        }

        const idToken = await currentUser.getIdToken();

        const response = await fetch("/api/confirm-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ orderId }),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data?.error || "Couldn't confirm this order.");
          return;
        }
      } else if (status === "Cancelled") {
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
        // The 72h delivery clock is measured against deliveredAt, so the
        // admin path stamps it too — previously only the delivery-partner
        // screen did.
        await updateDoc(doc(db, "orders", orderId), {
          status,
          ...(status === "Delivered" && previousStatus !== "Delivered"
            ? { deliveredAt: serverTimestamp() }
            : {}),
        });
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
          message: `Your order is now ${fulfilmentStageLabel(status)}.`,
          type: "order",
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      // Re-pull from Firestore rather than patching { ...order, status }
      // locally. Confirmation stamps confirmedAt, adminConfirmDeadlineAt,
      // deliveryDeadlineAt and confirmedLate server-side, and marking
      // Delivered stamps deliveredAt; a status-only optimistic patch would
      // leave the SLA row reading a just-confirmed order as untimed
      // (Confirmed "—", Clock A "No placement time", Clock B "Awaiting
      // Confirmation"). Reloading uses the authoritative timestamps the API
      // wrote instead of reconstructing them here.
      await loadOrders();
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
      `Amount actually refunded for order ${shortOrderLabel(order.id)} (₹).\n\nAmount owed: ₹${due.toLocaleString(
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

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setView("orders")}
            className={`px-5 py-2.5 rounded-2xl font-semibold transition ${
              view === "orders"
                ? "bg-green-600 text-white shadow"
                : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            Order Management
          </button>
          <button
            onClick={() => setView("sla")}
            className={`px-5 py-2.5 rounded-2xl font-semibold transition ${
              view === "sla"
                ? "bg-green-600 text-white shadow"
                : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            Order Timing / SLA
          </button>
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
        ) : view === "sla" ? (
          <div className="bg-white rounded-2xl shadow p-4 sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Order Timing / SLA</h2>
              <p className="text-sm text-gray-600 mt-1">
                Two independent clocks.{" "}
                <span className="font-semibold">Clock A — Admin Confirmation</span>{" "}
                runs 24h from order placement.{" "}
                <span className="font-semibold">Clock B — Delivery</span> runs
                72h from admin confirmation. Monitoring only: a passed deadline
                never blocks a status change.
              </p>
            </div>

            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b text-left">
                    <th className="py-3 px-2">Order</th>
                    <th className="py-3 px-2">Placed</th>
                    <th className="py-3 px-2">Confirm by (24h)</th>
                    <th className="py-3 px-2">Confirmed</th>
                    <th className="py-3 px-2">Clock A</th>
                    <th className="py-3 px-2">Deliver by (72h)</th>
                    <th className="py-3 px-2">Delivered</th>
                    <th className="py-3 px-2">Clock B</th>
                    <th className="py-3 px-2">Seller Fulfilment</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => {
                    const row = orderSlaRow(order, nowTick);

                    return (
                      <tr key={order.id} className="border-b align-top">
                        <td className="py-3 px-2 font-mono text-xs" title={order.id}>
                          {row.label}
                        </td>
                        <td className="py-3 px-2">{formatIst(row.createdAt)}</td>
                        <td className="py-3 px-2">
                          {formatIst(row.confirmDeadlineAt)}
                          {row.confirmationRemainingMs !== null && (
                            <div
                              className={`text-xs mt-0.5 ${
                                row.confirmationRemainingMs < 0
                                  ? "text-red-700 font-semibold"
                                  : "text-gray-600"
                              }`}
                            >
                              {formatRemaining(row.confirmationRemainingMs)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2">{formatIst(row.confirmedAt)}</td>
                        <td className="py-3 px-2">
                          <SlaBadge
                            tone={CONFIRMATION_SLA_TONE[row.confirmation]}
                            text={CONFIRMATION_SLA_TEXT[row.confirmation]}
                          />
                        </td>
                        <td className="py-3 px-2">
                          {row.deliveryDeadlineAt ? formatIst(row.deliveryDeadlineAt) : "—"}
                          {row.deliveryRemainingMs !== null && (
                            <div
                              className={`text-xs mt-0.5 ${
                                row.deliveryRemainingMs < 0
                                  ? "text-red-700 font-semibold"
                                  : "text-gray-600"
                              }`}
                            >
                              {formatRemaining(row.deliveryRemainingMs)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2">{formatIst(row.deliveredAt)}</td>
                        <td className="py-3 px-2">
                          <SlaBadge
                            tone={DELIVERY_SLA_TONE[row.delivery]}
                            text={DELIVERY_SLA_TEXT[row.delivery]}
                          />
                        </td>
                        <td className="py-3 px-2">
                          <SellerFulfilmentList
                            records={sellerRecords[order.id]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet: one card per order rather than a squeezed table */}
            <div className="lg:hidden space-y-4">
              {filtered.map((order) => {
                const row = orderSlaRow(order, nowTick);

                return (
                  <div key={order.id} className="border rounded-2xl p-4">
                    <p className="font-mono text-xs text-gray-600 break-all" title={order.id}>
                      {row.label}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-2">
                      <SlaBadge
                        tone={CONFIRMATION_SLA_TONE[row.confirmation]}
                        text={CONFIRMATION_SLA_TEXT[row.confirmation]}
                      />
                      <SlaBadge
                        tone={DELIVERY_SLA_TONE[row.delivery]}
                        text={DELIVERY_SLA_TEXT[row.delivery]}
                      />
                    </div>

                    <dl className="mt-3 text-sm space-y-1">
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Placed</dt>
                        <dd className="text-right">{formatIst(row.createdAt)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Confirm by (24h)</dt>
                        <dd className="text-right">
                          {formatIst(row.confirmDeadlineAt)}
                          {row.confirmationRemainingMs !== null && (
                            <span
                              className={`block text-xs ${
                                row.confirmationRemainingMs < 0
                                  ? "text-red-700 font-semibold"
                                  : "text-gray-600"
                              }`}
                            >
                              {formatRemaining(row.confirmationRemainingMs)}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Confirmed</dt>
                        <dd className="text-right">{formatIst(row.confirmedAt)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Deliver by (72h)</dt>
                        <dd className="text-right">
                          {row.deliveryDeadlineAt ? formatIst(row.deliveryDeadlineAt) : "—"}
                          {row.deliveryRemainingMs !== null && (
                            <span
                              className={`block text-xs ${
                                row.deliveryRemainingMs < 0
                                  ? "text-red-700 font-semibold"
                                  : "text-gray-600"
                              }`}
                            >
                              {formatRemaining(row.deliveryRemainingMs)}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500">Delivered</dt>
                        <dd className="text-right">{formatIst(row.deliveredAt)}</dd>
                      </div>
                    </dl>

                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Seller Fulfilment
                      </p>
                      <SellerFulfilmentList records={sellerRecords[order.id]} />
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <p className="text-center text-gray-500 py-8">No orders match.</p>
            )}
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
                      {/* id.slice(0, 8) showed the CUSTOMER uid prefix for
                          pay-on-delivery orders (ids are
                          `${customerUid}_${idempotencyKey}`), so every order
                          by one customer rendered identically. The full id is
                          on the title attribute. */}
                      <td className="py-4 px-2" title={order.id}>
                        {order.orderNumber || shortOrderLabel(order.id)}
                      </td>
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
                          {fulfilmentStageLabel(order.status)}
                        </span>

                        {/* Order timing. Two independent clocks — see
                            lib/orderTiming.ts. Both are observational: an
                            overdue order is never blocked or auto-cancelled,
                            and an admin can always still confirm. */}
                        {(() => {
                          const confirmation = confirmationTiming(order);
                          const delivery = deliveryTiming(order);

                          if (
                            confirmation.state === "not-applicable" &&
                            delivery.state === "not-started"
                          ) {
                            return null;
                          }

                          const breached =
                            confirmation.breached || delivery.breached;

                          return (
                            <div
                              className={`mt-2 border rounded-lg p-2 ${
                                breached
                                  ? "border-red-300 bg-red-50"
                                  : "border-blue-300 bg-blue-50"
                              }`}
                            >
                              <p
                                className={`text-xs font-bold ${
                                  breached ? "text-red-800" : "text-blue-900"
                                }`}
                              >
                                Order Timing
                              </p>

                              <ul
                                className={`text-[11px] mt-1 space-y-0.5 ${
                                  breached ? "text-red-900" : "text-blue-900"
                                }`}
                              >
                                {confirmation.deadlineAt && (
                                  <li>
                                    Confirm by (24h from placement):{" "}
                                    {formatIst(confirmation.deadlineAt)}
                                    {confirmation.state === "awaiting" &&
                                      " · " +
                                        relativeToNow(confirmation.deadlineAt)}
                                    {confirmation.state === "overdue" &&
                                      " · CONFIRMATION OVERDUE"}
                                    {confirmation.state === "late" &&
                                      " · confirmed late"}
                                    {confirmation.state === "on-time" &&
                                      " · confirmed on time"}
                                  </li>
                                )}

                                {delivery.deadlineAt && (
                                  <li>
                                    Deliver by (72h from confirmation):{" "}
                                    {formatIst(delivery.deadlineAt)}
                                    {delivery.state === "on-track" &&
                                      " · " + relativeToNow(delivery.deadlineAt)}
                                    {delivery.state === "overdue" &&
                                      " · DELIVERY OVERDUE"}
                                    {delivery.state === "met" &&
                                      " · delivered on time"}
                                    {delivery.state === "late" &&
                                      " · delivered late"}
                                  </li>
                                )}

                                {delivery.deliveredAt && (
                                  <li>
                                    Delivered: {formatIst(delivery.deliveredAt)}
                                  </li>
                                )}
                              </ul>
                            </div>
                          );
                        })()}

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
                          <option value="Pending">Pending</option>
                          <option value="Confirmed">
                            {fulfilmentStageLabel("Confirmed")}
                          </option>
                          <option value="Packed">
                            {fulfilmentStageLabel("Packed")}
                          </option>
                          <option value="Shipped">
                            {fulfilmentStageLabel("Shipped")}
                          </option>
                          <option value="Out For Delivery">
                            {fulfilmentStageLabel("Out For Delivery")}
                          </option>
                          <option value="Delivered">
                            {fulfilmentStageLabel("Delivered")}
                          </option>
                          <option value="Cancelled">Cancelled</option>
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
