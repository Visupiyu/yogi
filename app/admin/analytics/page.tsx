"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [oSnap, pSnap, vSnap, uSnap] = await Promise.all([
          getDocs(collection(db, "orders")),
          getDocs(collection(db, "products")),
          getDocs(collection(db, "vendors")),
          getDocs(collection(db, "users")),
        ]);

        setOrders(oSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setProducts(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setVendors(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCustomers(
          uSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((u) => (u.role || "customer") === "customer")
        );
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Revenue excludes cancelled orders
  const validOrders = orders.filter((o) => o.status !== "Cancelled");
  const totalRevenue = validOrders.reduce(
    (sum, o) => sum + (o.finalTotal || o.total || 0),
    0
  );
  const avgOrderValue = validOrders.length
    ? Math.round(totalRevenue / validOrders.length)
    : 0;

  // Orders by status (for pie)
  const statusCounts: Record<string, number> = {};
  orders.forEach((o) => {
    const s = o.status || "Pending";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
  }));

  // Revenue by category (from order items)
  const categoryRevenue: Record<string, number> = {};
  validOrders.forEach((o) => {
    (o.items || []).forEach((item: any) => {
      const cat = item.category || "Other";
      categoryRevenue[cat] =
        (categoryRevenue[cat] || 0) + (item.price || 0) * (item.qty || 0);
    });
  });
  const categoryData = Object.entries(categoryRevenue)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Top products by units sold
  const topProducts = [...products]
    .sort((a, b) => (b.sales || 0) - (a.sales || 0))
    .slice(0, 5);

  const stats = [
    { label: "Total Revenue", value: `₹${totalRevenue.toLocaleString("en-IN")}`, icon: "💰", color: "text-green-600" },
    { label: "Total Orders", value: orders.length, icon: "📦", color: "text-blue-600" },
    { label: "Avg Order Value", value: `₹${avgOrderValue.toLocaleString("en-IN")}`, icon: "📊", color: "text-purple-600" },
    { label: "Products", value: products.length, icon: "🏷️", color: "text-orange-600" },
    { label: "Vendors", value: vendors.length, icon: "🏬", color: "text-cyan-600" },
    { label: "Customers", value: customers.length, icon: "👥", color: "text-pink-600" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">📈 Analytics</h1>
          <p className="mt-2 opacity-90">Marketplace performance overview</p>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="text-gray-500 text-sm">{s.label}</p>
              <h2 className={`text-2xl font-bold mt-1 break-all ${s.color}`}>
                {s.value}
              </h2>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* REVENUE BY CATEGORY */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-xl font-bold mb-4">Revenue by Category</h2>
            {categoryData.length === 0 ? (
              <p className="text-gray-400 text-center py-16">No sales data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: any) => `₹${Number(v).toLocaleString("en-IN")}`}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ORDERS BY STATUS */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h2 className="text-xl font-bold mb-4">Orders by Status</h2>
            {statusData.length === 0 ? (
              <p className="text-gray-400 text-center py-16">No orders yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* TOP PRODUCTS */}
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">Top Products</h2>
          {topProducts.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No products yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 border-b text-left">
                    <th className="p-3">Product</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Units Sold</th>
                    <th className="p-3">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{p.name}</td>
                      <td className="p-3">
                        ₹{Number(p.price || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3">{p.sales || 0}</td>
                      <td className="p-3">{p.stock ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
