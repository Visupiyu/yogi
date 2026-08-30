"use client";

import { useState } from "react";
import Link from "next/link";
import { ORDER_STEPS, TOTAL_STEPS, getStep } from "@/lib/orderTracking";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";

// Guest order tracking.
//
// This page previously rendered a single sentence telling the visitor to go to
// /orders instead — a dead end, and a misleading one: it is linked from
// TopStrip on every page of the site, and /orders requires a login, so a guest
// following "Track Order" had nowhere to go.
//
// Everything shown here comes from /api/track-order, which requires the order
// id AND the email on the order and returns a minimal projection. No private
// order data reaches this component, so there is nothing here to leak.

type Tracking = {
  status: string;
  createdAt: string | null;
  deliveryDate: string | null;
  expectedDelivery: string | null;
  deliveredAt: string | null;
  courierName: string | null;
  trackingNumber: string | null;
  refundStatus: string | null;
};

export default function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Tracking | null>(null);

  const track = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orderId.trim() || !email.trim()) {
      setError("Enter both your order ID and the email used to order.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/track-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId.trim(), email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "We couldn't track that order.");
        return;
      }

      setResult(data.order as Tracking);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Cancelled orders have no position on the six-step tracker, so the timeline
  // is replaced by a notice — same treatment as app/orders/[id].
  const isCancelled = result?.status === "Cancelled";
  const step = result ? getStep(result.status) : 0;

  const formatDate = (value: string | null) => {
    if (!value) return null;
    // deliveryDate / expectedDelivery arrive as pre-formatted display strings;
    // timestamps arrive as ISO. Only the latter needs converting.
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <section className="bg-gray-50 min-h-screen py-10">
      <div className="max-w-4xl mx-auto px-5">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl text-white p-8 mb-8">
          <h1 className="text-4xl font-bold">📍 Track Your Order</h1>
          <p className="mt-2 text-lg opacity-90">
            Enter your order ID and the email you ordered with — no account
            needed.
          </p>
        </div>

        {/* FORM */}
        <form
          onSubmit={track}
          className="bg-white rounded-3xl shadow border p-6 md:p-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Order ID
              </label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="e.g. pay_XXXXXXXXXXXX"
                className="w-full border p-3 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Email used to order
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border p-3 rounded-xl"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-5 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:opacity-50 transition text-white px-8 py-3 rounded-xl font-semibold shadow-lg"
          >
            {loading ? "Tracking..." : "Track Order"}
          </button>

          <p className="mt-4 text-sm text-gray-500">
            Signed in already?{" "}
            <Link href="/orders" className="text-blue-700 font-semibold">
              View all your orders
            </Link>
          </p>
        </form>

        {/* ERROR */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-3xl p-6 text-center">
            <p className="text-red-600 font-semibold">{error}</p>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="mt-6 bg-white rounded-3xl shadow border p-10 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-green-600 border-t-transparent mx-auto" />
            <p className="mt-4 font-semibold text-gray-600">
              Looking up your order...
            </p>
          </div>
        )}

        {/* RESULT */}
        {result && !loading && (
          <div className="mt-6 space-y-6">
            <div className="bg-white rounded-3xl shadow border p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold">Order Status</h2>
                <span
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                    result.status === "Delivered"
                      ? "bg-green-600 text-white"
                      : result.status === "Cancelled"
                      ? "bg-red-600 text-white"
                      : result.status === "Delivery Failed"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {fulfilmentStageLabel(result.status)}
                </span>
              </div>

              {isCancelled ? (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-6">
                  <h3 className="text-xl font-bold text-red-700">
                    ❌ Order Cancelled
                  </h3>
                  <p className="mt-2 text-gray-700">
                    This order has been cancelled.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-8 flex items-center justify-between overflow-x-auto">
                    {ORDER_STEPS.map((label, index) => (
                      <div
                        key={label}
                        className="flex flex-col items-center flex-1 min-w-[110px]"
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                            step >= index + 1
                              ? "bg-green-600 text-white"
                              : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <span
                          className={`mt-2 text-xs text-center ${
                            step >= index + 1
                              ? "text-green-700 font-semibold"
                              : "text-gray-400"
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="w-full bg-gray-200 h-2 rounded-full mt-6">
                    <div
                      className="h-2 rounded-full bg-green-600 transition-all"
                      style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                    />
                  </div>

                  {result.status === "Delivery Failed" && (
                    <div className="mt-6 bg-orange-50 border border-orange-200 rounded-2xl p-5">
                      <p className="font-bold text-orange-700">
                        ⚠️ Delivery Attempt Failed
                      </p>
                      <p className="mt-1 text-gray-700 text-sm">
                        We couldn&apos;t deliver your order. Our delivery
                        partner will retry soon.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* DELIVERY / COURIER */}
            {(result.deliveryDate ||
              result.expectedDelivery ||
              result.deliveredAt ||
              result.courierName ||
              result.trackingNumber) && (
              <div className="bg-white rounded-3xl shadow border p-6 md:p-8">
                <h2 className="text-xl font-bold mb-4">🚚 Delivery Details</h2>
                <div className="space-y-3 text-sm">
                  {result.deliveredAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivered on</span>
                      <span className="font-semibold">
                        {formatDate(result.deliveredAt)}
                      </span>
                    </div>
                  )}
                  {result.expectedDelivery && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Expected delivery</span>
                      <span className="font-semibold">
                        {formatDate(result.expectedDelivery)}
                      </span>
                    </div>
                  )}
                  {result.deliveryDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estimated delivery</span>
                      <span className="font-semibold">
                        {formatDate(result.deliveryDate)}
                      </span>
                    </div>
                  )}
                  {result.courierName && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Courier</span>
                      <span className="font-semibold">
                        {result.courierName}
                      </span>
                    </div>
                  )}
                  {result.trackingNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tracking number</span>
                      <span className="font-semibold">
                        {result.trackingNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* REFUND */}
            {result.refundStatus === "Required" && (
              <div className="bg-white rounded-3xl shadow border p-6 md:p-8">
                <p className="font-semibold text-amber-700">Refund pending</p>
                <p className="text-gray-600 mt-1 text-sm">
                  A refund is being arranged for this cancelled order. It has
                  not been sent yet.
                </p>
              </div>
            )}

            {result.refundStatus === "Processing" && (
              <div className="bg-white rounded-3xl shadow border p-6 md:p-8">
                <p className="font-semibold text-orange-700">
                  Refund in progress
                </p>
                <p className="text-gray-600 mt-1 text-sm">
                  Your refund has been initiated. It may take a short while to
                  be completed.
                </p>
              </div>
            )}

            {result.refundStatus === "Refunded" && (
              <div className="bg-white rounded-3xl shadow border p-6 md:p-8">
                <p className="font-semibold text-green-700">Refunded</p>
                <p className="text-gray-600 mt-1 text-sm">
                  Your refund has been processed. Sign in to your account to see
                  the full details.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
