"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [rewardPoints, setRewardPoints] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      const saved = JSON.parse(localStorage.getItem("user") || "{}");
      setUser({
        ...saved,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
      });

      // Load profile document
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          const data: any = snap.data();
          setFullName(data.name || data.fullName || "");
          setPhone(data.phone || "");
          setAddress(data.address || "");
          setRewardPoints(Number(data.rewardPoints || 0));
        }
      } catch (error) {
        console.error(error);
      }

      // Load recent orders (sorted in code — no composite index needed)
      try {
        const snapshot = await getDocs(
          query(
            collection(db, "orders"),
            where("userEmail", "==", firebaseUser.email)
          )
        );
        const data: any[] = [];
        snapshot.forEach((d) => data.push({ id: d.id, ...d.data() }));
        data.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );
        setRecentOrders(data.slice(0, 3));
      } catch (error) {
        console.error(error);
      }
    });

    return () => unsub();
  }, [router]);

  const saveProfile = async () => {
    if (phone && !/^\d{10}$/.test(phone)) {
      alert("Enter a valid 10 digit mobile number");
      return;
    }

    const uid = auth.currentUser?.uid || user?.uid;
    if (!uid) {
      alert("Please login again.");
      router.push("/login");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          email: user.email,
          name: fullName,
          phone,
          address,
        },
        { merge: true }
      );

      const updated = { ...user, name: fullName, phone };
      localStorage.setItem("user", JSON.stringify(updated));
      setUser(updated);
      alert("Profile saved");
    } catch (error) {
      console.error(error);
      alert("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const memberTier =
    rewardPoints >= 500
      ? { label: "Gold Member", icon: "🥇", next: null, floor: 500 }
      : rewardPoints >= 200
      ? { label: "Silver Member", icon: "🥈", next: 500, floor: 200 }
      : { label: "Bronze Member", icon: "🥉", next: 200, floor: 0 };

  const tierProgress = memberTier.next
    ? Math.min(
        100,
        ((rewardPoints - memberTier.floor) /
          (memberTier.next - memberTier.floor)) *
          100
      )
    : 100;

  const initial = (fullName || user?.email || "U").charAt(0).toUpperCase();

  const statusColor = (status: string) =>
    status === "Delivered"
      ? "bg-green-100 text-green-700"
      : status === "Cancelled"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";

  const quickActions = [
    { href: "/orders", icon: "📦", title: "My Orders", desc: "Track and manage your orders" },
    { href: "/wishlist", icon: "❤️", title: "Wishlist", desc: "Your saved favourite products" },
    { href: "/cart", icon: "🛒", title: "Cart", desc: "Review your shopping cart" },
    { href: "/profile/rewards", icon: "🏆", title: "Rewards", desc: "Points & transaction history" },
    { href: "/profile/refunds", icon: "↩️", title: "My Refunds", desc: "Track returns & refund status" },
    { href: "/settings", icon: "⚙️", title: "Settings", desc: "Manage account preferences" },
  ];

  return (
    <section className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-700 text-white rounded-3xl p-8 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-4xl font-bold shrink-0">
              {initial}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">
                {fullName || "My Account"}
              </h1>
              <p className="mt-1 opacity-90">{user?.email || "Customer"}</p>
              <p className="mt-1 opacity-90">
                📞 {phone || "Add your mobile number below"}
              </p>
              <p className="mt-2 text-sm opacity-80">
               Manage your profile, orders, rewards and account settings.</p>
              <span className="inline-block mt-3 bg-white/20 px-4 py-1 rounded-full text-sm font-semibold">
                {memberTier.icon} {memberTier.label}
              </span>
            </div>
            <button
              onClick={logout}
              className="bg-white/20 hover:bg-white/30 px-5 py-2.5 rounded-2xl font-semibold transition self-start"
            >
          🚪 Logout
            </button>
          </div>
        </div>

        {/* REWARD WALLET */}
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-3xl p-6 shadow-md">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm opacity-90">🏆 Reward Wallet</p>
              <h2 className="text-4xl font-bold mt-1">🏆 {rewardPoints}</h2>
              <p className="text-sm opacity-90 mt-1">points available</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">
                {memberTier.icon} {memberTier.label}
              </p>
              {memberTier.next && (
                <p className="text-xs opacity-90 mt-1">
                  {memberTier.next - rewardPoints} pts to next tier
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 h-2 w-full bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/90 transition-all duration-500"
              style={{ width: `${tierProgress}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">Orders</p>
    <h2 className="text-3xl font-bold mt-2">
      {recentOrders.length}
    </h2>
  </div>

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">Reward Points</p>
    <h2 className="text-3xl font-bold mt-2">
      {rewardPoints}
    </h2>
  </div>

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">Wishlist</p>
    <h2 className="text-3xl font-bold mt-2">
      ❤️
    </h2>
  </div>

  <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
    <p className="text-gray-500 text-sm">Member</p>
    <h2 className="text-2xl font-bold mt-2">
      {memberTier.icon}
    </h2>
  </div>

</div>

        {/* QUICK ACTIONS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href}>
              <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 p-6 cursor-pointer h-full">
                <div className="text-5xl mb-4">{a.icon}</div>
                <h2 className="text-lg font-bold mb-1">{a.title}</h2>
                <p className="text-gray-500 text-sm">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* PROFILE DETAILS */}
        <div className="bg-white rounded-3xl shadow-lg hover:shadow-xl transition p-8">
          <h2 className="text-2xl font-bold mb-6">👤 Profile Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10 digit mobile number"
                className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Email</label>
              <input
                type="text"
                value={user?.email || ""}
                disabled
                className="w-full p-3.5 border rounded-xl bg-gray-50 text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">
                Account Type
              </label>
              <input
                type="text"
                value="Customer Account"
                disabled
                className="w-full p-3.5 border rounded-xl bg-gray-50 text-gray-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-gray-500 mb-1">
                Delivery Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House no, street, city, state, PIN"
                className="w-full p-3.5 border rounded-xl h-28 outline-none focus:ring-2 focus:ring-green-500 transition"
              />
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="mt-6 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 disabled:opacity-60 text-white px-8 py-3.5 rounded-2xl font-semibold transition"
          >
            {saving ? "Saving..." : "💾 Save Profile"}
          </button>
        </div>

        {/* RECENT ORDERS */}
        <div className="bg-white rounded-3xl shadow-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">📦 Recent Orders</h2>
            <Link
              href="/orders"
              className="text-green-600 font-semibold text-sm hover:underline"
            >
              View all →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📦</div>
              <p className="text-gray-500">No orders yet</p>
              <Link href="/">
                <button className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-semibold transition">
                  Start Shopping
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order: any) => (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <div className="flex items-center justify-between border rounded-2xl p-4 hover:shadow-md transition">
                    <div>
                      <p className="font-semibold">
                        Order #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-500">
                        ₹
                        {(order.finalTotal || order.total)?.toLocaleString(
                          "en-IN"
                        )}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="text-center text-gray-400 text-sm py-8">

Need help?

<Link
  href="/support"
  className="text-green-600 ml-1 hover:underline"
>
Contact Support
</Link>

</div>
    </section>
  );
}
