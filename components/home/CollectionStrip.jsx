"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

async function getProducts(category) {

  const q = query(
    collection(db, "products"),
    where("category", "==", category),
    limit(12)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

export default function CollectionStrip({

  title = "⚡ Electronics Collection",

  category = "Electronics",

  viewAll = "/category/Electronics",

}) {

  const {

    data: products = [],

    isLoading,

    error,

  } = useQuery({

    queryKey: ["collection-strip", category],

    queryFn: () => getProducts(category),

    staleTime: 1000 * 60 * 5,

  });

  if (isLoading) {

    return (

      <section className="max-w-7xl mx-auto px-4 py-8">

        <div className="bg-white rounded-3xl shadow border border-gray-100 p-6">

          <div className="h-8 w-72 bg-gray-200 rounded mb-6 animate-pulse"/>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">

            {[...Array(12)].map((_,index)=>(

              <div
                key={index}
                className="rounded-2xl border border-gray-100 p-3 animate-pulse"
              >

                <div className="h-36 bg-gray-200 rounded-xl"/>

                <div className="h-4 bg-gray-200 rounded mt-3"/>

              </div>

            ))}

          </div>

        </div>

      </section>

    );

  }

  if (error) {

    return (

      <section className="max-w-7xl mx-auto px-4 py-8">

        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">

          <h2 className="font-bold text-red-600">

            Unable to load collection.

          </h2>

        </div>

      </section>

    );

  }

  return (
    <section className="max-w-7xl mx-auto px-4 py-8">

  <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">

    {/* Header */}

    <div className="flex items-center justify-between mb-6">

      <div>

        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          {title}
        </h2>

        <p className="text-gray-500 mt-1">
          Explore our featured collection
        </p>

      </div>

      <Link
        href={viewAll}
        className="hidden md:block text-blue-700 font-semibold hover:text-orange-500 transition"
      >
        View All →
      </Link>

    </div>

    {/* Products */}

    <motion.div
      initial={{ opacity: 0, y: 25 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
      className="
        grid
        grid-cols-2
        sm:grid-cols-3
        md:grid-cols-4
        xl:grid-cols-6
        gap-4
      "
    >

      {products.map((product) => (

        <Link
          key={product.id}
          href={`/product/${product.id}`}
          className="
            group
            rounded-2xl
            border
            border-gray-100
            p-3
            hover:shadow-xl
            transition-all
            duration-300
            hover:-translate-y-1
          "
        >

          <div className="relative h-40 bg-gray-50 rounded-xl overflow-hidden">

            <Image
              src={product.image || "/placeholder.png"}
              alt={product.name}
              fill
              className="
                object-contain
                p-2
                group-hover:scale-105
                transition-transform
                duration-300
              "
            />

          </div>

          <h3
            className="
              mt-3
              text-sm
              font-medium
              text-gray-800
              leading-5
              line-clamp-2
              h-[40px]
              group-hover:text-blue-600
              transition-colors
            "
          >
            {product.name}
          </h3>

        </Link>

      ))}

    </motion.div>

    <div className="mt-6 text-center md:hidden">

      <Link
        href={viewAll}
        className="text-blue-700 font-semibold"
      >
        View All →
      </Link>

    </div>

  </div>
  </section>
  );
}