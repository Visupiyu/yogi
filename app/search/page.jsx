"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, limit, query as firestoreQuery } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductFilters from "@/components/ProductFilters";
import { addToCart as addToCartHelper } from "@/lib/cart";
import { findNodeByName, isTopLevelCategory } from "@/lib/catalog";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";

// label = shown in the dropdown, value = the catalog node name used to
// resolve the real categoryId/subCategoryId (Men/Women are subcategories of
// "Fashion" in the catalog tree, not their own top-level category).
const CATEGORIES = [
  { label: "Men Fashion", value: "Men" },
  { label: "Women Fashion", value: "Women" },
  { label: "Kids Fashion", value: "Kids Fashion" },
  { label: "Electronics", value: "Electronics" },
  { label: "Beauty", value: "Beauty" },
  { label: "Appliances", value: "Appliances" },
  { label: "Furniture", value: "Furniture" },
  { label: "Grocery", value: "Grocery" },
  { label: "Mobiles", value: "Mobiles" },
  { label: "Books", value: "Books" },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  const [category, setCategory] = useState("");
  const [minPrice, setMinPrice] = useState(0);
const [maxPrice, setMaxPrice] = useState(1000000);
const [minimumRating, setMinimumRating] = useState(0);
const [minimumDiscount, setMinimumDiscount] = useState(0);
const [inStockOnly, setInStockOnly] = useState(false);
const [sortBy, setSortBy] = useState("default");
const [quickViewProduct, setQuickViewProduct] = useState(null);
const [showQuickView, setShowQuickView] = useState(false);
const [quickQty, setQuickQty] = useState(1);
const [quickSize, setQuickSize] = useState("");
const [quickColor, setQuickColor] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(false);
      try {
        // Firestore has no server-side substring/full-text search, so this
        // still has to scan and filter client-side — the limit() just
        // bounds the worst-case read cost as the catalog grows. A real fix
        // would need a dedicated search index (e.g. Algolia), which is a
        // separate initiative, not a one-line change.
        const snapshot = await getDocs(
          firestoreQuery(collection(db, "products"), limit(300))
        );
        const items = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const searchText = `${data.title || data.name || ""} ${
            data.brand || ""
          } ${data.description || ""}`.toLowerCase();

          if (searchText.includes(query.trim().toLowerCase())) {
            items.push(toLegacyProduct(doc.id, data));
          }
        });
        setProducts(items);
      } catch (err) {
        console.error(err);
        setError(true);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [query, retryKey]);

  useEffect(() => {

  if (!query.trim()) {
    setSuggestions([]);
    return;
  }

  const q = query.toLowerCase();

  const list = products
    .filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)
    )
    .slice(0, 6);

  setSuggestions(list);

}, [query, products]);

  useEffect(() => {
    let items = [...products];
    items = items.filter(
  (item) =>
    Number(item.price) >= minPrice &&
    Number(item.price) <= maxPrice
);

if (inStockOnly) {
  items = items.filter(
    (item) => item.stock > 0
  );
}

    if (category) {
      const node = findNodeByName(category);
      items = items.filter((item) =>
        node
          ? isTopLevelCategory(node)
            ? item.categoryId === node.id
            : item.subCategoryId === node.id || item.leafCategoryId === node.id
          : false
      );
    }
    if (minimumRating > 0) {
  items = items.filter(
    (item) => Number(item.rating || 0) >= minimumRating
  );
}
if (minimumDiscount > 0) {
  items = items.filter((item) => {

    const mrp = Number(item.mrp || 0);
    const price = Number(item.price || 0);

    if (mrp <= 0) return false;

    const discount =
      ((mrp - price) / mrp) * 100;

    return discount >= minimumDiscount;

  });
}
    if (stockOnly) {
      items = items.filter((item) => item.stock > 0);
    }
    if (sortBy === "priceLow") items.sort((a, b) => a.price - b.price);
    if (sortBy === "priceHigh") items.sort((a, b) => b.price - a.price);
    if (sortBy === "name") { items.sort((a, b) => a.name.localeCompare(b.name));}
    if (sort === "stock") items.sort((a, b) => b.stock - a.stock);

    setFiltered(items);
  }, [products, category, stockOnly, sort, minPrice, maxPrice, inStockOnly, sortBy, minimumRating,minimumDiscount,]);
  

  const clearFilters = () => {
    setSort("");
    setStockOnly(false);
    setCategory("");
     setMinimumRating(0);
      setMinimumDiscount(0);
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

     <ProductFilters
  minPrice={minPrice}
  maxPrice={maxPrice}
  inStockOnly={inStockOnly}
  sortBy={sortBy}
  setMinPrice={setMinPrice}
  setMaxPrice={setMaxPrice}
  setInStockOnly={setInStockOnly}
  setSortBy={setSortBy}
/>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
  value={minimumRating}
  onChange={(e) =>
    setMinimumRating(Number(e.target.value))
  }
  className="border rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500"
>
  <option value={0}>All Ratings</option>
  <option value={4}>⭐⭐⭐⭐ & Above</option>
  <option value={3}>⭐⭐⭐ & Above</option>
  <option value={2}>⭐⭐ & Above</option>
  <option value={1}>⭐ & Above</option>
</select>
<select
  value={minimumDiscount}
  onChange={(e) =>
    setMinimumDiscount(Number(e.target.value))
  }
  className="border rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500"
>
  <option value={0}>All Discounts</option>
  <option value={10}>🏷️ 10% & Above</option>
  <option value={25}>🏷️ 25% & Above</option>
  <option value={50}>🏷️ 50% & Above</option>
  <option value={70}>🏷️ 70% & Above</option>
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
    

        {/* RESULTS */}
        {loading ? (
          <div className="text-center py-20 text-gray-500">
            Loading products…
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-12 text-center">
            <h2 className="text-red-600 font-bold text-2xl mb-2">
              Unable to load search results.
            </h2>
            <p className="text-red-500 text-sm mb-6">Please try again.</p>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-semibold transition"
            >
              Retry
            </button>
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
</Link>

<div className="mt-8">
  <p className="font-bold mb-4">
    Popular Searches
  </p>

  <div className="flex justify-center gap-3 flex-wrap">

  <Link href="/search?q=Men Fashion">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-green-50 transition cursor-pointer">
      👔 Men Fashion
    </span>
  </Link>

  <Link href="/search?q=Women Fashion">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-pink-50 transition cursor-pointer">
      👗 Women Fashion
    </span>
  </Link>

  <Link href="/search?q=Kids Fashion">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-yellow-50 transition cursor-pointer">
      🧒 Kids Fashion
    </span>
  </Link>

  <Link href="/search?q=Mobiles">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-blue-50 transition cursor-pointer">
      📱 Mobiles
    </span>
  </Link>

  <Link href="/search?q=Electronics">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-indigo-50 transition cursor-pointer">
      💻 Electronics
    </span>
  </Link>

  <Link href="/search?q=Appliances">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-cyan-50 transition cursor-pointer">
      🏠 Appliances
    </span>
  </Link>

  <Link href="/search?q=Furniture">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-orange-50 transition cursor-pointer">
      🛋️ Furniture
    </span>
  </Link>

  <Link href="/search?q=Beauty">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-rose-50 transition cursor-pointer">
      💄 Beauty
    </span>
  </Link>

  <Link href="/search?q=Grocery">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-lime-50 transition cursor-pointer">
      🛒 Grocery
    </span>
  </Link>

  <Link href="/search?q=Books">
    <span className="bg-white shadow rounded-full px-4 py-2 hover:bg-purple-50 transition cursor-pointer">
      📚 Books
    </span>
  </Link>

</div>
</div>

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
                       ★★★★★ <span className="text-xs text-gray-500">({Number(product.rating || 0).toFixed(1)})</span></div>

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
                      <button
  onClick={(e) => {
    e.preventDefault();
    setQuickViewProduct(product);
    setShowQuickView(true);
  }}
  className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl font-medium transition"
>
  👁 Quick View
</button>
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
{showQuickView && quickViewProduct && (
  <div
    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    onClick={() => setShowQuickView(false)}
  >
    <div
      className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid md:grid-cols-2">

        <div className="bg-gray-100">
          <img
            src={quickViewProduct.image || "/no-image.png"}
            alt={quickViewProduct.name}
            className="w-full h-80 object-cover"
          />
        </div>

        <div className="p-6">

          <h2 className="text-2xl font-bold">
            {quickViewProduct.name}
          </h2>

          <p className="text-yellow-500 mt-2">
            ⭐ {Number(quickViewProduct.rating || 0).toFixed(1)}
          </p>

         <div className="mt-4">

  <div className="flex items-center gap-3 flex-wrap">

    <span className="text-3xl font-bold text-green-600">
      ₹{Number(quickViewProduct.price).toLocaleString("en-IN")}
    </span>

    {Number(quickViewProduct.mrp) > Number(quickViewProduct.price) && (
      <>
        <span className="text-gray-400 line-through text-lg">
          ₹{Number(quickViewProduct.mrp).toLocaleString("en-IN")}
        </span>

        <span className="bg-red-500 text-white px-2 py-1 rounded-full text-sm font-bold">
          {Math.round(
            ((quickViewProduct.mrp - quickViewProduct.price) /
              quickViewProduct.mrp) *
              100
          )}
          % OFF
        </span>
      </>
    )}

  </div>

</div>

          <p className="mt-4 text-gray-600 line-clamp-4">
            {quickViewProduct.description}
          </p>
          <div className="mt-4 space-y-2">

  <p
    className={`font-semibold ${
      quickViewProduct.stock > 0
        ? "text-green-600"
        : "text-red-600"
    }`}
  >
    {quickViewProduct.stock > 0
      ? `✅ In Stock (${quickViewProduct.stock} available)`
      : "❌ Out of Stock"}
  </p>

  <p className="text-gray-700">
    🏪 Seller:{" "}
    <span className="font-semibold">
      {quickViewProduct.vendorName || "YOMICO Seller"}
    </span>
  </p>

  <p className="text-green-600 font-medium">
    🚚 Free Delivery
  </p>

  <p className="text-blue-600">
    🔄 7 Days Easy Return
  </p>

</div>
<div className="mt-6">

  <p className="font-semibold mb-2">
    Quantity
  </p>

  <div className="flex items-center gap-3">

    <button
      onClick={() =>
        setQuickQty((q) => Math.max(1, q - 1))
      }
      className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 text-xl"
    >
      −
    </button>

    <span className="text-xl font-bold w-10 text-center">
      {quickQty}
    </span>

    <button
      onClick={() =>
        setQuickQty((q) =>
          Math.min(
            quickViewProduct.stock || 1,
            q + 1
          )
        )
      }
      className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 text-xl"
    >
      +
    </button>

  </div>

</div>
{quickViewProduct.sizes &&
  quickViewProduct.sizes.filter((s) => s?.trim()).length > 0 && (
    <div className="mt-6">

      <p className="font-semibold mb-2">
        Select Size
      </p>

      <div className="flex flex-wrap gap-2">

        {quickViewProduct.sizes
          .filter((s) => s?.trim())
          .map((size) => (

            <button
              key={size}
              onClick={() => setQuickSize(size)}
              className={`px-4 py-2 rounded-lg border transition ${
                quickSize === size
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              {size}
            </button>

          ))}

      </div>

    </div>
)}
{quickViewProduct.colors &&
  quickViewProduct.colors.filter((c) => c?.trim()).length > 0 && (
    <div className="mt-6">

      <p className="font-semibold mb-2">
        Select Color
      </p>

      <div className="flex flex-wrap gap-2">

        {quickViewProduct.colors
          .filter((c) => c?.trim())
          .map((color) => (

            <button
              key={color}
              onClick={() => setQuickColor(color)}
              className={`px-4 py-2 rounded-lg border transition ${
                quickColor === color
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              {color}
            </button>

          ))}

      </div>

    </div>
)}

          <button
  onClick={() => {

    if (!quickViewProduct) return;

    if (
      quickViewProduct.sizes?.filter((s) => s?.trim()).length > 0 &&
      !quickSize
    ) {
      alert("Please select a size");
      return;
    }

    if (
      quickViewProduct.colors?.filter((c) => c?.trim()).length > 0 &&
      !quickColor
    ) {
      alert("Please select a color");
      return;
    }

    const success = addToCartHelper(quickViewProduct, {
      qty: quickQty,
      size: quickSize,
      color: quickColor,
    });

    if (success) {
      alert("Added To Cart");
      setShowQuickView(false);
    }

  }}
  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold"
>
  🛒 Add to Cart
</button>
            <button
              onClick={() => {
                if (!quickViewProduct) return;
                const wishlist = JSON.parse(
                  localStorage.getItem("wishlist") || "[]"
                );
                if (wishlist.find((item) => item.id === quickViewProduct.id)) {
                  alert("Already In Wishlist");
                  return;
                }
                wishlist.push({
                  id: quickViewProduct.id,
                  name: quickViewProduct.name,
                  price: quickViewProduct.price,
                  image: quickViewProduct.image,
                  stock: quickViewProduct.stock,
                  vendorId: quickViewProduct.vendorId,
                });
                localStorage.setItem("wishlist", JSON.stringify(wishlist));
                window.dispatchEvent(new Event("wishlistUpdated"));
                alert("Added To Wishlist");
              }}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-semibold"
            >
              ❤️ Wishlist
            </button>

          </div>

          <button
            onClick={() => setShowQuickView(false)}
            className="mt-4 w-full border border-gray-300 py-3 rounded-xl hover:bg-gray-100"
          >
            Close
          </button>

        </div>

      </div>
    </div>

)}
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
