"use client";

import Link from "next/link";
import {usePathname, useRouter, } from "next/navigation";
import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const navItems = [
  { href: "/seller", label: "Dashboard", icon: "📊" },
  { href: "/seller/orders", label: "Orders", icon: "📦" },
  { href: "/seller#add-product", label: "Add Product", icon: "➕" },
  { href: "/seller#products", label: "Products", icon: "🏷️" },
  { href: "/seller/store", label: "My Stores", icon: "🏬" },
  { href: "/seller/questions", label: "Questions", icon: "❓" },
  { href: "/seller/analytics", label: "Analytics", icon: "📈" },
  { href: "/seller/reports", label: "Reports", icon: "📄" },
  { href: "/seller/assistant", label: "AI Assistant", icon: "🤖" },
  { href: "/seller/chat", label: "Customer Chats", icon: "💬" },
];

export default function SellerLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

useEffect(() => {
  const vendor = localStorage.getItem("vendor");

  if (!vendor) {
    router.replace("/vendor-login");
  }
}, [router]);

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("vendor");
    window.location.href = "/vendor-login";
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="w-64 shrink-0 bg-gradient-to-b from-green-700 to-blue-700 text-white flex flex-col sticky top-0 h-screen">
        <div className="p-5 text-center border-b border-white/10">
          <img
            src="/logo.png"
            alt="Yogi Mart"
            className="w-32 mx-auto mb-2"
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
          <div className="text-center py-10 text-gray-500">
Need Help?
<Link href="/seller/support" className="text-green-600 ml-2 hover:underline" >
Seller Support
</Link>
</div>
        </div>
      </aside>

      {/* CONTENT */}
      <main className="flex-1 min-w-0">{children}</main>
      
    </div>
  );
}