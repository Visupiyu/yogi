"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BEST_SELLERS_QUERY_KEY,
  MIN_PRODUCTS_TO_SHOW_SECTION,
  fetchBestSellers,
} from "@/lib/storefront/homepageMerchandising";
import ProductCard from "./ProductCard";
import { motion } from "framer-motion";

// Ranked by `sales`, the real, server-maintained purchase counter. Only a
// visible, in-stock product sold at least twice qualifies (at most 8), and the
// whole row is hidden when fewer than 4 qualify — rules and thresholds live in
// lib/storefront/homepageMerchandising.ts. The same query (and cache entry) is
// read by TrendingProducts so it never repeats a product shown here.

function ProductSkeleton() {
  return (
    <div className="bg-pink-200 rounded-3xl shadow-lg p-4 animate-pulse">
      <div className="h-56 bg-pink-100 rounded-xl mb-3" />
      <div className="h-4 bg-pink-100 rounded mb-2" />
      <div className="h-4 bg-pink-100 rounded w-2/3 mb-2" />
      <div className="h-6 bg-pink-100 rounded w-1/3" />
    </div>
  );
}

export default function BestSellers() {
  const { data: products, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: BEST_SELLERS_QUERY_KEY,
    queryFn: fetchBestSellers,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  // Not enough genuine best sellers yet: show nothing rather than a thin or
  // padded row.
  if (!isLoading && !error && (!products || products.length < MIN_PRODUCTS_TO_SHOW_SECTION)) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-2 py-2">
      <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-2">

  <div>

     <h2 className="text-2xl md:text-2xl font-bold text-gray-900">
     🏆 Best Sellers
    </h2>

    </div>

</div>

      {error && <div className="text-center py-10 bg-red-50 rounded-2xl border border-red-200">

  <p className="text-red-600 font-semibold">
   Failed to load best sellers.
  </p>

  <button
    onClick={() => refetch()}
    disabled={isFetching}
    className="mt-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-semibold transition"
  >
    {isFetching ? "Retrying..." : "Retry"}
  </button>

</div>}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {[...Array(8)].map((_, index) => (
            <ProductSkeleton key={index} />
          ))}
        </div>
      ) : products && products.length > 0 ? (
        <motion.div
  initial={{ opacity: 0, y: 30 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
  viewport={{ once: true }}
  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
>
 {products.map((product) => (
  <ProductCard
    key={product.id}
    id={product.id}
    name={product.shortTitle || product.title || product.name || "Product"}
    price={product.sellingPrice ?? product.price ?? 0}
    image={
      product.thumbnail ||
      product.images?.[0] ||
      product.image ||
      ""
    }
    stock={product.stock ?? 0}
    vendorId={product.vendorId}
    mrp={product.mrp}
  />
))}

        </motion.div>
      ) : null}
    </section>
  );
}
