"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { fetchSellerAnalytics } from "@/lib/sellerAnalytics/sellerAnalyticsClient";
import type { SellerAnalytics } from "@/lib/sellerAnalytics/sellerAnalytics";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";

const COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#0891b2"];

export default function SellerAnalyticsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      loadAnalytics();

    });

    return () => unsubscribe();
  }, [router]);

  // Every figure is aggregated on the server (app/api/seller/analytics) from
  // this seller's own products and order summaries, with money from the one
  // settlement calculation (lib/vendorPayable). This page used to download
  // the WHOLE product and product-review collections — every seller's
  // listings and every reviewer's email — and filter them in the browser.
  const loadAnalytics = async () => {
    const result = await fetchSellerAnalytics();
    setData(result.data);
    setError(result.error);
    setLoading(false);
  };

  if (loading) {
    return <div className="p-10 text-center">Loading Analytics...</div>;
  }

  if (!data) {
    return <div className="p-10 text-center text-red-600">{error || "Could not load your analytics."}</div>;
  }

  const { products, orders, settlement } = data;
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // Booked sales = this seller's own item value on orders that are not
  // cancelled. Commission and Net Earnings are the settlement figures
  // (Delivered + Paid, returns and delivery charges netted).
  const bookedSales = orders.bookedSales;
  const averageRating = products.reviews.count ? products.reviews.averageRating.toFixed(1) : "0";
  const bestSeller = orders.bestSelling[0]?.name || "N/A";
  const lowStockProducts = products.inventory.low + products.inventory.out;
  const awaitingAction = orders.toPack + orders.toShip;

  const chartData = [
    { name: "Products", value: products.total },
    { name: "Orders", value: orders.total },
    { name: "Reviews", value: products.reviews.count },
  ];

  const revenueChart = [
    { name: "Booked Sales", amount: bookedSales },
    { name: "Net Earnings", amount: settlement.adjustedEarnings },
  ];

  const bestSellingProducts = orders.bestSelling.map((p) => ({ name: p.name, qty: p.units }));

  const orderStatusData = Object.entries(orders.byStage).map(([name, value]) => ({ name, value }));

  const inventoryData = [
    { name: "Healthy", value: products.inventory.healthy },
    { name: "Low Stock", value: products.inventory.low },
    { name: "Out of Stock", value: products.inventory.out },
  ];

  const monthlyRevenue = orders.monthly.map((m) => ({ month: m.month, revenue: m.bookedSales }));

  const kpis = [
    { icon: "🏆", label: "Best Seller", value: bestSeller },
    { icon: "📦", label: "Awaiting Pack / Ship", value: awaitingAction },
    { icon: "📉", label: "Low / Out of Stock", value: lowStockProducts },
    { icon: "💸", label: "Commission", value: inr(settlement.commission) },
    { icon: "💵", label: "Net Earnings", value: inr(settlement.adjustedEarnings) },
    { icon: "🛒", label: "Units Sold", value: orders.unitsSold },
    { icon: "⭐", label: "Total Reviews", value: products.reviews.count },
    { icon: "💰", label: "Booked Sales", value: inr(bookedSales) },
    { icon: "📋", label: "Orders", value: orders.total },
    { icon: "📦", label: "Products", value: products.total },
    { icon: "⭐", label: "Average Rating", value: averageRating },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8">
          <h1 className="text-4xl font-bold">Seller Analytics</h1>
          <p className="mt-2">Business Performance Dashboard</p>
          <p className="mt-2 text-sm opacity-90">
            Booked Sales is your item value on orders that are not cancelled. Net Earnings is settled money
            (delivered and paid), the same figure as your wallet.
          </p>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-[28px] shadow-lg border border-gray-100 p-8 min-h-[170px] flex items-center gap-6"
            >
              <div className="w-20 h-20 rounded-3xl bg-blue-100 flex items-center justify-center text-4xl flex-shrink-0">
                {kpi.icon}
              </div>
              <div>
                <p className="text-gray-500 text-lg">{kpi.label}</p>
                <h2
                  title={String(kpi.value)}
                  className={`font-bold mt-2 break-words ${
                    typeof kpi.value === "string" && kpi.value.length > 14
                      ? "text-xl leading-snug line-clamp-2"
                      : "text-4xl"
                  }`}
                >
                  {kpi.value}
                </h2>
              </div>
            </div>
          ))}
        </div>

        {/* CHARTS — Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[500px]">
            <h2 className="text-2xl font-bold mb-6">📊 Business Overview</h2>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie data={chartData} dataKey="value" cx="50%" cy="50%" outerRadius={140} label>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[500px]">
            <h2 className="text-2xl font-bold mb-6">💰 Sales &amp; Earnings</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={revenueChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHARTS — Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[500px]">
            <h2 className="text-2xl font-bold mb-6">🔥 Best Selling Products</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={bestSellingProducts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="qty" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[500px]">
            <h2 className="text-2xl font-bold mb-8">📈 Business Insights</h2>
            <div className="space-y-6 text-lg">
              <div className="flex justify-between border-b pb-3">
                <span>💰 Booked Sales</span>
                <strong>{inr(bookedSales)}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>💵 Withdrawable Now</span>
                <strong>{inr(settlement.available)}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>🏆 Best Seller</span>
                <strong>{bestSeller}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>⭐ Rating</span>
                <strong>{averageRating}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>📦 Low / Out of Stock</span>
                <strong>{lowStockProducts}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>📦 To Pack</span>
                <strong>{orders.toPack}</strong>
              </div>
              <div className="flex justify-between">
                <span>🚚 To Ship</span>
                <strong>{orders.toShip}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly booked sales (this calendar year, IST) */}
        <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[550px]">
          <h2 className="text-2xl font-bold mb-6">📈 Monthly Booked Sales — {orders.year}</h2>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[500px]">
            <h2 className="text-2xl font-bold mb-6">📦 Order Status (your items)</h2>
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie data={orderStatusData} dataKey="value" outerRadius={140} label>
                  {orderStatusData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[500px]">
            <h2 className="text-2xl font-bold mb-6">📦 Inventory Health</h2>
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie data={inventoryData} dataKey="value" outerRadius={140} label>
                  {inventoryData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
