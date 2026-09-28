"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

// The monthly figures are aggregated on the server (app/api/seller/analytics,
// lib/sellerAnalytics) from this seller's own lines on orders that are not
// cancelled, bucketed by IST month of the current year. This widget used to
// bucket by month NAME alone, which merged e.g. Jan 2025 into Jan 2026, and
// only ever saw the 200 most recent orders.

type SalesChartProps = {
  monthly: { month: string; bookedSales: number }[];
  year: number | null;
  loading: boolean;
};

export default function SalesChart({ monthly, year, loading }: SalesChartProps) {
  const chartData = (monthly || []).map((m) => ({ month: m.month, revenue: m.bookedSales }));
  const hasSales = chartData.some((m) => m.revenue > 0);

 return (
  <div className="rounded-2xl border bg-white p-6 shadow-sm">

    <div className="mb-6 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        📈 Sales Overview
      </h2>

      <span className="text-sm text-gray-500">
        Monthly Booked Sales{year ? ` — ${year}` : ""}
      </span>

    </div>

    {loading ? (

      <div className="h-72 flex items-center justify-center">
        Loading...
      </div>

    ) : !hasSales ? (

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
