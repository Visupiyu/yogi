"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearCheckoutAfterOrder } from "@/lib/cart";
import { clearPendingPayment, type PendingPayment } from "@/lib/pendingPayment";

// Shown INSTEAD of the checkout while a payment has been received but the order
// could not be confirmed (lib/pendingPayment.ts). It never offers payment and
// never claims an order exists: it only (a) looks for the order, which the
// webhook may have created, and (b) on request re-sends the same identifiers to
// the idempotent finalize route. Resolution clears the cart exactly as a normal
// order would (a Buy Now order leaves the cart alone).
export default function PaymentPending({ pending }: { pending: PendingPayment }) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolved = useCallback(() => {
    clearCheckoutAfterOrder(pending.source);
    clearPendingPayment();
    // The online order's id is the Razorpay payment id; the order page shows the
    // confirmation banner.
    window.location.href = `/orders/${encodeURIComponent(pending.razorpayPaymentId)}?placed=online`;
  }, [pending.source, pending.razorpayPaymentId]);

  // The online order's document id IS the Razorpay payment id, and the owner can
  // read it — so "has the webhook created it yet?" needs no new endpoint.
  const orderExists = useCallback(async () => {
    const snap = await getDoc(doc(db, "orders", pending.razorpayPaymentId));
    return snap.exists();
  }, [pending.razorpayPaymentId]);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    setMessage(null);
    try {
      if (await orderExists()) {
        resolved();
        return;
      }
      setMessage("Your order isn't showing yet. Please try again in a moment.");
    } catch {
      setMessage("We couldn't check right now. Please try again in a moment.");
    } finally {
      setChecking(false);
    }
  }, [orderExists, resolved]);

  useEffect(() => {
    void checkAgain();
  }, [checkAgain]);

  const retryConfirmation = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("signed out");
      const token = await user.getIdToken();
      const response = await fetch("/api/finalize-online-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // Identifiers only — exactly what the payment handler sends.
        body: JSON.stringify({
          razorpay_order_id: pending.razorpayOrderId,
          razorpay_payment_id: pending.razorpayPaymentId,
          razorpay_signature: pending.razorpaySignature,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.orderId) {
        resolved();
        return;
      }
      setMessage(data?.error || "We still couldn't confirm your order. Please try again shortly or contact support.");
    } catch {
      setMessage("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="py-12 px-4 bg-gray-50 min-h-screen">
      <div className="max-w-xl mx-auto bg-white rounded-3xl shadow p-8 text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold">Payment received — confirming your order</h1>
        <p className="mt-3 text-gray-600">
          We received your payment, but we haven&apos;t been able to confirm your order yet.
          <strong> Please don&apos;t pay again.</strong> Once it is confirmed it will appear in My Orders.
        </p>
        <p className="mt-3 text-xs text-gray-400 break-all">Payment reference: {pending.razorpayPaymentId}</p>

        {message && (
          <p role="status" className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {message}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={retryConfirmation}
            disabled={checking}
            className="rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-3 font-semibold"
          >
            {checking ? "Checking…" : "Retry confirmation"}
          </button>
          <button
            type="button"
            onClick={() => void checkAgain()}
            disabled={checking}
            className="rounded-xl border py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Check my order again
          </button>
          <Link href="/orders" className="text-green-700 font-semibold hover:underline">
            Go to My Orders
          </Link>
          <Link href="/support" className="text-sm text-gray-500 hover:underline">
            Contact support
          </Link>
        </div>
      </div>
    </section>
  );
}
