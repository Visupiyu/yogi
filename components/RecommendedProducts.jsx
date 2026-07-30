"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "./ProductCard";
import { motion } from "framer-motion";

export default function RecommendedProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecommendations = async () => {
      try {
        const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
       const recent = JSON.parse(
  localStorage.getItem("recentlyViewed") || "[]"
);
        const preferredIds = [...wishlist, ...recent].map((item) => item.id);

        const snapshot = await getDocs(collection(db, "products"));
        const items = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (!preferredIds.includes(doc.id)) {
            items.push({
              id: doc.id,
              name: data.name || "",
              price: Number(data.price || 0),
              image: data.image || "",
              stock: Number(data.stock || 0),
            });
          }
        });

        setProducts(items.slice(0, 8));
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadRecommendations();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">

  <div>

    <span className="inline-block bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-semibold mb-3">
      🎯 JUST FOR YOU
    </span>

    <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
      Recommended For You
    </h2>

    <p className="text-gray-600 mt-2">
      Handpicked products based on your recent activity.
    </p>

  </div>

  <a
    href="/search"
    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition"
  >
    Discover More →
  </a>

</div>
    );
  }

 if (products.length === 0) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-10 md:py-16 text-center">

      <div className="text-6xl mb-4">
        🎯
      </div>

      <h3 className="text-2xl font-bold text-gray-800">
        Recommendations Coming Soon
      </h3>

      <p className="text-gray-500 mt-2">
        Browse more products to receive personalized recommendations.
      </p>

    </section>
  );
}

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">

  <div>

    <span className="inline-block bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-semibold mb-3">
      🎯 JUST FOR YOU
    </span>

    <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
      Recommended For You
    </h2>

    <p className="text-gray-600 mt-2">
      Handpicked products based on your recent activity.
    </p>

  </div>

  <a
    href="/search"
    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition"
  >
    Discover More →
  </a>

</div>

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
    </section>
  );
}
