"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useEffect, useState } from "react";

// Stopgap admin check. Replace with a custom claim (token.admin === true)
// when you set up admin claims — then this constant can go away.
const ADMIN_EMAIL = "adminyogimart@gmail.com";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/orders", label: "Orders", icon: "📦" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/customers", label: "Customers", icon: "🧑" },
  { href: "/admin/vendors", label: "Vendors", icon: "🏬" },
  { href: "/admin/kyc", label: "Vendor KYC", icon: "🪪" },
  { href: "/admin/coupons", label: "Coupons", icon: "🎟" },
  { href: "/admin/delivery", label: "Delivery", icon: "🚚" },
  { href: "/admin/delivery-partners", label: "Delivery Partners", icon: "🛵" },
  { href: "/admin/notifications", label: "Notifications", icon: "🔔" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user || user.email !== ADMIN_EMAIL) {
        localStorage.removeItem("admin");
        router.replace("/admin-login");
        return;
      }
      // Keep the flag in sync for any legacy checks elsewhere
      localStorage.setItem("admin", JSON.stringify({ email: user.email }));
      setAuthorized(true);
      setChecking(false);
    });

    return () => unsub();
  }, [router]);

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("admin");
    window.location.href = "/admin-login";
  };

  // Block all admin content until the Firebase session is verified as admin
  if (checking || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Checking admin access…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* SIDEBAR */}
      <aside className="w-64 shrink-0 bg-black text-white flex flex-col sticky top-0 h-screen">
        <div className="p-5 text-center border-b border-white/10">
          <img src="/logo.png" alt="YOMICO" className="w-32 mx-auto mb-3" />
          <h1 className="text-2xl font-bold">👑 Admin Panel</h1>
          <p className="text-gray-400 mt-1 text-sm">Marketplace Control Center</p>
          <div className="mt-3 bg-green-600 rounded-full px-4 py-1.5 inline-block text-sm">
            🟢 System Online
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {navItems.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl whitespace-nowrap transition ${
                  active ? "bg-green-600 font-semibold" : "hover:bg-white/10"
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
            className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl hover:bg-red-600 transition font-semibold"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* CONTENT */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
