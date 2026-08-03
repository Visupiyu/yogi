"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { ShoppingCart, Heart, User, Search } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { getCartCount } from "@/lib/cart";

type ProductSuggestion = {
  id: string;
  name: string;
  image?: string;
  price?: number;
};

type User = {
  name?: string;
  email?: string;
  businessName?: string;
};
type CartItem = {
  qty?: number;
};

export default function Navbar() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);
  const trendingSearches = [
  "Mobiles",
  "Electronics",
  "Grocery",
  "Beauty",
  "Men Fashion",
  "Women Fashion",
  "Kids Fashion",
  "Books",
];
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const handleSearch = () => {
    const q = search.trim();
    if (!q) return;
    setSuggestions([]);
    setShowSuggestions(false);
    const history = JSON.parse(
  localStorage.getItem("recentSearches") || "[]"
);

const updated = [
  search,
  ...history.filter((item: string) => item !== search),
].slice(0, 8);

localStorage.setItem(
  "recentSearches",
  JSON.stringify(updated)
);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  /* CART + WISHLIST COUNTS */
  useEffect(() => {
    const updateCounts = () => {
     setCartCount(getCartCount()); 

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
 const loadUser = () => {
  const savedUser = localStorage.getItem("user");
  const savedVendor = localStorage.getItem("vendor");
  const savedAdmin = localStorage.getItem("admin");

  if (savedAdmin) {
    setUser(JSON.parse(savedAdmin));
  } else if (savedVendor) {
    setUser(JSON.parse(savedVendor));
  } else if (savedUser) {
    setUser(JSON.parse(savedUser));
  } else {
    setUser(null);
  }
};

useEffect(() => {
  loadUser();

  window.addEventListener("storage", loadUser);

  return () => {
    window.removeEventListener("storage", loadUser);
  };
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
        const items: ProductSuggestion[] = [];
        snapshot.forEach((doc) => {
  const data = doc.data();

  if (data.name?.toLowerCase().includes(trimmed.toLowerCase())) {
    items.push({
      id: doc.id,
      name: data.name,
      image: data.image,
      price: data.price,
    });
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
    useEffect(() => {
  const history = JSON.parse(
    localStorage.getItem("recentSearches") || "[]"
  );

  setRecentSearches(history);
}, []);

  return (
    <motion.header className="sticky top-0 z-50 bg-gradient-to-r from-green-200 via-green-50 to-blue-100 border-b border-gray-200 shadow-md">
      <div className="max-w-screen-2xl mx-auto px-4">
        <div className="h-16 flex items-center justify-between gap-6">
          {/* LOGO */}
  <Link href="/" className="shrink-0 flex items-center gap-2">
  <Image
    src="/logo.png"
    alt="YOMICO"
    width={160}
    height={64}
    priority
    className="h-18 md:h-20 w-auto object-contain"
  />
  <div className="hidden md:block leading-tight">
    <h1 className="text-lg font-extrabold tracking-wide text-green-700">
      YOMICO
    </h1>
    <p className="text-[10px] text-gray-600 -mt-0.5">
      India&apos;s Multi-Vendor Marketplace
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

  if (e.key === "ArrowDown") {
    e.preventDefault();

    setSelectedSuggestion((prev) =>
      Math.min(
        prev + 1,
        (search.trim() ? suggestions.length : recentSearches.length) - 1
      )
    );

    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();

    setSelectedSuggestion((prev) =>
      Math.max(prev - 1, -1)
    );

    return;
  }

  if (e.key === "Enter") {

    if (
      search.trim() &&
      selectedSuggestion >= 0 &&
      suggestions[selectedSuggestion]
    ) {
      window.location.href = `/product/${suggestions[selectedSuggestion].id}`;
      return;
    }

    if (
      !search.trim() &&
      selectedSuggestion >= 0 &&
      recentSearches[selectedSuggestion]
    ) {
      window.location.href = `/search?q=${encodeURIComponent(
        recentSearches[selectedSuggestion]
      )}`;
      return;
    }

    handleSearch();
  }

}}
                onFocus={() => setShowSuggestions(true)}
                className="w-full border border-gray-300 bg-white text-gray-800 placeholder:text-gray-400 rounded-full py-2.5 pl-5 pr-28 outline-none focus:border-green-500 text-sm md:text-base"
              />

              {showSuggestions && (suggestions.length > 0 || (!search.trim() && recentSearches.length > 0)) && (
                <div className="absolute top-full left-0 w-full bg-white border border-slate-200 shadow-xl rounded-2xl mt-2 z-50 overflow-hidden">
                  {search.trim() ? (

  suggestions.map((item, index) => (
    <Link
      key={item.id}
      href={`/product/${item.id}`}
      onClick={() => {
        setSuggestions([]);
        setShowSuggestions(false);
      }}
    >
      <div
  className={`flex items-center gap-4 p-3 transition ${
    selectedSuggestion === index
      ? "bg-green-100"
      : "hover:bg-gray-100"
  }`}
>
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
  ))

) : (

  recentSearches.map((item, index) => (
    
    <Link
      key={index}
      href={`/search?q=${encodeURIComponent(item)}`}
      onClick={() => {
        setShowSuggestions(false);
      }}
    >
      <div
  className={`flex items-center gap-3 p-3 transition ${
    selectedSuggestion === index
      ? "bg-green-100"
      : "hover:bg-gray-100"
  }`}
>
        <span className="text-lg">🕒</span>
        <span>{item}</span>
      </div>
    </Link>
  ))

)}
{!search.trim() && (
  <>
    <div className="border-t border-gray-200 mt-1" />

    <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase">
      🔥 Trending Searches
    </div>

    {trendingSearches.map((item) => (
      <Link
        key={item}
        href={`/search?q=${encodeURIComponent(item)}`}
        onClick={() => {
          setShowSuggestions(false);
        }}
      >
        <div className="flex items-center gap-3 p-3 hover:bg-orange-50 transition">
          <span>🔥</span>
          <span>{item}</span>
        </div>
      </Link>
    ))}
  </>
)}
  {search.trim() && (
  <Link
    href={`/search?q=${encodeURIComponent(search)}`}
    onClick={() => {
      setSuggestions([]);
      setShowSuggestions(false);
    }}
  >
    <div className="border-t bg-green-50 hover:bg-green-100 p-3 text-center font-semibold text-green-700 transition">
      🔍 View all results for "<span className="font-bold">{search}</span>"
    </div>
  </Link>
)}
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
