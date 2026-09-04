"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ADMIN_EMAIL } from "@/lib/adminConfig";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/ai-assistant", label: "AI Assistant", icon: "🤖" },
  { href: "/admin/orders", label: "Orders", icon: "📦" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/customers", label: "Customers", icon: "🧑" },
  { href: "/admin/vendors", label: "Vendors", icon: "🏬" },
  { href: "/admin/kyc", label: "Vendor KYC", icon: "🪪" },
  { href: "/admin/seller-inquiries", label: "Seller Inquiries", icon: "📨" },
  { href: "/admin/coupons", label: "Coupons", icon: "🎟" },
  { href: "/admin/delivery", label: "Delivery", icon: "🚚" },
  { href: "/admin/delivery-partners", label: "Delivery Partners", icon: "🛵" },
  { href: "/admin/notifications", label: "Notifications", icon: "🔔" },
  { href: "/admin/support", label: "Support", icon: "🎫" },
  { href: "/admin/reviews", label: "Reviews", icon: "⭐" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
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
  // Permanent sidebar only makes sense once there's room for it — below
  // md it becomes an off-canvas drawer instead (see <aside> below), toggled
  // by this state and always closed again on route change.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || user.email !== ADMIN_EMAIL) {
        localStorage.removeItem("admin");
        router.replace("/admin-login");
        return;
      }

      // Force-refresh the ID token and reload the user record BEFORE
      // authorizing. firestore.rules' isAdmin() requires
      // token.email_verified == true, but that claim is cached in the ID
      // token for up to an hour — so gating on the email alone let an
      // unverified (or not-yet-refreshed) admin render the whole panel while
      // every Firestore read behind it was denied, which looks like data
      // loss rather than an auth problem. getIdToken(true) mints a token
      // carrying the current claim; reload() refreshes user.emailVerified.
      try {
        await user.getIdToken(true);
        await user.reload();
      } catch {
        // FAIL CLOSED. If the refresh could not complete we do not know the
        // real verification state, so never authorize on the cached one.
        if (cancelled) return;
        localStorage.removeItem("admin");
        router.replace("/admin-login");
        return;
      }

      if (cancelled) return;

      // The UI gate now matches isAdmin(): an unverified admin goes to
      // /admin-login, which re-issues the verification email, instead of
      // into a panel that silently fails on every read.
      if (!user.emailVerified) {
        localStorage.removeItem("admin");
        router.replace("/admin-login");
        return;
      }

      // Keep the flag in sync for any legacy checks elsewhere
      localStorage.setItem("admin", JSON.stringify({ email: user.email }));
      setAuthorized(true);
      setChecking(false);
    });

    return () => {
      cancelled = true;
      unsub();
    };
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
      {/* MOBILE TOP BAR — only the sidebar's own trigger; the desktop
          sidebar below is untouched at md: and up. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between gap-3 bg-black text-white px-4 py-3">
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open admin menu"
          className="text-2xl leading-none px-1"
        >
          ☰
        </button>
        <span className="font-bold">👑 Admin Panel</span>
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
          w-64 shrink-0 bg-black text-white flex flex-col
          fixed inset-y-0 left-0 z-50 h-screen transition-transform duration-300 ease-in-out
          md:sticky md:top-0 md:inset-auto md:z-auto md:translate-x-0
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="p-5 text-center border-b border-white/10 relative">
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close admin menu"
            className="md:hidden absolute top-3 right-3 text-2xl leading-none"
          >
            ✕
          </button>
        <Image   src="/logo.png"  alt="YOMICO" width={180} height={180}
  className="h-36 md:h-40 w-auto object-contain"/>
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
                onClick={() => setMobileNavOpen(false)}
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

      {/* CONTENT — pt-14 clears the fixed mobile top bar; removed again
          at md: since the top bar itself is md:hidden there. */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0">{children}</main>
    </div>
  );
}
