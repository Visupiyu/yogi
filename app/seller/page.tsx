"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useVendor } from "@/hooks/useVendor";
import { computeVendorShare } from "@/lib/vendorEarnings";

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

  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    pendingOrders: 0,
    earnings: 0,
    commissionPaid: 0,
    netEarnings: 0,
    totalViews: 0,
    totalSales: 0,
    bestSeller: "None",
  });

  // Fetched ONCE here and shared with the child widgets (SalesChart,
  // RecentOrders, LowStockProducts) as props, so the seller's products and
  // orders are each read a single time per dashboard load instead of the
  // widgets re-querying the same seller-scoped data. Query semantics are
  // unchanged; the children only consume this already-loaded, seller-scoped
  // data and keep their own computations.
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) {
      setDataLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      // ---- Products (scoped by vendorId = uid) ----
      const productSnap = await getDocs(
        query(collection(db, "products"), where("vendorId", "==", vendorId))
      );
      const productList = productSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      let views = 0;
      let sales = 0;
      let topProduct = "";
      let topSales = 0;

      productList.forEach((product: any) => {
        views += product.views || 0;
        sales += product.sales || 0;
        if ((product.sales || 0) > topSales) {
          topSales = product.sales || 0;
          topProduct = product.title;
        }
      });

      // ---- Orders (scoped by vendorIds array-contains) ----
      const ordersSnap = await getDocs(
        query(
          collection(db, "orders"),
          where("vendorIds", "array-contains", vendorId),
          // Sellers must never see a Pending order: it belongs to them only once
          // an admin confirms it. firestore.rules enforces this on the orders
          // read rule, and the rules engine REJECTS this entire query unless it
          // carries a filter proving the constraint - an unfiltered
          // array-contains query returns permission-denied. Load-bearing, not
          // cosmetic. Needs the orders vendorIds+status composite index.
          where("status", "!=", "Pending")
        )
      );
      const orderList = ordersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      let ordersCount = 0;
      let pendingCount = 0;
      let totalEarnings = 0;
      let totalCommission = 0;
      let totalNetEarnings = 0;

      orderList.forEach((order: any) => {
        if (order.status === "Cancelled") return;

        const sellerItems = (order.items || []).filter(
          (item: any) => item.vendorId === vendorId
        );

        if (sellerItems.length > 0) {
          ordersCount++;
          // Was a count of status "Pending". Sellers can no longer read
          // Pending orders at all, so that counter could only ever be 0 -
          // which would read as "nothing needs your attention" while
          // confirmed orders sat unpacked. Confirmed is the state that
          // genuinely awaits the seller.
          if (order.status === "Confirmed") pendingCount++;

          const share = computeVendorShare(order, vendorId);

          if (share) {
            totalEarnings += share.vendorRawSubtotal;
            totalCommission += share.vendorCommission;
            totalNetEarnings += share.vendorEarning;
          }
        }
      });

      setStats({
        totalProducts: productList.length,
        totalOrders: ordersCount,
        pendingOrders: pendingCount,
        earnings: totalEarnings,
        commissionPaid: totalCommission,
        netEarnings: totalNetEarnings,
        totalViews: views,
        totalSales: sales,
        bestSeller: topProduct || "None",
      });

      // Share the already-loaded, seller-scoped data with the child widgets.
      setProducts(productList);
      setOrders(orderList);
    };

    setDataLoading(true);
    fetchDashboardData()
      .catch(console.error)
      .finally(() => setDataLoading(false));
  }, [vendorId]);

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

  <div className="bg-gradient-to-r from-green-700 via-teal-600 to-blue-700 px-8 py-6 text-white">

    <p className="text-sm uppercase tracking-widest opacity-80">
      YOMICO Seller Dashboard
    </p>

    <h1 className="mt-2 text-4xl font-bold md:text-5xl">
      👋 Welcome Back,
    </h1>

    <h2 className="mt-2 text-2xl">
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
          orders={orders}
          vendorId={vendorId || ""}
          loading={dataLoading}
        />
      </div>

      <div className="mt-6">
        <RecentOrders
          orders={orders}
          vendorId={vendorId || ""}
          loading={dataLoading}
        />
      </div>

      <div className="mt-6">
        <LowStockProducts products={products} loading={dataLoading} />
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

          <p className="mt-2 text-xl font-bold text-orange-600">
            {stats.bestSeller}
          </p>

        </div>

      </div>

    </SellerDashboard>

  </div>

</div>

);
}