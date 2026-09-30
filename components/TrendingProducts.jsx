"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import {
  BEST_SELLERS_QUERY_KEY,
  MIN_PRODUCTS_TO_SHOW_SECTION,
  displayedBestSellerIds,
  fetchBestSellers,
  fetchTrendingCandidates,
  selectTrending,
} from "@/lib/storefront/homepageMerchandising";

// "Popular right now": the most-viewed visible, in-stock products (views >= 3),
// minus anything the Best Sellers row is already showing, at most 8. `views`
// is an all-time count of signed-in product-page visits, so the copy makes no
// claim about today. Hidden when fewer than 4 qualify. Rules live in
// lib/storefront/homepageMerchandising.ts.

function ProductSkeleton() {
  return (
    <div className="min-w-[180px] sm:min-w-[210px] bg-pink-50 rounded-3xl p-4 shadow animate-pulse flex-shrink-0">
      <div className="h-36 bg-pink-100 rounded-2xl" />
      <div className="h-4 bg-pink-100 rounded mt-4" />
      <div className="h-4 bg-pink-100 rounded mt-2 w-2/3" />
    </div>
  );
}

export default function TrendingProducts() {
  const {
    data: candidates,
    isLoading: candidatesLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["trending-candidates"],
    queryFn: fetchTrendingCandidates,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  // Same query key and function as BestSellers, so this reads the shared
  // cache entry rather than fetching twice. If it fails, nothing is shown
  // in Best Sellers, so nothing needs excluding here.
  const { data: bestSellers, isLoading: bestSellersLoading } = useQuery({
    queryKey: BEST_SELLERS_QUERY_KEY,
    queryFn: fetchBestSellers,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  const isLoading = candidatesLoading || bestSellersLoading;

  const products = useMemo(
    () => selectTrending(candidates || [], displayedBestSellerIds(bestSellers)),
    [candidates, bestSellers]
  );

  if (!isLoading && !error && products.length < MIN_PRODUCTS_TO_SHOW_SECTION) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-2 py-5">
      {/* HEADER */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
            🔥 Popular right now
          </h2>

          <p className="text-gray-500 mt-1 text-sm md:text-base">
            Most-viewed products on YOMICO
          </p>
        </div>

        <Link
          href="/search"
          className="
            hidden
            md:inline-flex
            text-blue-700
            font-semibold
            hover:text-orange-500
            transition
          "
        >
          View All →
        </Link>
      </div>

      {/* LOADING */}
      {isLoading && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3">
          {[...Array(8)].map((_, index) => (
            <ProductSkeleton key={index} />
          ))}
        </div>
      )}

      {/* ERROR */}
      {!isLoading && error && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">
          <h2 className="text-red-600 font-bold">
            Unable to load popular products.
          </h2>

          <p className="text-red-500 text-sm mt-2">
            Please try again later.
          </p>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-semibold transition"
          >
            {isFetching ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}

      {/* PRODUCTS */}
      {!isLoading &&
        !error &&
        products.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="
              flex
              gap-2
              overflow-x-auto
              scrollbar-hide
              pb-3
            "
          >
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/product/${product.id}`}
                className="
                  min-w-[180px]
                  sm:min-w-[210px]
                  bg-gradient-to-b
                  from-pink-50
                  to-white
                  rounded-3xl
                  shadow
                  hover:shadow-xl
                  transition-all
                  duration-300
                  hover:-translate-y-2
                  p-4
                  flex-shrink-0
                "
              >
                {/* IMAGE */}
                <div
                  className="
                    relative
                    w-full
                    h-36
                    overflow-hidden
                    rounded-2xl
                    bg-pink-50
                  "
                >
                  <Image
                    src={
                      product.thumbnail ||
                      product.images?.[0] ||
                      product.image ||
                      "/placeholder.png"
                    }
                    alt={
                      product.shortTitle ||
                      product.name ||
                      product.title ||
                      "Product"
                    }
                    fill
                    sizes="210px"
                    className="
                      object-contain
                      hover:scale-110
                      transition-all
                      duration-500
                    "
                  />
                </div>

                {/* NAME */}
                <h3
                  className="
                    mt-3
                    text-sm
                    font-medium
                    text-gray-800
                    leading-5
                    line-clamp-2
                    min-h-[40px]
                    hover:text-blue-600
                    transition-colors
                  "
                >
                  {product.shortTitle ||
                    product.name ||
                    product.title ||
                    "Product"}
                </h3>

                {/* PRICE */}
                <p className="mt-2 font-bold text-gray-900">
                  ₹
                  {product.sellingPrice ??
                    product.price ??
                    0}
                </p>

                {/* VIEWS */}
                <p className="text-xs text-gray-500 mt-1">
                  👁️ {product.views ?? 0} views
                </p>
              </Link>
            ))}
          </motion.div>
        )}

      {/* MOBILE VIEW ALL */}
      <div className="mt-3 md:hidden text-right">
        <Link
          href="/search"
          className="text-blue-700 font-semibold"
        >
          View All →
        </Link>
      </div>
    </section>
  );
}
