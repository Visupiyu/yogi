"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";


type Vendor = {
  id: string;
  fullName: string;
  businessName: string;
  businessPhone: string;
  businessType: string;
  city: string;
  state: string;
  status: string;
  kycStatus?: string;
};

type Product = {
  id: string;
  name: string;
  image: string;
  price: number;
  stock: number;
};

type Order = {
  id: string;
  customerName: string;
  total: number;
  status: string;
  paymentMethod?: string;
};

type Customer = {
  id: string;
  name?: string;
  email?: string;
  totalOrders?: number;
  totalSpent?: number;
};

export default function AdminPage() {
  const router = useRouter();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const [notifications, setNotifications] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorSearch, setVendorSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [vendorPayouts, setVendorPayouts] = useState<any[]>([]);

  const pendingOrders = orders.filter((o) => o.status === "Pending").length;

  const chartData = [
    { name: "Products", value: products.length },
    { name: "Orders", value: totalOrders },
    { name: "Customers", value: customers.length },
    { name: "Revenue", value: Math.floor(totalRevenue / 100) },
  ];

  async function loadVendors() {
    const snapshot = await getDocs(collection(db, "vendors"));
    const items: Vendor[] = [];
    snapshot.forEach((docItem) => {
      items.push({ id: docItem.id, ...docItem.data() } as Vendor);
    });
    setVendors(items);
    return items;
  }

  async function loadProducts(vendorList: Vendor[] = []) {
    const snapshot = await getDocs(collection(db, "products"));
    const items: Product[] = [];
    snapshot.forEach((docItem) => {
      items.push({ ...docItem.data(), id: docItem.id } as Product);
    });
    setProducts(items);

    const ordersSnapshot = await getDocs(collection(db, "orders"));
    setTotalOrders(ordersSnapshot.size);

    let revenue = 0;
    const orderItems: Order[] = [];
    const payouts: any = {};
    const customerMap: any = {};

    ordersSnapshot.forEach((docItem) => {
      const order = docItem.data();

      if (order.items) {
        order.items.forEach((item: any) => {
          revenue += item.price * item.qty;

          const vid = item.vendorId || "unknown";
          if (!payouts[vid]) {
            payouts[vid] = {
              vendorId: vid,
              vendorName: item.vendorName || "Unknown",
              orders: 0,
              sales: 0,
              commission: 0,
              payout: 0,
            };
          }
          const amount = item.price * item.qty;
          const commission = amount * 0.1;
          payouts[vid].orders += 1;
          payouts[vid].sales += amount;
          payouts[vid].commission += commission;
          payouts[vid].payout += amount - commission;
        });
      }

      const email = order.userEmail || "unknown";
      if (!customerMap[email]) {
        customerMap[email] = {
          id: docItem.id,
          email,
          totalOrders: 0,
          totalSpent: 0,
        };
      }
      customerMap[email].totalOrders += 1;
      customerMap[email].totalSpent += order.total || 0;

      orderItems.push({ id: docItem.id, ...order } as Order);
    });

    setTotalRevenue(revenue);
    setOrders(orderItems);
    setVendorPayouts(Object.values(payouts));
    setCustomers(Object.values(customerMap));

    // Notifications
    const alerts: string[] = [];
    items.forEach((product) => {
      if (product.stock < 5) alerts.push(`⚠️ Low stock: ${(product as any).title || product.name}`);
    });
    vendorList.forEach((vendor) => {
      if (vendor.status === "Pending")
        alerts.push(`🛒 Pending vendor: ${vendor.businessName}`);
    });
    if (ordersSnapshot.size > 0)
      alerts.push(`📦 Total Orders: ${ordersSnapshot.size}`);
    setNotifications(alerts);
  }

  const approveVendor = async (id: string) => {
    await updateDoc(doc(db, "vendors", id), {
      status: "Approved",
      kycStatus: "Approved",
    });
    loadVendors();
  };

  const rejectVendor = async (id: string) => {
    await updateDoc(doc(db, "vendors", id), {
      status: "Rejected",
      kycStatus: "Rejected",
    });
    loadVendors();
  };

  const updateKYC = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "vendors", id), { kycStatus: status });
      alert("KYC Updated");
      await loadVendors();
    } catch (error) {
      console.error(error);
      alert("KYC Update Failed");
    }
  };

  useEffect(() => {
    // Admin identity is already gated by app/admin/layout.tsx (which this
    // page always renders inside) — this listener is just here to trigger
    // data loading once that guard confirms an admin session exists.
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      const vendorList = await loadVendors();
      await loadProducts(vendorList);
      await loadUnreadNotifications();
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const deleteProduct = async (id: string) => {
    await deleteDoc(doc(db, "products", id));
    loadProducts(vendors);
  };

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "orders", id), { status });
      await loadProducts(vendors);
    } catch (error) {
      console.error(error);
    }
  };

  const loadUnreadNotifications = async () => {
    try {
      // Missing the role scope /admin/notifications already uses — this
      // counted every unread customer/seller notification in the whole
      // marketplace too, not just admin's own.
      const snapshot = await getDocs(
        query(
          collection(db, "notifications"),
          where("role", "==", "admin"),
          where("read", "==", false)
        )
      );
      setUnreadCount(snapshot.size);
    } catch (error) {
      console.error(error);
    }
  };

  const logout = async () => {
    await signOut(auth);
    // Wrong key ("user", the customer session) and wrong destination
    // ("/login", the customer login) — left the real "admin" flag behind
    // and briefly landed on the customer login page instead of
    // /admin-login, though the layout's own auth listener eventually
    // corrected it.
    localStorage.removeItem("admin");
    router.push("/admin-login");
  };

  if (loading) {
    return <div className="p-10">Loading Admin Dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white px-8 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Image
  src="/logo.png"
  alt="YOMICO"
  width={180}
  height={180}
  className="h-36 md:h-40 w-auto object-contain"
/>
          <div>
            <h1 className="text-5xl font-bold"> YOMICO</h1>
            <p className="mt-3 text-lg opacity-90">Manage your complete marketplace from one dashboard.</p>
            <p>👑 Admin Dashboard</p>
            <div className="mt-4">
              <button
                onClick={() => router.push("/admin/notifications")}
                className="relative bg-white text-black px-5 py-3 rounded-full font-bold shadow"
              >
                🔔 System Notifications
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="bg-red-500 px-6 py-3 rounded-xl font-semibold"
        >
          Logout
        </button>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-5 mb-10">
          <div className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-2xl transition duration-300 hover:-translate-y-1">
            <h2 className="text-2xl font-bold mb-4">Total Vendors</h2>
            <p className="text-3xl font-bold text-blue-600">
              {vendors.length}
            </p>
            <p className="text-gray-400 mt-2 text-sm">Marketplace Summary</p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">Approved Vendors</h2>
            <p className="text-3xl font-bold text-green-600">
              {vendors.filter((v) => v.status === "Approved").length}
            </p>
             <p className="text-gray-400 mt-2 text-sm">Marketplace Summary</p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">Total Products</h2>
            <p className="text-3xl font-bold text-pink-600">
              {products.length}
            </p>
             <p className="text-gray-400 mt-2 text-sm">Marketplace Summary</p>      
          </div>

          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">Total Orders</h2>
            <p className="text-3xl font-bold text-orange-600">{totalOrders}</p>
             <p className="text-gray-400 mt-2 text-sm">Marketplace Summary</p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">Pending Orders</h2>
            <p className="text-3xl font-bold text-yellow-600">
              {pendingOrders}
            </p>
             <p className="text-gray-400 mt-2 text-sm">Marketplace Summary</p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">Revenue</h2>
            <p className="text-3xl font-bold text-green-600">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">Customers</h2>
            <p className="text-3xl font-bold text-purple-600">
              {customers.length}
            </p>
             <p className="text-gray-400 mt-2 text-sm">Marketplace Summary</p>
          </div>

          <div
            onClick={() => router.push("/admin/refunds")}
            className="bg-white p-8 rounded-2xl shadow cursor-pointer hover:shadow-lg"
          >
            <h2 className="text-2xl font-bold mb-4">Refunds</h2>
            <p className="text-gray-500">Manage refund requests</p>
          </div>
        </div>
</div>

{/* MANAGEMENT MODULES */}
<div className="bg-white rounded-2xl shadow p-8 mb-10">
  <h2 className="text-3xl font-bold mb-8">
    🚀 Management Modules
  </h2>
  <p className="text-gray-500 mb-8"> Quick access to every marketplace administration tool.</p>
  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5">
    <Link href="/admin/orders" className="bg-blue-50 p-6 rounded-xl text-center hover:shadow-lg">
      📦
      <p className="font-bold mt-2">Orders</p>
    </Link>

    <Link href="/admin/users" className="bg-green-50 p-6 rounded-xl text-center hover:shadow-lg">
      👥
      <p className="font-bold mt-2">Admin Users</p>
    </Link>
    <Link
  href="/admin/customers"
  className="bg-blue-50 p-6 rounded-xl text-center hover:shadow-lg"
>
  👥
  <p className="font-bold mt-2">
    Customers
  </p>
</Link>

<Link
  href="/admin/vendors"
  className="bg-yellow-50 p-6 rounded-xl text-center hover:shadow-lg"
>
  🏪
  <p className="font-bold mt-2">
    Vendors
  </p>
</Link>
   <Link
  href="/admin/products"
  className="bg-green-50 p-6 rounded-xl text-center hover:shadow-lg"
>
  📦
  <p className="font-bold mt-2">
    Marketplace Products
  </p>
</Link>
    
    <Link href="/admin/delivery" className="bg-orange-50 p-6 rounded-xl text-center hover:shadow-lg">
      🚚
      <p className="font-bold mt-2">Delivery</p>
    </Link>

    <Link href="/admin/delivery-partners" className="bg-yellow-50 p-6 rounded-xl text-center hover:shadow-lg">
      🛵
      <p className="font-bold mt-2">Delivery Partners</p>
    </Link>

    <Link href="/admin/analytics" className="bg-purple-50 p-6 rounded-xl text-center hover:shadow-lg">
      📊
      <p className="font-bold mt-2">Analytics</p>
    </Link>

    <Link href="/admin/reports" className="bg-pink-50 p-6 rounded-xl text-center hover:shadow-lg">
      📈
      <p className="font-bold mt-2">Reports</p>
    </Link>

    <Link href="/admin/payouts" className="bg-cyan-50 p-6 rounded-xl text-center hover:shadow-lg">
      💰
      <p className="font-bold mt-2">Payouts</p>
    </Link>

    <Link href="/admin/refunds" className="bg-red-50 p-6 rounded-xl text-center hover:shadow-lg">
      💸
      <p className="font-bold mt-2">Refunds</p>
    </Link>

    <Link href="/admin/returns" className="bg-indigo-50 p-6 rounded-xl text-center hover:shadow-lg">
      🔄
      <p className="font-bold mt-2">Returns</p>
    </Link>

    <Link href="/admin/support" className="bg-gray-100 p-6 rounded-xl text-center hover:shadow-lg">
      💬
      <p className="font-bold mt-2">Support</p>
    </Link>

    <Link href="/admin/kyc" className="bg-lime-50 p-6 rounded-xl text-center hover:shadow-lg">
      🆔
      <p className="font-bold mt-2">Vendor KYC</p>
    </Link>

    <Link href="/admin/reviews" className="bg-yellow-50 p-6 rounded-xl text-center hover:shadow-lg">
      ⭐
      <p className="font-bold mt-2">Reviews</p>
    </Link>

    <Link href="/admin/coupons" className="bg-emerald-50 p-6 rounded-xl text-center hover:shadow-lg">
      🎟️
      <p className="font-bold mt-2">Coupons</p>
    </Link>

    <Link href="/admin/notifications" className="bg-amber-50 p-6 rounded-xl text-center hover:shadow-lg">
      🔔
      <p className="font-bold mt-2">🔔 System Notifications</p>
    </Link>

    <Link href="/admin/withdrawals" className="bg-sky-50 p-6 rounded-xl text-center hover:shadow-lg">
      🏦
      <p className="font-bold mt-2">Withdrawals</p>
    </Link>

    <p className="text-gray-500 mb-6">Marketplace alerts and important activities.</p>

  </div>
{/* QUICK ALERTS — locally-computed, not the notifications collection
    (that's the "System Notifications" card above) */}
<div className="bg-white rounded-2xl shadow p-8 mb-10">
  <h2 className="text-3xl font-bold mb-8">
    ⚠️ Quick Alerts
  </h2>

  <div className="space-y-4">
    {notifications.length === 0 && (
      <p>No Notifications</p>
    )}

    {notifications.map((item, index) => (
      <div
        key={index}
        className="bg-gray-100 p-4 rounded-xl"
      >
        {item}
      </div>
    ))}
  </div>
</div>

        {/* ANALYTICS CHART */}
        <div className="bg-white rounded-2xl shadow p-8 mb-10">
          <h2 className="text-3xl font-bold mb-8">📊 Marketplace Analytics</h2>
          <p className="text-gray-500 mb-6">
            Real-time marketplace performance overview
          </p>
          <div className="w-full h-[400px] min-w-0">
            <ResponsiveContainer width="99%" height={400}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

   </div>
   <div className="text-center py-10 text-gray-500 border-t mt-10">
Need Help?
<Link
href="/admin/support"
className="text-green-600 ml-2 hover:underline"
>
Admin Support
</Link>
<span className="mx-3">|</span>
<Link
href="/admin/reports"
className="text-green-600 hover:underline"
>
Reports
</Link>
<span className="mx-3">|</span>
<Link
href="/admin/analytics"
className="text-green-600 hover:underline"
>
Analytics
</Link>
</div>                  
</div>  
  );
}
