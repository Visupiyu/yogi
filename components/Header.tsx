"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Heart, User, Search } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import NotificationBell from "@/components/NotificationBell";
import { db } from "@/lib/firebase";
import Image from "next/image";

interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
  stock?: number;
}

export default function Header() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
   if (search.trim().length < 2) {
  setSuggestions([]);
  setSearched(false);
  return;
}

    // Debounce so we don't read the whole collection on every keystroke
    const t = setTimeout(async () => {setSearched(true);
      try {
        const snapshot = await getDocs(collection(db, "products"));
        const items: Product[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const title: string = data.title || data.name || "";
          if (
  title.toLowerCase().includes(search.toLowerCase()) &&
  Number(data.stock || 0) > 0
) {
            items.push({
              id: doc.id,
              name: title,
              price: Number(data.sellingPrice ?? data.price ?? 0),
              image:
                data.thumbnail ||
                (Array.isArray(data.images) ? data.images[0] : "") ||
                data.image ||
                "",
              stock: Number(data.stock || 0),
            });
          }
        });
        setSuggestions(items.slice(0, 5));
      } catch (error) {
        console.error(error);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [search]);

  const runSearch = () => {
    const q = search.trim();
    if (!q) return;
    setSuggestions([]);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="h-20 flex items-center justify-between gap-4">
          {/* LOGO */}
          <Link href="/">
           <h1 className="text-2xl font-extrabold text-green-600 whitespace-nowrap transition-transform duration-300 hover:scale-105">
              YOMICO
            </h1>
          </Link>

          {/* SEARCH BAR */}
          <div className="flex-1 hidden md:flex">
            <div className="w-full relative">
              <input
                type="text"
                placeholder="Search for products, brands and categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                className="w-full border border-gray-200 rounded-full py-3 pl-5 pr-12 shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
              />
              <button
                onClick={runSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white p-2 rounded-full"
              >
                <Search size={18} />
              </button>

             {searched && (
  <div className="absolute top-full left-0 right-0 bg-white rounded-2xl shadow-xl mt-2 overflow-hidden z-50">
    {suggestions.length > 0 ? (
      suggestions.map((product) => (
        <Link
          key={product.id}
          href={`/product/${product.id}`}
          onClick={() => setSuggestions([])}
          className="flex items-center gap-4 p-3 hover:bg-gray-100"
        >
          <Image
  src={product.image || "/no-image.png"}
  alt={product.name}
  width={48}
  height={48}
  className="w-12 h-12 rounded-lg object-cover"
/>

          <div>
            <p className="font-medium">{product.name}</p>

            <p className="text-green-600 font-bold">
              ₹{product.price?.toLocaleString("en-IN")}
            </p>
          </div>
        </Link>
      ))
    ) : (
     <div className="p-6 text-center text-gray-500">
  <Search className="mx-auto mb-2 text-gray-400" size={28} />
  <p>No matching products found.</p>
</div>
    )}
  </div>
)}
</div>
</div>
{/* Mobile Search */}
<div className="md:hidden px-4 pb-4">
  <div className="relative">
    <input
      type="text"
      placeholder="Search for products..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") runSearch();
      }}
      className="w-full border border-gray-200 rounded-full py-3 pl-5 pr-12 shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
    />

    <button
      onClick={runSearch}
      className="absolute right-2 top-1/2 -translate-y-1/2 bg-green-600 text-white p-2 rounded-full"
    >
      <Search size={18} />
    </button>
  </div>
</div>

          {/* RIGHT SIDE */}
          <div className="flex items-center gap-5">
            <NotificationBell />

            <Link
  href="/wishlist"
  className="relative transition-transform duration-300 hover:scale-110"
>
  <Heart className="w-6 h-6 text-gray-700" />
</Link>

<Link
  href="/cart"
  className="relative transition-transform duration-300 hover:scale-110"
>
  <ShoppingCart className="w-6 h-6 text-gray-700" />
</Link>

            <Link href="/login">
              <div className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full transition">
                <User size={18} />
                <span className="hidden md:block">Login</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
