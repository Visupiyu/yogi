"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

async function fetchTrendingProducts() {
  const q = query(
    collection(db, "products"),
    orderBy("views", "desc"),
    limit(8)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));
}

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
    data: products,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["trending-products"],
    queryFn: fetchTrendingProducts,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  return (
    <section className="max-w-7xl mx-auto px-2 py-5">
      {/* HEADER */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
            🔥 Trending Products
          </h2>

          <p className="text-gray-500 mt-1 text-sm md:text-base">
            Discover what customers are exploring today
          </p>
        </div>

        <Link
          href="/store"
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
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">
          <h2 className="text-red-600 font-bold">
            Unable to load Trending Products.
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
        products &&
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
                  {product.name ||
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

      {/* EMPTY */}
      {!isLoading &&
        !error &&
        (!products || products.length === 0) && (
          <div className="text-center py-10 bg-gray-50 rounded-3xl">
            <div className="text-4xl mb-2">🔥</div>

            <h3 className="font-semibold text-gray-800">
              No Trending Products Yet
            </h3>

            <p className="text-sm text-gray-500 mt-1">
              Products will appear here as customers explore them.
            </p>
          </div>
        )}

      {/* MOBILE VIEW ALL */}
      <div className="mt-3 md:hidden text-right">
        <Link
          href="/store"
          className="text-blue-700 font-semibold"
        >
          View All →
        </Link>
      </div>
    </section>
  );
}