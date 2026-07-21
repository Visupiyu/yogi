"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { ShoppingCart, Heart, User, Search } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function Navbar() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);

  const searchRef = useRef<HTMLDivElement>(null);

  const handleSearch = () => {
    const q = search.trim();
    if (!q) return;
    setSuggestions([]);
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  /* CART + WISHLIST COUNTS */
  useEffect(() => {
    const updateCounts = () => {
      const cart = JSON.parse(localStorage.getItem("cart") || "[]");
      const totalQty = cart.reduce(
        (sum: number, item: any) => sum + (item.qty || 0),
        0
      );
      setCartCount(totalQty);

      const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
      setWishlistCount(wishlist.length);
    };

    updateCounts();
    window.addEventListener("storage", updateCounts);
    window.addEventListener("cartUpdated", updateCounts as EventListener);
    window.addEventListener("wishlistUpdated", updateCounts as EventListener);

    return () => {
      window.removeEventListener("storage", updateCounts);
      window.removeEventListener("cartUpdated", updateCounts as EventListener);
      window.removeEventListener(
        "wishlistUpdated",
        updateCounts as EventListener
      );
    };
  }, []);

  /* LOAD USER */
  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const savedVendor = localStorage.getItem("vendor");
    const savedAdmin = localStorage.getItem("admin");

    if (savedAdmin) setUser(JSON.parse(savedAdmin));
    else if (savedVendor) setUser(JSON.parse(savedVendor));
    else if (savedUser) setUser(JSON.parse(savedUser));
    else setUser(null);
  }, []);

  /* SEARCH SUGGESTIONS (debounced) */
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const snapshot = await getDocs(collection(db, "products"));
        const items: any[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.name?.toLowerCase().includes(trimmed.toLowerCase())) {
            items.push({ id: doc.id, ...data });
          }
        });
        setSuggestions(items.slice(0, 5));
        setShowSuggestions(true);
      } catch (error) {
        console.error(error);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [search]);

  /* CLOSE SUGGESTIONS ON OUTSIDE CLICK */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const userLabel = user?.businessName
    ? user.businessName
    : user?.name
    ? user.name
    : user?.email
    ? user.email.length > 18
      ? user.email.substring(0, 18) + "..."
      : user.email
    : "Login";

  return (
    <motion.header className="sticky top-0 z-50 bg-gradient-to-r from-green-200 via-green-50 to-blue-100 border-b border-gray-200 shadow-md">
      <div className="max-w-screen-2xl mx-auto px-4">
        <div className="h-16 flex items-center justify-between gap-6">
          {/* LOGO */}
          <Link
  href="/"
  className="shrink-0 flex items-center gap-3"
>
  <img
    src="/logo.png"
    alt="YOMICO"
    className="h-11 md:h-12 w-auto object-contain"
  />

  <div className="hidden md:block">
    <h1 className="text-2xl font-extrabold tracking-wide text-green-700">
      YOMICO
    </h1>

    <p className="text-xs text-gray-600 -mt-1">
      India's Multi-Vendor Marketplace
    </p>
  </div>
</Link>

          {/* SEARCH */}
          <div className="flex-1 flex">
            <div className="w-full relative max-w-2xl mx-auto" ref={searchRef}>
              <input
                type="text"
                placeholder="Search on YOMICO..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full border border-gray-300 bg-white text-gray-800 placeholder:text-gray-400 rounded-full py-2.5 pl-5 pr-28 outline-none focus:border-green-500 text-sm md:text-base"
              />

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 w-full bg-white border border-slate-200 shadow-xl rounded-2xl mt-2 z-50 overflow-hidden">
                  {suggestions.map((item: any) => (
                    <Link
                      key={item.id}
                      href={`/product/${item.id}`}
                      onClick={() => {
                        setSuggestions([]);
                        setShowSuggestions(false);
                      }}
                    >
                      <div className="flex items-center gap-4 p-3 hover:bg-gray-100 transition">
                        <img
                          src={item.image || "/no-image.png"}
                          alt=""
                          className="w-14 h-14 object-cover rounded-xl"
                        />
                        <div>
                          <p className="font-semibold line-clamp-1">
                            {item.name}
                          </p>
                          <p className="text-green-600 font-bold">
                            ₹{Number(item.price || 0).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <button
                onClick={handleSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white px-3 py-2 rounded-full"
              >
                <div className="flex items-center gap-2">
                  <Search size={18} />
                  <span className="hidden md:block">Search</span>
                </div>
              </button>
            </div>
          </div>

          {/* RIGHT */}
          <div className="hidden md:flex items-center gap-6">
            {/* WISHLIST */}
            <Link href="/wishlist" className="relative">
              <Heart className="w-6 h-6 text-gray-700" />
              {wishlistCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* CART */}
            <Link href="/cart" className="relative">
              <ShoppingCart className="w-6 h-6 text-gray-700" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>

            {/* PROFILE / LOGIN */}
            <Link href="/profile">
              <div className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white px-4 py-2 rounded-full transition">
                <User size={18} />
                <span className="hidden md:block">{userLabel}</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
