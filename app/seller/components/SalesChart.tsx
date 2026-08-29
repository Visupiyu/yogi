"use client";

import { useEffect, useState } from "react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

export default function SalesChart() {

  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const unsub = onAuthStateChanged(auth, async (user) => {

      if (!user) {
        setLoading(false);
        return;
      }

      try {

        const q = query(
          collection(db, "orders"),
          where("vendorIds", "array-contains", user.uid),
          // Sellers must never see a Pending order: it belongs to them only once
          // an admin confirms it. firestore.rules enforces this on the orders
          // read rule, and the rules engine REJECTS this entire query unless it
          // carries a filter proving the constraint - an unfiltered
          // array-contains query returns permission-denied. Load-bearing, not
          // cosmetic. Needs the orders vendorIds+status composite index.
          where("status", "!=", "Pending")
        );

        const snapshot = await getDocs(q);

        const monthly: Record<string, number> = {};

        snapshot.forEach((docSnap) => {

          const order: any = docSnap.data();

          if (!order.createdAt) return;

          if (order.status === "Cancelled") return;

          // order.finalTotal is the WHOLE order's total — in a
          // multi-vendor order that would count other sellers' items as
          // this seller's revenue too. Sum only this seller's own items.
          const vendorRevenue = (order.items || [])
            .filter((item: any) => item.vendorId === user.uid)
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

        const data = Object.entries(monthly).map(
          ([month, revenue]) => ({
            month,
            revenue,
          })
        );

        setChartData(data);

      } catch (err) {

        console.error(err);

      } finally {

        setLoading(false);

      }

    });

    return () => unsub();

  }, []);
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