"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

const COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function SellerAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const vendor = JSON.parse(localStorage.getItem("vendor") || "{}");

      // PRODUCTS (scoped to this vendor)
      const productSnap = await getDocs(collection(db, "products"));
      const productList: any[] = [];
      productSnap.forEach((doc) => {
        const data: any = { id: doc.id, ...doc.data() };
        if (data.vendorId === vendor.uid) productList.push(data);
      });
      setProducts(productList);

      // ORDERS (only those containing this vendor's items)
      const orderSnap = await getDocs(collection(db, "orders"));
      const orderList: any[] = [];
      orderSnap.forEach((doc) => {
        const data: any = doc.data();
        const myItems =
          data.items?.filter((item: any) => item.vendorId === vendor.uid) ||
          [];
        if (myItems.length) orderList.push({ ...data, myItems });
      });
      setOrders(orderList);

      // REVIEWS
      // NOTE: not scoped to this vendor — this loads ALL reviews, so
      // Average Rating / Total Reviews reflect the whole marketplace.
      // Filter by the vendor's product ids once the review schema is known.
      const reviewSnap = await getDocs(collection(db, "productReviews"));
      const reviewList: any[] = [];
      reviewSnap.forEach((doc) => reviewList.push(doc.data()));
      setReviews(reviewList);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const revenue = orders.reduce(
    (sum, order) =>
      sum +
      order.myItems.reduce(
        (s: any, item: any) => s + item.price * item.qty,
        0
      ),
    0
  );

  const totalProducts = products.length;
  const totalOrders = orders.length;

  const averageRating = reviews.length
    ? (
        reviews.reduce((sum: any, r: any) => sum + r.rating, 0) / reviews.length
      ).toFixed(1)
    : "0";

  const chartData = [
    { name: "Products", value: totalProducts },
    { name: "Orders", value: totalOrders },
    { name: "Reviews", value: reviews.length },
  ];

  const revenueChart = [{ name: "Revenue", amount: revenue }];

  const productSales: any = {};
  orders.forEach((order) => {
    order.myItems.forEach((item: any) => {
      if (!productSales[item.name]) productSales[item.name] = 0;
      productSales[item.name] += item.qty;
    });
  });

  const bestSellingProducts = Object.entries(productSales)
    .map(([name, qty]) => ({ name: name as string, qty: Number(qty) }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const totalUnitsSold = Object.values(productSales).reduce(
    (sum: number, qty: any) => sum + Number(qty),
    0
  );

  const pendingOrders = orders.filter(
    (order: any) => order.status === "Pending"
  ).length;

  const lowStockProducts = products.filter(
    (product: any) => Number(product.stock || 0) <= 5
  ).length;

  const totalCommission = Math.round(revenue * 0.1);
  const netEarnings = revenue - totalCommission;

  const deliveredOrders = orders.filter(
    (order: any) => order.status === "Delivered"
  ).length;

  const returnedOrders = orders.filter(
    (order: any) => order.status === "Refunded"
  ).length;

  const returnRate = deliveredOrders
    ? ((returnedOrders * 100) / deliveredOrders).toFixed(1)
    : "0";

  const orderStatusData = [
    { name: "Pending", value: orders.filter((o: any) => o.status === "Pending").length },
    { name: "Packed", value: orders.filter((o: any) => o.status === "Packed").length },
    { name: "Shipped", value: orders.filter((o: any) => o.status === "Shipped").length },
    { name: "Delivered", value: orders.filter((o: any) => o.status === "Delivered").length },
    { name: "Cancelled", value: orders.filter((o: any) => o.status === "Cancelled").length },
  ];

  const inventoryData = [
    { name: "Healthy", value: products.filter((p: any) => Number(p.stock || 0) > 5).length },
    { name: "Low Stock", value: products.filter((p: any) => Number(p.stock || 0) <= 5 && Number(p.stock || 0) > 0).length },
    { name: "Out of Stock", value: products.filter((p: any) => Number(p.stock || 0) === 0).length },
  ];

  // NOTE: placeholder — real monthly buckets require grouping orders by
  // createdAt. Currently all revenue is attributed to June.
  const monthlyRevenue = [
    { month: "Jan", revenue: 0 },
    { month: "Feb", revenue: 0 },
    { month: "Mar", revenue: 0 },
    { month: "Apr", revenue: 0 },
    { month: "May", revenue: 0 },
    { month: "Jun", revenue: 0 },
    { month: "Jly", revenue: 0 },
    { month: "Aug", revenue: 0 },
    { month: "Sep", revenue: 0 },
    { month: "Oct", revenue: 0 },
    { month: "Nov", revenue: 0 },
    { month: "Dec", revenue: revenue },
  ];

  if (loading) {
    return <div className="p-10 text-center">Loading Analytics...</div>;
  }

  const kpis = [
    { icon: "🏆", label: "Best Seller", value: bestSellingProducts[0]?.name || "N/A" },
    { icon: "📦", label: "Pending Orders", value: pendingOrders },
    { icon: "📉", label: "Low Stock", value: lowStockProducts },
    { icon: "💸", label: "Commission", value: `₹${totalCommission.toLocaleString("en-IN")}` },
    { icon: "💵", label: "Net Earnings", value: `₹${netEarnings.toLocaleString("en-IN")}` },
    { icon: "🛒", label: "Units Sold", value: totalUnitsSold },
    { icon: "⭐", label: "Total Reviews", value: reviews.length },
    { icon: "💰", label: "Total Revenue", value: `₹${revenue.toLocaleString("en-IN")}` },
    { icon: "📋", label: "Orders", value: totalOrders },
    { icon: "📦", label: "Products", value: totalProducts },
    { icon: "⭐", label: "Average Rating", value: averageRating },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8">
          <h1 className="text-4xl font-bold">Seller Analytics</h1>
          <p className="mt-2">Business Performance Dashboard</p>
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
                <h2 className="text-4xl font-bold mt-2 break-words">
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
            <h2 className="text-2xl font-bold mb-6">💰 Revenue</h2>
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
                <span>💰 Revenue</span>
                <strong>₹{revenue.toLocaleString("en-IN")}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>🏆 Best Seller</span>
                <strong>{bestSellingProducts[0]?.name || "N/A"}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>⭐ Rating</span>
                <strong>{averageRating}</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>📉 Return Rate</span>
                <strong>{returnRate}%</strong>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span>📦 Low Stock</span>
                <strong>{lowStockProducts}</strong>
              </div>
              <div className="flex justify-between">
                <span>🚚 Pending Orders</span>
                <strong>{pendingOrders}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="bg-white rounded-3xl shadow-lg p-8 min-h-[550px]">
          <h2 className="text-2xl font-bold mb-6">📈 Monthly Revenue</h2>
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
            <h2 className="text-2xl font-bold mb-6">📦 Order Status</h2>
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
