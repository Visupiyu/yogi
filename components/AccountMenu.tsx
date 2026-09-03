"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, User, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

// Customer account / profile dropdown for the desktop header.
//
// Rendered ONLY for customer + logged-out sessions (vendor/admin keep their
// existing direct dashboard links in Navbar). Identity comes from the
// localStorage `user` already loaded by Navbar — no Firestore read to open the
// menu. Logout reuses the app's Firebase signOut + the same localStorage keys
// the profile page clears, and fires the existing cart/wishlist events so the
// header counts reset. Every href below is a verified existing route.

type AccountUser = {
  name?: string;
  email?: string;
  businessName?: string;
};

type MenuLink = { label: string; href: string };
type MenuSection = { heading: string; links: MenuLink[] };

// Logged-in customer sections (approved order). No Coupons / Recently-Viewed /
// Continue-Shopping — those have no route. Orders appears once.
const SECTIONS: MenuSection[] = [
  {
    heading: "Account",
    links: [
      { label: "My Profile", href: "/profile" },
      { label: "Orders", href: "/orders" },
      { label: "Wishlist", href: "/wishlist" },
      { label: "Saved Addresses", href: "/addresses" },
      { label: "Notifications", href: "/notifications" },
    ],
  },
  {
    heading: "Shopping & Returns",
    links: [
      { label: "Returns & Refunds", href: "/profile/refunds" },
      { label: "Track Order", href: "/track-order" },
    ],
  },
  {
    heading: "Money & Rewards",
    links: [
      { label: "Wallet", href: "/profile/wallet" },
      { label: "Rewards", href: "/profile/rewards" },
      { label: "Refer & Earn", href: "/profile/referrals" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Support", href: "/support" },
      { label: "My Tickets", href: "/profile/tickets" },
    ],
  },
  {
    heading: "Sell on YOMICO",
    links: [{ label: "Become a Seller", href: "/vendor-register" }],
  },
];

export default function AccountMenu({ user }: { user: AccountUser | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const loggedIn = !!user;
  // A reliable name is a non-empty user.name only — NEVER derived from the
  // email address.
  const reliableName = user?.name && user.name.trim() ? user.name.trim() : "";
  // Never surface the email in the always-visible trigger — name or "Account".
  const triggerLabel = loggedIn ? reliableName || "Account" : "Login";

  // Close on outside click + Escape (Escape returns focus to the trigger).
  useEffect(() => {
    if (!open) return;

    const onPointer = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const logout = async () => {
    // Reuse the app's existing logout mechanism (mirrors app/profile/page.tsx).
    try {
      await signOut(auth);
    } catch {
      /* even if the network call fails, still clear the local session */
    }
    localStorage.removeItem("user");
    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutItems");
    localStorage.removeItem("wishlist");
    // Keep the existing header event behavior so counts + user label reset.
    window.dispatchEvent(new Event("cartUpdated"));
    window.dispatchEvent(new Event("wishlistUpdated"));
    window.dispatchEvent(new Event("storage"));
    setOpen(false);
    router.push("/login");
  };

  const itemClass =
    "block px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 transition";

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white px-4 py-2 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
      >
        <User size={18} />
        <span className="hidden md:block max-w-[10rem] truncate">
          {triggerLabel}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 max-h-[80vh] overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-xl z-[60] p-2"
          role="menu"
          aria-label="Account"
        >
          {loggedIn ? (
            <>
              {/* Greeting — a real name only ("Welcome, {name}"); otherwise a
                  neutral brand greeting. Never a name derived from the email. */}
              <div className="px-3 pt-2 pb-3 border-b border-gray-100">
                <p className="font-bold text-gray-900 truncate">
                  {reliableName ? `Welcome, ${reliableName}` : "Welcome to YOMICO"}
                </p>
                {user?.email && (
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                )}
              </div>

              {SECTIONS.map((section) => (
                <div key={section.heading} className="py-1.5">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {section.heading}
                  </p>
                  {section.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      role="menuitem"
                      onClick={close}
                      className={itemClass}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              ))}

              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  type="button"
                  onClick={logout}
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition"
                >
                  <LogOut size={16} aria-hidden="true" focusable="false" />
                  <span>Logout</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Logged-out */}
              <div className="px-3 pt-2 pb-3 border-b border-gray-100">
                <p className="font-bold text-gray-900">Welcome to YOMICO</p>
                <p className="text-xs text-gray-500">
                  Sign in for orders, wishlist &amp; rewards.
                </p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href="/login"
                    role="menuitem"
                    onClick={close}
                    className="flex-1 text-center bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white text-sm font-semibold px-3 py-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 transition"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    role="menuitem"
                    onClick={close}
                    className="flex-1 text-center border border-green-600 text-green-700 hover:bg-green-50 text-sm font-semibold px-3 py-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 transition"
                  >
                    Create Account
                  </Link>
                </div>
              </div>

              <div className="py-1.5">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Shopping
                </p>
                <Link href="/wishlist" role="menuitem" onClick={close} className={itemClass}>
                  Wishlist
                </Link>
                <Link href="/orders" role="menuitem" onClick={close} className={itemClass}>
                  Orders
                </Link>
              </div>

              <div className="py-1.5 border-t border-gray-100">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Help
                </p>
                <Link href="/support" role="menuitem" onClick={close} className={itemClass}>
                  Support
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
