"use client";

import { useMemo } from "react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

// Orders + vendorId are provided by the parent dashboard (app/seller/page.tsx),
// which loads the seller's non-pending orders ONCE and shares them. This
// component no longer queries Firestore itself; the monthly aggregation below
// is unchanged from when it fetched its own copy.
type SalesChartProps = {
  orders: any[];
  vendorId: string;
  loading: boolean;
};

export default function SalesChart({ orders, vendorId, loading }: SalesChartProps) {

  const chartData = useMemo(() => {
    const monthly: Record<string, number> = {};

    (orders || []).forEach((order: any) => {

      if (!order.createdAt) return;

      if (order.status === "Cancelled") return;

      // order.finalTotal is the WHOLE order's total — in a
      // multi-vendor order that would count other sellers' items as
      // this seller's revenue too. Sum only this seller's own items.
      const vendorRevenue = (order.items || [])
        .filter((item: any) => item.vendorId === vendorId)
        .reduce(
          (sum: number, item: any) => sum + (item.price || 0) * (item.qty || 0),
          0
        );

      if (vendorRevenue === 0) return;

      const date = order.createdAt.toDate();

      const month =
        date.toLocaleString("default", {
          month: "short",
        });

      monthly[month] =
        (monthly[month] || 0) + vendorRevenue;

    });

    return Object.entries(monthly).map(
      ([month, revenue]) => ({
        month,
        revenue,
      })
    );
  }, [orders, vendorId]);
 return (
  <div className="rounded-2xl border bg-white p-6 shadow-sm">

    <div className="mb-6 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        📈 Sales Overview
      </h2>

      <span className="text-sm text-gray-500">
        Monthly Revenue
      </span>

    </div>

    {loading ? (

      <div className="h-72 flex items-center justify-center">
        Loading...
      </div>

    ) : chartData.length === 0 ? (

      <div className="h-72 flex items-center justify-center text-gray-500">
        No sales data available.
      </div>

    ) : (

      <div className="w-full h-[350px] min-w-0">

        <ResponsiveContainer width="99%" height="100%">

          <LineChart data={chartData}>

            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="month" />

            <YAxis />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#16a34a"
              strokeWidth={3}
            />

          </LineChart>

        </ResponsiveContainer>

      </div>

    )}

  </div>
);
}