"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { fetchAccountSummary, formatDate, type AccountSummary } from "@/lib/account/accountClient";

// The account dashboard. Everything it shows comes from one server call
// (app/api/account/summary): the customer is the verified token and the
// response is a fixed set of fields — this page no longer reads whole order
// documents, the profile document or the address list from Firestore. Saving
// the profile form is unchanged (the owner's own users/{uid} document, within
// firestore.rules).

export default function ProfilePage() {
  const router = useRouter();

  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  // Legacy free-text address: still saved UNCHANGED (preserved for
  // compatibility / migration) — it is no longer edited from this page.
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchAccountSummary();
    setLoadError(result.error);
    if (result.data) {
      setSummary(result.data);
      setFullName(result.data.profile.displayName === "Customer" ? "" : result.data.profile.displayName);
      setPhone(result.data.profile.phone || "");
      setAddress(result.data.profile.address || "");
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      load();
    });
    return () => unsub();
  }, [router, load]);

  const saveProfile = async () => {
    if (phone && !/^\d{10}$/.test(phone)) {
      alert("Enter a valid 10 digit mobile number");
      return;
    }

    const uid = auth.currentUser?.uid;
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
          // email is the Auth account's, frozen by firestore.rules — not
          // written from here.
          uid,
          name: fullName,
          phone,
          address,
        },
        { merge: true }
      );
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: fullName });
      }
      const saved = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...saved, name: fullName, phone, address }));
      alert("Profile saved");
      load();
    } catch (error) {
      console.error(error);
      alert("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("user");
    // Cart and wishlist are plain device-wide localStorage keys with no
    // account scoping — on a shared device, the next person to log in
    // would otherwise inherit (and could check out, or see) whatever this
    // account left in them.
    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutItems");
    localStorage.removeItem("wishlist");
    window.dispatchEvent(new Event("cartUpdated"));
    window.dispatchEvent(new Event("wishlistUpdated"));
    router.push("/login");
  };

  const rewardPoints = summary?.rewards.balance ?? 0;
  const pendingPoints = summary?.rewards.pendingPoints ?? 0;

  const memberTier =
    rewardPoints >= 500
      ? { label: "Gold Member", icon: "🥇", next: null, floor: 500 }
      : rewardPoints >= 200
      ? { label: "Silver Member", icon: "🥈", next: 500, floor: 200 }
      : { label: "Bronze Member", icon: "🥉", next: 200, floor: 0 };

  const tierProgress = memberTier.next
    ? Math.min(100, ((rewardPoints - memberTier.floor) / (memberTier.next - memberTier.floor)) * 100)
    : 100;

  const email = summary?.profile.email || auth.currentUser?.email || "";
  const initial = (fullName || email || "U").charAt(0).toUpperCase();

  const statusColor = (status: string) =>
    status === "Delivered"
      ? "bg-green-100 text-green-700"
      : status === "Cancelled"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";

  const actions = summary?.actions;
  const attention: { text: string; href: string; cta: string }[] = [];
  if (actions?.pickupSlotsToConfirm) {
    attention.push({
      text: `YOMICO has proposed a pickup time for ${actions.pickupSlotsToConfirm} return${actions.pickupSlotsToConfirm === 1 ? "" : "s"}. Confirm it or ask for another time.`,
      href: "/profile/refunds",
      cta: "Review pickup",
    });
  }
  if (actions?.refundsDue) {
    attention.push({
      text: `${actions.refundsDue} refund${actions.refundsDue === 1 ? " is" : "s are"} being processed for cancelled orders.`,
      href: "/profile/refunds",
      cta: "Track refund",
    });
  }
  if (actions?.verifyEmail) {
    attention.push({
      text: "Please verify your email address. Referral bonuses are paid once your email is verified.",
      href: "/settings",
      cta: "Account settings",
    });
  }

  const quickActions = [
    { href: "/orders", icon: "📦", title: "My Orders", desc: "Track and manage your orders" },
    { href: "/wishlist", icon: "❤️", title: "Wishlist", desc: "Your saved favourite products" },
    { href: "/cart", icon: "🛒", title: "Cart", desc: "Review your shopping cart" },
    { href: "/profile/wallet", icon: "🏆", title: "Reward Wallet", desc: "Balance, pending points & history" },
    { href: "/profile/refunds", icon: "↩️", title: "Returns & Refunds", desc: "Track returns, pickups & refunds" },
    { href: "/profile/tickets", icon: "🎫", title: "Support Tickets", desc: "View your requests and replies" },
    { href: "/profile/referrals", icon: "🎁", title: "Referrals", desc: "Invite friends and earn rewards" },
    { href: "/settings", icon: "⚙️", title: "Settings", desc: "Manage account preferences" },
  ];

  const orders = summary?.orders;
  const savedAddressCount = summary?.addresses.saved ?? 0;

  return (
    <section className="min-h-screen bg-gray-50 py-8 px-4 pb-28">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-700 text-white rounded-3xl p-8 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-4xl font-bold shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold break-words">{fullName || "Welcome to YOMICO"}</h1>
              <p className="mt-1 opacity-90 break-all">
                {email || "Customer"}{" "}
                {summary && (
                  <span className="ml-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold align-middle">
                    {summary.profile.emailVerified ? "✓ Verified" : "Not verified"}
                  </span>
                )}
              </p>
              <p className="mt-1 opacity-90">📞 {phone || "Add your mobile number below"}</p>
              {summary?.profile.memberSince && (
                <p className="mt-1 text-sm opacity-80">Member since {formatDate(summary.profile.memberSince)}</p>
              )}
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

        {loadError && !summary && (
          <div className="rounded-2xl bg-red-50 p-4 text-red-700">{loadError}</div>
        )}

        {/* NEEDS YOUR ATTENTION */}
        {attention.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-amber-900">🔔 Needs your attention</h2>
            {attention.map((a) => (
              <div key={a.text} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-sm text-amber-900">{a.text}</p>
                <Link
                  href={a.href}
                  className="shrink-0 self-start sm:self-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                >
                  {a.cta}
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* REWARD WALLET */}
        <Link href="/profile/wallet" className="block">
          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-3xl p-6 shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm opacity-90">🏆 Reward Wallet</p>
                <h2 className="text-4xl font-bold mt-1">🏆 {rewardPoints}</h2>
                <p className="text-sm opacity-90 mt-1">points available · ≈ ₹{rewardPoints} redeemable</p>
                {pendingPoints > 0 && (
                  <p className="text-sm opacity-90">+ {pendingPoints} pending (credited after the return window)</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-semibold">
                  {memberTier.icon} {memberTier.label}
                </p>
                {memberTier.next && (
                  <p className="text-xs opacity-90 mt-1">{memberTier.next - rewardPoints} pts to next tier</p>
                )}
              </div>
            </div>
            <div className="mt-4 h-2 w-full bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white/90 transition-all duration-500" style={{ width: `${tierProgress}%` }} />
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className="text-gray-500 text-sm">Orders</p>
            <h2 className="text-3xl font-bold mt-2">{orders?.total ?? 0}</h2>
            <p className="text-xs text-gray-400 mt-1">{orders?.active ?? 0} in progress</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className="text-gray-500 text-sm">Open Returns</p>
            <h2 className="text-3xl font-bold mt-2">{summary?.returns.open ?? 0}</h2>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className="text-gray-500 text-sm">Referrals</p>
            <h2 className="text-3xl font-bold mt-2">{summary?.referrals.paidReferrals ?? 0}</h2>
          </div>
          <Link href="/notifications" className="bg-white rounded-2xl shadow-sm p-5 text-center block">
            <p className="text-gray-500 text-sm">Unread Notifications</p>
            <h2 className="text-3xl font-bold mt-2">{summary?.notifications.unread ?? 0}</h2>
          </Link>
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
              <label className="block text-sm text-gray-500 mb-1">Full Name</label>
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Mobile Number</label>
              <input
                type="tel"
                maxLength={10}
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10 digit mobile number"
                className="w-full p-3.5 border rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Email</label>
              <input type="text" value={email} disabled className="w-full p-3.5 border rounded-xl bg-gray-50 text-gray-500" />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Account Type</label>
              <input
                type="text"
                value="Customer Account"
                disabled
                className="w-full p-3.5 border rounded-xl bg-gray-50 text-gray-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-gray-500 mb-1">Saved Addresses</label>
              <div className="w-full p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-800">
                    {savedAddressCount > 0
                      ? `${savedAddressCount} address${savedAddressCount === 1 ? "" : "es"} saved`
                      : "No saved addresses"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Manage your delivery addresses for faster checkout.</p>
                </div>
                <Link
                  href={savedAddressCount > 0 ? "/addresses" : "/addresses/add"}
                  className="shrink-0 self-start sm:self-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap text-center"
                >
                  {savedAddressCount > 0 ? "Manage Addresses" : "Add Address"}
                </Link>
              </div>
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
            <Link href="/orders" className="text-green-600 font-semibold text-sm hover:underline">
              View all →
            </Link>
          </div>

          {!orders || orders.recent.length === 0 ? (
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
              {orders.recent.map((order) => (
                <Link key={order.orderId} href={`/orders/${encodeURIComponent(order.orderId)}`} className="block">
                  <div className="flex items-center justify-between gap-3 border rounded-2xl p-4 hover:shadow-md transition">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {order.orderNumber ? `Order #${order.orderNumber}` : "Order"}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        ₹{order.total.toLocaleString("en-IN")} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                        {order.firstItem ? ` · ${order.firstItem.name}` : ""}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(order.placedAt) || "-"}</p>
                    </div>
                    <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${statusColor(order.status)}`}>
                      {order.statusLabel}
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
        <Link href="/support" className="text-green-600 ml-1 hover:underline">
          Contact Support
        </Link>
      </div>
    </section>
  );
}
