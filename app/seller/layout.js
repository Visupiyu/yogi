"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useVendor } from "@/hooks/useVendor";
import Image from "next/image";

const navItems = [
  { href: "/seller", label: "Dashboard", icon: "📊" },
  { href: "/seller/orders", label: "Orders", icon: "📦" },
  { href: "/seller#add-product", label: "Add Product", icon: "➕" },
  { href: "/seller#products", label: "Products", icon: "🏷️" },
  { href: "/seller/inventory", label: "Inventory", icon: "📋" },
  { href: "/seller/settings", label: "Store Settings", icon: "🏬" },
  { href: "/seller/questions", label: "Questions", icon: "❓" },
  { href: "/seller/analytics", label: "Analytics", icon: "📈" },
  { href: "/seller/reports", label: "Reports", icon: "📄" },
  { href: "/seller/payouts", label: "Payout Report", icon: "🧾" },
  { href: "/seller/wallet", label: "Wallet", icon: "💰" },
  { href: "/seller/assistant", label: "AI Assistant", icon: "🤖" },
  { href: "/seller/chat", label: "Customer Chats", icon: "💬" },
  { href: "/seller/notifications", label: "Notifications", icon: "🔔" },
  { href: "/seller/stock-notifications", label: "Stock Notifications", icon: "📥" },
];

// First path segment for every real seller-dashboard route. Anything under
// /seller/{x} whose first segment ISN'T one of these is the public
// storefront (/seller/[vendorUid], linked from product & order pages) and
// must NOT get the vendor-only gate or dashboard chrome.
const SELLER_ROUTE_SEGMENTS = new Set([
  "add",
  "analytics",
  "assistant",
  "chat",
  "edit",
  "inventory",
  "invoice",
  "notifications",
  "orders",
  "payouts",
  "products",
  "questions",
  "reports",
  "settings",
  "stock-notifications",
  "store",
  "wallet",
]);

const BLOCKED_MESSAGES = {
  Pending: "Vendor Approval Pending",
  Rejected: "Vendor Account Rejected",
  Blocked: "Your vendor account has been blocked. Please contact support.",
};

export default function SellerLayout({ children }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  // Permanent sidebar only makes sense once there's room for it — below
  // md it becomes an off-canvas drawer instead (see <aside> below), toggled
  // by this state and always closed again on route change.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const segments = pathname.split("/").filter(Boolean); // ["seller", ...]
  const firstSegment = segments[1];
  const isPublicStorefront =
    firstSegment !== undefined && !SELLER_ROUTE_SEGMENTS.has(firstSegment);

  const { user, vendor, status, loading, error } = useVendor();

  useEffect(() => {
    if (isPublicStorefront) return;
    if (loading) return;

    if (!user) {
      router.replace("/vendor-login");
      return;
    }

    if (error === "no-vendor" || !vendor) {
      signOut(auth);
      localStorage.removeItem("vendor");
      router.replace("/vendor-login");
      return;
    }

    if (status && status !== "Approved") {
      signOut(auth);
      localStorage.removeItem("vendor");
      alert(BLOCKED_MESSAGES[status] || "Vendor account is not active.");
      router.replace("/vendor-login");
    }
  }, [isPublicStorefront, loading, user, vendor, status, error, router]);

  // Public storefront pages render standalone — no vendor gate, no
  // dashboard chrome.
  if (isPublicStorefront) {
    return <>{children}</>;
  }

  // Gate all real seller-dashboard content until the session is verified
  // as an approved vendor — re-checked live on every load, so a vendor
  // blocked mid-session is kicked out immediately, not just at login.
  if (loading || !user || !vendor || status !== "Approved") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Checking seller access…
      </div>
    );
  }

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("vendor");
    window.location.href = "/vendor-login";
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* MOBILE TOP BAR — only the sidebar's own trigger; the desktop
          sidebar below is untouched at md: and up. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-r from-green-700 to-blue-700 text-white px-4 py-3">
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open seller menu"
          className="text-2xl leading-none px-1"
        >
          ☰
        </button>
        <span className="font-bold">Seller Panel</span>
        <span className="w-8" aria-hidden="true" />
      </div>

      {/* MOBILE BACKDROP */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR — fixed off-canvas drawer below md (slides in/out via
          translate-x, toggled by mobileNavOpen), reverts to the original
          in-flow sticky sidebar unchanged at md: and up. */}
      <aside
        className={`
          w-64 shrink-0 bg-gradient-to-b from-green-700 to-blue-700 text-white flex flex-col
          fixed inset-y-0 left-0 z-50 h-screen transition-transform duration-300 ease-in-out
          md:sticky md:top-0 md:inset-auto md:z-auto md:translate-x-0
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="p-5 text-center border-b border-white/10 relative">
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close seller menu"
            className="md:hidden absolute top-3 right-3 text-2xl leading-none"
          >
            ✕
          </button>
         <Image
  src="/logo.png"
  alt="YOMICO"
  width={180}
  height={180}
  className="h-36 md:h-40 w-auto object-contain"
/>
          <h1 className="text-xl font-bold">Seller Panel</h1>
          <p className="text-sm opacity-80 mt-2">🟢 Online</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {navItems.map((item) => {
            const base = item.href.split("#")[0];
            const active =
              base === "/seller"
                ? pathname === "/seller"
                : pathname.startsWith(base);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl whitespace-nowrap transition ${
                  active ? "bg-white/20 font-semibold" : "hover:bg-white/10"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 text-left whitespace-nowrap px-4 py-3 rounded-xl hover:bg-red-500 transition font-semibold"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* CONTENT — pt-14 clears the fixed mobile top bar; removed again
          at md: since the top bar itself is md:hidden there. */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0">{children}</main>

    </div>
  );
}
