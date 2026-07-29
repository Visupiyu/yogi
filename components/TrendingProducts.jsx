"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "./ProductCard";
import { motion } from "framer-motion";

async function fetchTrendingProducts() {
  const q = query(
    collection(db, "products"),
    orderBy("views", "desc"),
    limit(8)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function ProductSkeleton() {
  return (
    <div className="bg-white rounded-3xl shadow-sm p-4 animate-pulse">
      <div className="h-56 bg-gray-200 rounded-xl mb-3" />
      <div className="h-4 bg-gray-200 rounded mb-2" />
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="h-6 bg-gray-200 rounded w-1/3" />
    </div>
  );
}

export default function TrendingProducts() {
  const { data: products, isLoading, error } = useQuery({
    queryKey: ["trending-products"],
    queryFn: fetchTrendingProducts,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">

  <div>

    <span className="inline-block bg-red-100 text-red-600 px-4 py-1 rounded-full text-sm font-semibold mb-3">
      🔥 TRENDING NOW
    </span>

    <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
      Trending Products
    </h2>

    <p className="text-gray-600 mt-2">
      Discover the hottest products customers are buying today.
    </p>

  </div>

  <a
    href="/search"
    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold transition"
  >
    View All →
  </a>

</div>

      {error && <div className="text-center py-10 bg-red-50 rounded-2xl border border-red-200">

  <p className="text-red-600 font-semibold">
    Failed to load trending products.
  </p>

</div>}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
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
  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
>
  {products.map((product) => (
    <ProductCard
      key={product.id}
      id={product.id}
      name={product.name}
      price={product.price}
      image={product.image}
      stock={product.stock}
    />
  ))}
</motion.div>
      ) : (
        !error && (
         <div className="text-center py-16">

  <div className="text-6xl mb-4">
    📦
  </div>

  <h3 className="text-2xl font-bold text-gray-800">
    No Trending Products Yet
  </h3>

  <p className="text-gray-500 mt-2">
    Check back soon for the latest arrivals.
  </p>

</div>
        )
      )}
    </section>
  );
}
