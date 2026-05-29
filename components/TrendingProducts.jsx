"use client";

import { useQuery } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import ProductCard from "./ProductCard";

async function fetchTrendingProducts() {
  const q = query(
    collection(db, "products"),
    orderBy("createdAt", "desc"),
    limit(8)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

function ProductSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-md p-4 animate-pulse">
      <div className="h-40 bg-gray-200 rounded-xl mb-3"></div>
      <div className="h-4 bg-gray-200 rounded mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
      <div className="h-6 bg-gray-200 rounded w-1/3"></div>
    </div>
  );
}

export default function TrendingProducts() {
  const {
    data: products,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trending-products"],
    queryFn: fetchTrendingProducts,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="max-w-7xl mx-auto px-4 py-4">

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-3xl font-bold">
          🔥 Trending Products
        </h2>
      </div>

      {error && (
        <p className="text-red-500">
          Failed to load products
        </p>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, index) => (
            <ProductSkeleton key={index} />
          ))}
        </div>
      )}

      {!isLoading && products?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {products.map((product) => (

            <ProductCard
              key={product.id}
              product={product}
            />

          ))}

        </div>
      )}

    </section>
  );
}