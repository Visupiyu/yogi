"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

const CATEGORIES = [
  "Men Fashion",
  "Women Fashion",
  "Kids Fashion",
  "Electronics",
  "Beauty",
  "Appliances",
  "Furniture",
  "Grocery",
  "Mobiles",
  "Books",
];

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  const [category, setCategory] = useState("");

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, "products"));
        const items = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const searchText = `${data.name || ""} ${data.category || ""} ${
            data.description || ""
          }`.toLowerCase();

          if (searchText.includes(query.trim().toLowerCase())) {
            items.push({ id: doc.id, ...data });
          }
        });
        setProducts(items);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [query]);

  useEffect(() => {
    let items = [...products];

    if (category) {
      items = items.filter((item) => item.category === category);
    }
    if (stockOnly) {
      items = items.filter((item) => item.stock > 0);
    }
    if (sort === "low") items.sort((a, b) => a.price - b.price);
    if (sort === "high") items.sort((a, b) => b.price - a.price);
    if (sort === "stock") items.sort((a, b) => b.stock - a.stock);

    setFiltered(items);
  }, [products, sort, stockOnly, category]);

  const clearFilters = () => {
    setSort("");
    setStockOnly(false);
    setCategory("");
  };

  const quickChips = ["Shoes", "Mobiles", "Beauty", "Grocery", "Fashion"];

  return (
    <section className="py-8 px-4 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl text-white p-8 mb-8">
  <h1 className="text-4xl font-bold">
    {query
      ? `🔍 Search: "${query}"`
      : "🔍 Explore Products"}
  </h1>
  <p className="mt-2 text-lg opacity-90">
    {filtered.length} product{filtered.length !== 1 ? "s" : ""} found
  </p>
</div>
        </div>

        {/* FILTER BAR */}
        <div className="bg-white rounded-3xl shadow-lg p-4 mb-8 flex flex-wrap gap-3 items-center">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Sort By</option>
            <option value="low">Price: Low to High</option>
            <option value="high">Price: High to Low</option>
            <option value="stock">Stock Available</option>
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 border rounded-xl px-4 py-2.5 bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={stockOnly}
              onChange={(e) => setStockOnly(e.target.checked)}
              className="accent-green-600"
            />
            In Stock Only
          </label>

          {(sort || stockOnly || category) && (
            <button
              onClick={clearFilters}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl font-semibold transition"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* RESULTS */}
        {loading ? (
          <div className="text-center py-20 text-gray-500">
            Loading products…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm p-12 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold mb-2">🔍 No products found</h2>
            <p className="text-gray-500 mb-6">Try another keyword or filter.</p>
            <Link href="/">
              <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold transition">
                Continue Shopping
              </button>
              <div className="mt-8">
<p className="font-bold mb-4">
Popular Searches
</p>
<div className="flex justify-center gap-3 flex-wrap">
<span className="bg-white shadow rounded-full px-4 py-2">
📱 Mobiles
</span>
<span className="bg-white shadow rounded-full px-4 py-2">
👗 Fashion
</span>
<span className="bg-white shadow rounded-full px-4 py-2">
💄 Beauty
</span>
<span className="bg-white shadow rounded-full px-4 py-2">
🛒 Grocery
</span>
</div>
</div>
            </Link>
          </div>
          ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((product) => {
              const hasMrp =
                Number(product.mrp) && Number(product.mrp) > Number(product.price);
              const off = hasMrp
                ? Math.round(
                    ((product.mrp - product.price) / product.mrp) * 100
                  )
                : 0;

              return (
                <Link key={product.id} href={`/product/${product.id}`}>
                  <div className="bg-white rounded-3xl shadow-lg hover:shadow-2xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden h-full">
                    <div className="h-48 bg-gray-100 relative">
                      <img
                        src={product.image || "/no-image.png"}
                        alt={product.name}
                       className="w-full h-full object-cover hover:scale-105 transition duration-500"
                      />
                      {hasMrp && (
                        <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded-full">
                          {off}% OFF
                        </span>
                      )}
                    </div>

                    <div className="p-3">
                      <h3 className="font-semibold text-sm line-clamp-2 min-h-[40px]">
                        {product.name}
                      </h3>
                      <div className="flex items-center gap-1 mt-2 text-yellow-500">
                       ★★★★★ <span className="text-xs text-gray-500">(4.9)</span></div>

                    <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-3 mt-6">
                        <span className="text-green-600 font-bold">
                          ₹{Number(product.price).toLocaleString("en-IN")}
                        </span>
                        {hasMrp && (
                          <span className="text-gray-400 line-through text-xs">
                            ₹{Number(product.mrp).toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-xs mt-2 font-medium ${
                          product.stock > 0 ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {product.stock > 0 ? "In Stock" : "Out of Stock"}</p>
                      <p className="text-xs text-green-600 mt-1">🚚 Free Delivery </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <div className="text-center py-10 text-gray-400">
Need help finding something?
<Link
href="/support"
className="text-green-600 ml-2 hover:underline"
>
Contact Support
</Link>
</div>
    </section>
  );
}
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <SearchContent />
    </Suspense>
  );
}
