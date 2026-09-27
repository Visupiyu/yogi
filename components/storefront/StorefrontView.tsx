"use client";

import { useMemo, useState } from "react";
import ProductCard from "@/components/ProductCard";
import type { PublicStorefront } from "@/lib/storefront/publicStorefront";

// The customer-facing storefront, rendered from the whitelisted public shape
// (lib/storefront/publicStorefront.ts) — used by the public route
// (app/store/[id]) and, with `preview`, by the seller's own store page.
// It holds no data access of its own: search, category and sort work on the
// already-public product list it is given.

type Sort = "newest" | "priceLow" | "priceHigh" | "rating";

function Stars({ value }: { value: number }) {
  return <span aria-label={`${value} out of 5`}>{"★".repeat(Math.round(value))}{"☆".repeat(5 - Math.round(value))}</span>;
}

export default function StorefrontView({
  storefront,
  preview = false,
}: {
  storefront: PublicStorefront;
  preview?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<Sort>("newest");
  const [inStockOnly, setInStockOnly] = useState(false);

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = storefront.products.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)) &&
        (category === "All" || p.categoryId === category) &&
        (!inStockOnly || p.inStock)
    );
    const sorted = [...list];
    if (sort === "priceLow") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "priceHigh") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "rating") sorted.sort((a, b) => b.rating - a.rating);
    return sorted;
  }, [storefront.products, search, category, sort, inStockOnly]);

  const hasProducts = storefront.products.length > 0;

  return (
    <div className="bg-gray-50">
      {preview && (
        <div className="bg-amber-100 text-amber-800 text-sm font-semibold text-center py-2 px-4">
          Preview — this is how customers see your store.
        </div>
      )}

      {/* Banner */}
      <div className="relative h-40 sm:h-56 md:h-64 w-full bg-gradient-to-r from-green-600 to-blue-600">
        {storefront.storeBanner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={storefront.storeBanner} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="-mt-12 sm:-mt-16 relative bg-white rounded-3xl shadow p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gray-100 border-4 border-white shadow overflow-hidden shrink-0">
            {storefront.storeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storefront.storeLogo} alt={`${storefront.storeName} logo`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">
                {storefront.storeName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold break-words">{storefront.storeName}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
              {storefront.rating !== null ? (
                <span className="text-amber-500">
                  <Stars value={storefront.rating} /> <span className="text-gray-600">{storefront.rating.toFixed(1)} seller rating</span>
                </span>
              ) : storefront.reviewSummary ? (
                <span className="text-amber-500">
                  <Stars value={storefront.reviewSummary.average} />{" "}
                  <span className="text-gray-600">
                    {storefront.reviewSummary.average.toFixed(1)} from {storefront.reviewSummary.count} product review
                    {storefront.reviewSummary.count === 1 ? "" : "s"}
                  </span>
                </span>
              ) : (
                <span>New seller</span>
              )}
              <span>
                {storefront.products.length} product{storefront.products.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        {/* About */}
        {storefront.about && (
          <div className="bg-white rounded-3xl shadow p-5 sm:p-6 mt-6">
            <h2 className="text-lg font-bold mb-2">About the store</h2>
            <p className="text-gray-700 whitespace-pre-line break-words">{storefront.about}</p>
          </div>
        )}

        {/* Products */}
        <div className="mt-6 pb-12">
          {hasProducts && (
            <div className="bg-white rounded-3xl shadow p-4 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this store..."
                className="border rounded-xl px-4 py-3 md:col-span-2"
              />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="border rounded-xl px-4 py-3">
                <option value="All">All categories</option>
                {storefront.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="border rounded-xl px-4 py-3">
                <option value="newest">Newest</option>
                <option value="priceLow">Price: low to high</option>
                <option value="priceHigh">Price: high to low</option>
                <option value="rating">Top rated</option>
              </select>
              <label className="flex items-center gap-2 text-sm md:col-span-4">
                <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
                In stock only
              </label>
            </div>
          )}

          {!hasProducts ? (
            <div className="bg-white rounded-3xl shadow p-10 text-center text-gray-500">
              This store has no products available right now.
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-3xl shadow p-10 text-center text-gray-500">
              No products match your search.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products.map((p) => (
                <ProductCard key={p.id} id={p.id} name={p.name} price={p.price} image={p.image} stock={p.stock} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
