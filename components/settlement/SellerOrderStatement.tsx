"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import type { SellerOrderStatement as Statement } from "@/lib/sellerOrderStatement";

// The seller's settlement for ONE order, from /api/seller/order-statement —
// i.e. from the shared settlement engine (lib/vendorPayable). This is the
// authoritative seller figure for the order; the GST tax invoice is not.

const STATUS_TEXT: Record<Statement["settlementStatus"], string> = {
  SETTLEMENT_ELIGIBLE: "Settled — counted in your payable balance",
  PENDING_DELIVERY: "Projected — becomes payable once delivered and paid",
  AWAITING_PAYMENT_CONFIRMATION: "Projected — awaiting payment confirmation",
  ON_HOLD_REVIEW: "On hold — under admin review",
  NOT_PAYABLE: "Not payable — order cancelled or returned",
};

function rupees(value: number): string {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function SellerOrderStatement({ orderId }: { orderId: string }) {
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Please sign in again.");
        const res = await fetch(
          `/api/seller/order-statement?orderId=${encodeURIComponent(orderId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Could not load the settlement statement.");
        if (!cancelled) setStatement(data.statement as Statement);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (orderId) load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return <div className="bg-white rounded-3xl shadow p-6 text-gray-500">Loading settlement statement…</div>;
  }
  if (error || !statement) {
    return <div className="bg-white rounded-3xl shadow p-6 text-red-600">{error || "Settlement statement unavailable."}</div>;
  }

  const f = statement.figures;
  const rows: { label: string; value: string; note?: string }[] = [
    { label: "Gross item sales (your items)", value: rupees(f.grossSales) },
    { label: "Seller-funded discount / coupon share", value: `− ${rupees(f.discountShare)}` },
    // H3: a coupon on this order paid for by YOMICO. Shown for transparency
    // only — it is not deducted from what you earn.
    ...(Number(f.yomicoCouponShare) > 0
      ? [{
          label: "Coupon funded by YOMICO",
          value: rupees(f.yomicoCouponShare),
          note: "Paid by YOMICO — not deducted from your earnings",
        }]
      : []),
    { label: "YOMICO commission", value: rupees(f.commission), note: "YOMICO charges 0% commission" },
    {
      label: "Seller delivery charge",
      value: `− ${rupees(f.sellerDeliveryCharges)}`,
      note: statement.freeDeliveryApplied
        ? `Your share of this order's single ₹${statement.orderDeliveryCost} delivery cost (free delivery for the customer)`
        : "Customer paid delivery on this order",
    },
    { label: "Return / refund deductions", value: `− ${rupees(f.returnDeductions)}` },
    ...(f.returnLogisticsCharges > 0
      ? [{ label: "Return logistics deduction", value: `− ${rupees(f.returnLogisticsCharges)}` }]
      : []),
  ];

  return (
    <div className="bg-white rounded-3xl shadow p-6">
      <h2 className="text-2xl font-bold mb-1">Seller Order Settlement Statement</h2>
      <p className="text-sm text-gray-500 mb-4">
        This statement — not the GST tax invoice — is the record of what you earn for this order.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-4">
        <div><span className="text-gray-500">Order:</span> {statement.orderNumber || statement.orderId}</div>
        <div>
          <span className="text-gray-500">Date:</span>{" "}
          {statement.orderDate ? new Date(statement.orderDate).toLocaleDateString("en-IN") : "-"}
        </div>
        <div><span className="text-gray-500">Order status:</span> {statement.orderStatus || "-"}</div>
        <div><span className="text-gray-500">Payment:</span> {statement.paymentMethod || "-"} · {statement.paymentStatus || "-"}</div>
      </div>

      <div className="rounded-2xl border p-4 mb-4 bg-gray-50">
        <div className="flex justify-between text-sm">
          <span>Customer order value (whole order, all sellers, incl. any customer delivery charge)</span>
          <span className="font-semibold">{rupees(statement.customerOrderTotal)}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">What the customer paid — not your settlement amount.</p>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b">
              <td className="py-2">
                {row.label}
                {row.note && <div className="text-xs text-gray-500">{row.note}</div>}
              </td>
              <td className="py-2 text-right font-medium whitespace-nowrap">{row.value}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-3 font-bold">Your net settlement for this order</td>
            <td className="pt-3 text-right font-bold text-green-700 whitespace-nowrap">{rupees(f.adjustedEarnings)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4 text-sm font-medium">{STATUS_TEXT[statement.settlementStatus]}</p>
      {statement.deliveryChargeSource === "legacy-recalculated" && (
        <p className="mt-1 text-xs text-gray-500">
          Delivery charge recalculated from the order (confirmed before per-seller delivery charges were recorded).
        </p>
      )}
    </div>
  );
}
