"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function SettingsPage() {
  const router = useRouter();

  const [stats, setStats] = useState({
    orders: 0,
    wishlist: 0,
    addresses: 0,
    reviews: 0,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      const wishlist = JSON.parse(
        localStorage.getItem("wishlist") || "[]"
      );

      try {
        const [ordersSnap, addressesSnap, reviewsSnap] = await Promise.all([
          getDocs(
            query(collection(db, "orders"), where("userEmail", "==", user.email))
          ),
          getDocs(
            query(collection(db, "addresses"), where("userEmail", "==", user.email))
          ),
          getDocs(
            query(collection(db, "productReviews"), where("userEmail", "==", user.email))
          ),
        ]);

        setStats({
          orders: ordersSnap.size,
          wishlist: wishlist.length,
          addresses: addressesSnap.size,
          reviews: reviewsSnap.size,
        });
      } catch (error) {
        console.error(error);
      }
    });

    return () => unsub();
  }, []);

  const logout = async () => {
    if (!confirm("Logout from your account?")) return;

    await signOut(auth);

    localStorage.removeItem("user");
    localStorage.removeItem("vendor");
    localStorage.removeItem("admin");
    // Both are plain device-wide localStorage keys with no account
    // scoping — left uncleared, the next person to log in on a shared
    // device would inherit this account's cart and saved products.
    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutItems");
    localStorage.removeItem("wishlist");
    window.dispatchEvent(new Event("cartUpdated"));
    window.dispatchEvent(new Event("wishlistUpdated"));

    router.push("/login");
  };

  return (
    <section className="min-h-screen bg-gray-100 py-10 px-4">

      <div className="max-w-5xl mx-auto">

        {/* ================= HEADER ================= */}

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">
            Settings
          </h1>

          <p className="text-gray-500 mt-2">
            Manage your account, shopping preferences, notifications and privacy.
          </p>
        </div>

        {/* ================= PROFILE CARD ================= */}

        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl p-8 text-white shadow-lg">

          <div className="flex flex-col md:flex-row items-center justify-between gap-8">

            <div className="flex items-center gap-5">

              <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center text-5xl">
                👤
              </div>

              <div>

                <h2 className="text-3xl font-bold">
                  Welcome Back
                </h2>

                <p className="text-green-100 mt-2">
                  Manage your YOMICO account with ease.
                </p>

                <div className="mt-4 inline-block bg-white/20 px-4 py-1 rounded-full text-sm">
                  Customer Account
                </div>

              </div>

            </div>

            <Link
              href="/profile"
              className="bg-white text-green-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition"
            >
              View Profile
            </Link>

          </div>

        </div>

        {/* ================= ACCOUNT STATS ================= */}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-8">

          <div className="bg-white rounded-2xl shadow-md p-6 text-center">
            <div className="text-4xl">📦</div>

            <h3 className="text-3xl font-bold mt-3">
              {stats.orders}
            </h3>

            <p className="text-gray-500 mt-1">
              Orders
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 text-center">
            <div className="text-4xl">❤️</div>

            <h3 className="text-3xl font-bold mt-3">
              {stats.wishlist}
            </h3>

            <p className="text-gray-500 mt-1">
              Wishlist
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 text-center">
            <div className="text-4xl">📍</div>

            <h3 className="text-3xl font-bold mt-3">
              {stats.addresses}
            </h3>

            <p className="text-gray-500 mt-1">
              Addresses
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 text-center">
            <div className="text-4xl">⭐</div>

            <h3 className="text-3xl font-bold mt-3">
              {stats.reviews}
            </h3>

            <p className="text-gray-500 mt-1">
              Reviews
            </p>
          </div>

        </div>

        {/* ================= ACCOUNT SETTINGS ================= */}

        <div className="bg-white rounded-3xl shadow-md mt-10 p-8">

          <h2 className="text-2xl font-bold mb-6">
            Account Settings
          </h2>

  {/* My Profile */}

<Link
  href="/profile"
  className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition mb-4"
>
  <div className="flex items-center gap-4">

    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
      👤
    </div>

    <div>
      <h3 className="font-semibold text-lg">
        My Profile
      </h3>

      <p className="text-sm text-gray-500">
        View your personal information
      </p>
    </div>

  </div>

  <span className="text-2xl text-gray-400">›</span>
</Link>

{/* Edit Profile */}

<Link
  href="/profile"
  className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition mb-4"
>
  <div className="flex items-center gap-4">

    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
      ✏️
    </div>

    <div>
      <h3 className="font-semibold text-lg">
        Edit Profile
      </h3>

      <p className="text-sm text-gray-500">
        Update your personal details
      </p>
    </div>

  </div>

  <span className="text-2xl text-gray-400">›</span>
</Link>

{/* Change Password */}

<Link
  href="/forgot-password"
  className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition"
>
  <div className="flex items-center gap-4">

    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-2xl">
      🔒
    </div>

    <div>
      <h3 className="font-semibold text-lg">
        Change Password
      </h3>

      <p className="text-sm text-gray-500">
        Reset your account password
      </p>
    </div>

  </div>

  <span className="text-2xl text-gray-400">›</span>
</Link>

</div>

{/* ================= SHOPPING ================= */}

<div className="bg-white rounded-3xl shadow-md mt-8 p-8">

  <h2 className="text-2xl font-bold mb-6">
    Shopping
  </h2>

  {/* Orders */}

  <Link
    href="/orders"
    className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition mb-4"
  >
    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-2xl">
        📦
      </div>

      <div>
        <h3 className="font-semibold text-lg">
          My Orders
        </h3>

        <p className="text-sm text-gray-500">
          Track all your purchases
        </p>
      </div>

    </div>

    <span className="text-2xl text-gray-400">›</span>
  </Link>

  {/* Wishlist */}

  <Link
    href="/wishlist"
    className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition mb-4"
  >
    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
        ❤️
      </div>

      <div>
        <h3 className="font-semibold text-lg">
          Wishlist
        </h3>

        <p className="text-sm text-gray-500">
          Your favourite products
        </p>
      </div>

    </div>

    <span className="text-2xl text-gray-400">›</span>
  </Link>

  {/* Addresses */}

  <Link
    href="/addresses"
    className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition"
  >
    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
        📍
      </div>

      <div>
        <h3 className="font-semibold text-lg">
          Saved Addresses
        </h3>

        <p className="text-sm text-gray-500">
          Manage delivery addresses
        </p>
      </div>

    </div>

    <span className="text-2xl text-gray-400">›</span>
  </Link>

</div>
{/* ================= NOTIFICATIONS ================= */}

<div className="bg-white rounded-3xl shadow-md mt-8 p-8">

  <h2 className="text-2xl font-bold mb-6">
    Notifications
  </h2>

  {/* Order Notifications */}

  <div className="flex items-center justify-between p-5 border rounded-2xl mb-4 hover:bg-gray-50 transition">

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
        🔔
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Order Notifications
        </h3>

        <p className="text-sm text-gray-500">
          Receive updates about your orders.
        </p>

      </div>

    </div>

    <input
      type="checkbox"
      defaultChecked
      className="w-5 h-5 accent-green-600"
    />

  </div>

  {/* Promotional Notifications */}

  <div className="flex items-center justify-between p-5 border rounded-2xl mb-4 hover:bg-gray-50 transition">

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-2xl">
        🎁
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Promotional Notifications
        </h3>

        <p className="text-sm text-gray-500">
          Receive offers, discounts and coupons.
        </p>

      </div>

    </div>

    <input
      type="checkbox"
      defaultChecked
      className="w-5 h-5 accent-green-600"
    />

  </div>

  {/* Email Notifications */}

  <div className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition">

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-2xl">
        📧
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Email Notifications
        </h3>

        <p className="text-sm text-gray-500">
          Receive important account emails.
        </p>

      </div>

    </div>

    <input
      type="checkbox"
      defaultChecked
      className="w-5 h-5 accent-green-600"
    />

  </div>

</div>

{/* ================= PRIVACY & SECURITY ================= */}

<div className="bg-white rounded-3xl shadow-md mt-8 p-8">

  <h2 className="text-2xl font-bold mb-6">
    Privacy & Security
  </h2>

  <Link
    href="/privacy-policy"
    className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition mb-4"
  >

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
        🔐
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Privacy Policy
        </h3>

        <p className="text-sm text-gray-500">
          Learn how your information is protected.
        </p>

      </div>

    </div>

    <span className="text-2xl text-gray-400">›</span>

  </Link>

  <Link
    href="/terms"
    className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition mb-4"
  >

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
        📄
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Terms & Conditions
        </h3>

        <p className="text-sm text-gray-500">
          Read our marketplace terms.
        </p>

      </div>

    </div>

    <span className="text-2xl text-gray-400">›</span>

  </Link>

  <Link
    href="/contact"
    className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition"
  >

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-2xl">
        📞
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Contact Support
        </h3>

        <p className="text-sm text-gray-500">
          Need help? Contact the YOMICO support team.
        </p>

      </div>

    </div>

    <span className="text-2xl text-gray-400">›</span>

  </Link>

</div>
{/* ================= PREFERENCES ================= */}

<div className="bg-white rounded-3xl shadow-md mt-8 p-8">

  <h2 className="text-2xl font-bold mb-6">
    Preferences
  </h2>

  {/* Dark Mode */}

  <div className="flex items-center justify-between p-5 border rounded-2xl mb-4">

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-2xl">
        🌙
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Dark Mode
        </h3>

        <p className="text-sm text-gray-500">
          Coming soon
        </p>

      </div>

    </div>

    <input
      type="checkbox"
      disabled
      className="w-5 h-5 accent-green-600"
    />

  </div>

  {/* Language */}

  <div className="flex items-center justify-between p-5 border rounded-2xl mb-4">

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-2xl">
        🌐
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Language
        </h3>

        <p className="text-sm text-gray-500">
          English
        </p>

      </div>

    </div>

    <span className="font-semibold text-gray-500">
      EN
    </span>

  </div>

  {/* Currency */}

  <div className="flex items-center justify-between p-5 border rounded-2xl">

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
        💰
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          Currency
        </h3>

        <p className="text-sm text-gray-500">
          Indian Rupee (₹)
        </p>

      </div>

    </div>

    <span className="font-semibold text-gray-500">
      INR
    </span>

  </div>

</div>

{/* ================= ABOUT ================= */}

<div className="bg-white rounded-3xl shadow-md mt-8 p-8">

  <h2 className="text-2xl font-bold mb-6">
    About
  </h2>

  <Link
    href="/about"
    className="flex items-center justify-between p-5 border rounded-2xl hover:bg-gray-50 transition mb-4"
  >

    <div className="flex items-center gap-4">

      <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-2xl">
        ℹ️
      </div>

      <div>

        <h3 className="font-semibold text-lg">
          About YOMICO
        </h3>

        <p className="text-sm text-gray-500">
          Marketplace Version 1.0.0
        </p>

      </div>

    </div>

    <span className="text-2xl text-gray-400">
      ›
    </span>

  </Link>

  {/* Logout */}

  <button
    onClick={logout}
    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition mb-4"
  >
    🚪 Logout
  </button>

  {/* Delete Account */}

  <button
    onClick={()=>{
      alert("Delete Account feature coming soon.");
    }}
    className="w-full border-2 border-red-500 text-red-600 hover:bg-red-50 py-4 rounded-2xl font-bold transition"
  >
    🗑 Delete Account
  </button>

</div>

</div>

</section>

  );
}