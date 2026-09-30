"use client";

import { useEffect, useState } from "react";
import { useVendor } from "@/hooks/useVendor";
import { fetchSellerAnalytics } from "@/lib/sellerAnalytics/sellerAnalyticsClient";
import type { SellerAnalytics } from "@/lib/sellerAnalytics/sellerAnalytics";

import SellerDashboard from "@/components/seller/SellerDashboard";
import OnboardingChecklist from "./components/OnboardingChecklist";
import DashboardCards from "./components/DashboardCards";
import QuickActions from "./components/QuickActions";
import NotificationsPanel from "./components/NotificationsPanel";
import SalesChart from "./components/SalesChart";
import RecentOrders from "./components/RecentOrders";
import LowStockProducts from "./components/LowStockProducts";

export default function SellerPage() {
  const { vendor, vendorId, loading: vendorLoading } = useVendor();

  // One server call (app/api/seller/analytics) feeds the cards and every
  // widget: this seller's own products and order summaries aggregated on the
  // server, with Commission / Total Earnings from the one settlement
  // calculation (lib/vendorPayable) — the same figures as the wallet. The
  // dashboard no longer reads product documents or order lists itself, and
  // its totals no longer stop at the 200 most recent orders.
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) {
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    setDataLoading(true);
    fetchSellerAnalytics()
      .then((result) => {
        if (cancelled) return;
        if (result.error) console.error("Seller analytics:", result.error);
        setAnalytics(result.data);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const products = analytics?.products;
  const orders = analytics?.orders;
  const stats = {
    totalProducts: products?.total ?? 0,
    totalOrders: orders?.total ?? 0,
    // The seller's OWN stage Confirmed (not the whole-order status, which on
    // a multi-seller order can lag behind this seller's own progress).
    pendingOrders: orders?.toPack ?? 0,
    earnings: orders?.bookedSales ?? 0,
    commissionPaid: analytics?.settlement.commission ?? 0,
    netEarnings: analytics?.settlement.adjustedEarnings ?? 0,
    totalViews: products?.totalViews ?? 0,
    totalSales: orders?.unitsSold ?? 0,
    bestSeller: orders?.bestSelling[0]?.name || "None",
  };

  if (vendorLoading) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      Loading dashboard...
    </div>
  );
}
return (
<div className="min-h-screen bg-gray-50">

  {/* HEADER */}

  <div className="bg-gradient-to-r from-green-700 via-teal-600 to-blue-700 px-5 md:px-8 py-6 text-white">

    <p className="text-sm uppercase tracking-widest opacity-80">
      YOMICO Seller Dashboard
    </p>

    <h1 className="mt-2 text-3xl font-bold md:text-5xl">
      👋 Welcome Back,
    </h1>

    <h2 className="mt-2 text-2xl break-words">
      {vendor?.businessName || vendor?.storeName || "Seller"}
    </h2>

    <p className="mt-3 opacity-90">
      Manage your products, inventory, orders and business growth from one dashboard.
    </p>

  </div>

  <div className="p-6">

    <SellerDashboard>

      {vendor && vendorId && (
        <OnboardingChecklist vendor={vendor} vendorId={vendorId} />
      )}

      <DashboardCards
        totalProducts={stats.totalProducts}
        totalOrders={stats.totalOrders}
        pendingOrders={stats.pendingOrders}
        earnings={stats.earnings}
        commissionPaid={stats.commissionPaid}
        netEarnings={stats.netEarnings}
      />

      <div className="mt-6">
        <QuickActions />
      </div>

      <div className="mt-6">
        <NotificationsPanel />
      </div>

      <div className="mt-6">
        <SalesChart
          monthly={orders?.monthly || []}
          year={orders?.year ?? null}
          loading={dataLoading}
        />
      </div>

      <div className="mt-6">
        <RecentOrders
          orders={orders?.recent || []}
          loading={dataLoading}
        />
      </div>

      <div className="mt-6">
        <LowStockProducts products={products?.restock || []} loading={dataLoading} />
      </div>

      {/* SECONDARY STATS */}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">

        <div className="rounded-2xl bg-white p-6 shadow-sm">

          <p className="flex items-center gap-2 text-gray-500">
            👁 Total Views
          </p>

          <p className="mt-2 text-3xl font-bold text-indigo-600">
            {stats.totalViews}
          </p>

        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">

          <p className="flex items-center gap-2 text-gray-500">
            📦 Units Sold
          </p>

          <p className="mt-2 text-3xl font-bold text-green-600">
            {stats.totalSales}
          </p>

        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">

          <p className="flex items-center gap-2 text-gray-500">
            🏆 Best Seller
          </p>

          <p className="mt-2 text-xl font-bold text-orange-600 break-words">
            {stats.bestSeller}
          </p>

        </div>

      </div>

    </SellerDashboard>

  </div>

</div>

);
}