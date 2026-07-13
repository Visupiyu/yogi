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
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  // Editable profile fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [rewardPoints, setRewardPoints] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (!savedUser) {
      router.push("/login");
      return;
    }

    const userData = JSON.parse(savedUser);
    setUser(userData);
    const userId = userData.uid || userData.id;

    const loadProfile = async () => {
      try {
        if (!userId) {
  console.error("User ID not found");
  return;
}

const ref = doc(db, "users", userId);
        const snap = await getDoc(ref);
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
    };

    const loadOrders = async () => {
      try {
       const snapshot = await getDocs(
  query(
    collection(db, "orders"),
    where("userEmail", "==", userData.email)
  )
);
const data: any[] = [];
snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));

// Sort newest-first in code, then take the 3 most recent
data.sort(
  (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
);
setRecentOrders(data.slice(0, 3));
      } catch (error) {
        console.error(error);
      }
    };

    loadProfile();
    loadOrders();
  }, [router]);

  const saveProfile = async () => {
    if (phone && !/^\d{10}$/.test(phone)) {
      alert("Enter a valid 10 digit mobile number");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
       doc(db, "users", user.uid || user.id),
        {
          uid: user.uid || user.id,
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
      ? "🥇 Gold Member"
      : rewardPoints >= 200
      ? "🥈 Silver Member"
      : "🥉 Bronze Member";

  return (
    <section className="min-h-screen bg-gray-100 py-10 px-4 pb-28">
      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-500 to-green-700 text-white rounded-3xl p-10 mb-10 shadow-lg">
          <h1 className="text-4xl font-bold">My Account</h1>

          {fullName && <p className="mt-3 text-xl font-semibold">{fullName}</p>}

          <p className="mt-2 text-lg opacity-90">
            Welcome {user?.email || "Customer"}
          </p>

          <p className="mt-1 text-lg opacity-90">
            📞 {phone ? phone : "Add your mobile number below"}
          </p>

          <p className="mt-3 font-semibold">{memberTier}</p>
        </div>

        {/* LOGOUT */}
        <div className="flex justify-end mb-8">
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-semibold"
          >
            Logout
          </button>
        </div>

        {/* REWARD WALLET */}
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-3xl p-6 mb-10">
          <p className="text-sm opacity-90">Reward Wallet</p>
          <h2 className="text-4xl font-bold mt-2">🏆 {rewardPoints} Points</h2>
          <p className="mt-3 font-semibold">{memberTier}</p>
        </div>

        {/* QUICK ACTIONS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/orders">
            <div className="bg-white rounded-3xl shadow-md p-8 hover:shadow-xl transition duration-300 cursor-pointer">
              <h2 className="text-2xl font-bold mb-3">My Orders</h2>
              <p className="text-gray-500 leading-7">
                Track and manage your orders
              </p>
            </div>
          </Link>

          <Link href="/wishlist">
            <div className="bg-white rounded-3xl shadow-md p-8 hover:shadow-xl transition duration-300 cursor-pointer">
              <h2 className="text-2xl font-bold mb-3">Wishlist</h2>
              <p className="text-gray-500 leading-7">
                View saved favorite products
              </p>
            </div>
          </Link>

          <Link href="/cart">
            <div className="bg-white rounded-3xl shadow-md p-8 hover:shadow-xl transition duration-300 cursor-pointer">
              <h2 className="text-2xl font-bold mb-3">Cart</h2>
              <p className="text-gray-500 leading-7">
                Review your shopping cart
              </p>
            </div>
          </Link>

          <Link href="/profile/rewards">
            <div className="bg-white rounded-3xl shadow-md p-8 hover:shadow-xl transition duration-300 cursor-pointer">
              <h2 className="text-2xl font-bold mb-3">Rewards</h2>
              <p className="text-gray-500 leading-7">
                View reward points and transaction history
              </p>
            </div>
          </Link>

          <Link href="/profile/refunds">
            <div className="bg-white rounded-3xl shadow-md p-8 hover:shadow-xl transition duration-300 cursor-pointer">
              <h2 className="text-2xl font-bold mb-3">My Refunds</h2>
              <p className="text-gray-500 leading-7">
                Track return requests and refund status
              </p>
            </div>
          </Link>

          <Link href="/settings">
            <div className="bg-white rounded-3xl shadow-md p-8 hover:shadow-xl transition duration-300 cursor-pointer">
              <h2 className="text-2xl font-bold mb-3">Settings</h2>
              <p className="text-gray-500 leading-7">
                Manage account preferences
              </p>
            </div>
          </Link>
        </div>

        {/* PROFILE DETAILS (editable) */}
        <div className="bg-white rounded-3xl shadow-md p-10 mt-10">
          <h2 className="text-3xl font-bold mb-6">Profile Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-gray-500 mb-2">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full p-4 border rounded-2xl"
              />
            </div>

            <div>
              <label className="block text-gray-500 mb-2">Mobile Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10 digit mobile number"
                className="w-full p-4 border rounded-2xl"
              />
            </div>

            <div>
              <label className="block text-gray-500 mb-2">Email</label>
              <input
                type="text"
                value={user?.email || ""}
                disabled
                className="w-full p-4 border rounded-2xl bg-gray-50 text-gray-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-gray-500 mb-2">
                Delivery Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House no, street, city, state, PIN"
                className="w-full p-4 border rounded-2xl h-28"
              />
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="mt-6 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 disabled:opacity-60 text-white px-8 py-4 rounded-2xl font-semibold"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>

        {/* ACCOUNT INFORMATION */}
        <div className="bg-white rounded-3xl shadow-md p-10 mt-10">
          <h2 className="text-3xl font-bold mb-6">Account Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-gray-500 mb-2">Account Type</p>
              <h3 className="text-xl font-semibold">Customer Account</h3>
            </div>

            <div>
              <p className="text-gray-500 mb-2">Marketplace</p>
              <h3 className="text-xl font-semibold">Yogi Mart</h3>
            </div>
          </div>
        </div>

        {/* SAVED ADDRESS */}
        <div className="bg-white rounded-3xl shadow-md p-10 mt-10">
          <h2 className="text-3xl font-bold mb-6">Saved Address</h2>
          {address ? (
            <p className="text-gray-700 leading-8 whitespace-pre-line">
              {address}
            </p>
          ) : (
            <p className="text-gray-500 leading-8">
              Add your delivery address above for a faster checkout experience.
            </p>
          )}
        </div>

        {/* RECENT ORDERS */}
        <div className="bg-white rounded-3xl shadow-md p-10 mt-10">
          <h2 className="text-3xl font-bold mb-6">Recent Orders</h2>

          {recentOrders.length === 0 ? (
            <p className="text-gray-500">No orders found</p>
          ) : (
            recentOrders.map((order: any) => (
              <div key={order.id} className="border-b py-4">
                <p className="font-semibold">
                  Order ID: {order.id.slice(0, 8)}
                </p>
                <p>Status: {order.status}</p>
                <p>
                  Total: ₹
                  {(order.finalTotal || order.total)?.toLocaleString("en-IN")}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
