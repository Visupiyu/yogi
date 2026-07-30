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
   <div className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-lg border-t shadow-xl z-50 px-1 py-1">
      <div className="flex items-center justify-between">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={index}
              href={item.href}
             className={`flex flex-col items-center justify-center flex-1 py-1 rounded-lg transition ${
  active
    ? "bg-green-600 text-white"
    : "text-gray-600"
}`}
            >
              <Icon size={14} />
             <span className="text-[10px] mt-0.5 font-medium">
  {item.name}
</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
