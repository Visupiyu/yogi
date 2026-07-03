"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Heart, ShoppingCart, User } from "lucide-react";

export default function MobileBottomNav() {
  const pathname = usePathname() || "";

  if (pathname.startsWith("/seller") || pathname.startsWith("/admin")) {
    return null;
  }

  const navItems = [
    { name: "Home", href: "/", icon: Home },
    { name: "Search", href: "/search", icon: Search },
    { name: "Wishlist", href: "/wishlist", icon: Heart },
    { name: "Cart", href: "/cart", icon: ShoppingCart },
    { name: "Account", href: "/profile", icon: User },
  ];

  return (
    <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] bg-white/90 backdrop-blur-lg border shadow-2xl rounded-2xl z-50 px-2 py-2">
      <div className="flex items-center justify-between">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={index}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-2 rounded-xl transition ${
                active ? "bg-green-600 text-white" : "text-gray-600"
              }`}
            >
              <Icon size={20} />
              <span className="text-[11px] mt-1 font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
