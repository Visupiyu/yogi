"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "./ProductCard";
import { motion } from "framer-motion";

async function fetchNewArrivals() {
  const q = query(
    collection(db, "products"),
    orderBy("createdAt", "desc"),
    limit(12)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));
}

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
  const { data: products, isLoading, error } = useQuery({
    queryKey: ["new-arrivals"],
queryFn: fetchNewArrivals,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="max-w-7xl mx-auto px-2 py-2">
      <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-2">

  <div>

     <h2 className="text-2xl md:text-2xl font-bold text-gray-900">
     🆕 New Arrivals
    </h2>

    </div>

</div>

      {error && <div className="text-center py-10 bg-red-50 rounded-2xl border border-red-200">

  <p className="text-red-600 font-semibold">
   Failed to load new arrivals.
  </p>

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
    name={product.title || product.name || "Product"}
    price={product.sellingPrice ?? product.price ?? 0}
    image={
      product.thumbnail ||
      product.images?.[0] ||
      product.image ||
      ""
    }
    stock={product.stock ?? 0}
  />
))}
    
        </motion.div>
      ) : (
        !error && (
          <div className="text-center py-10 md:py-16">

  <div className="text-6xl mb-4">
    🆕
  </div>

  <h3 className="text-2xl font-bold text-gray-800">
   No New Arrivals Yet
  </h3>

  <p className="text-gray-500 mt-2">
    Newly added products will appear here automatically.
  </p>

</div>
        )
      )}
    </section>
  );
}
