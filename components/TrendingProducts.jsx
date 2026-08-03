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

    id: doc.id,

    ...doc.data(),

  }));

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

  if (isLoading) {

    return (

      <section className="max-w-7xl mx-auto px-2 py-4">

        <div className="animate-pulse">

          <div className="h-8 w-60 bg-gray-200 rounded mb-3"/>

          <div className="flex gap-2 overflow-hidden">

            {[...Array(8)].map((_,index)=>(

              <div

                key={index}

                className="

                min-w-[180px]

                bg-white

                rounded-3xl

                p-4

                shadow

                "

              >

                <div className="h-44 bg-gray-200 rounded-2xl"/>

                <div className="h-4 bg-gray-200 rounded mt-4"/>

              </div>

            ))}

          </div>

        </div>

      </section>

    );

  }

  if (error) {

    return (

      <section className="max-w-7xl mx-auto px-3 py-6">

        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center">

          <h2 className="text-red-600 font-bold">

            Unable to load Trending Products.

          </h2>

        </div>

      </section>

    );

  }

  return (
    <section className="max-w-7xl mx-auto px-3 py-6">

  {/* Header */}

  <div className="flex items-center justify-between mb-4">

    <div>

      <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
        🔥 Trending Products
      </h2>

      <p className="text-gray-500 mt-1">
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

  {/* Products */}

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

    {products?.map((product) => (

      <Link

        key={product.id}

        href={`/product/${product.id}`}

        className="
        min-w-[180px]
        sm:min-w-[210px]
        bg-white
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

        <div
          className="
          relative
          w-full
          h-36
          overflow-hidden
          rounded-2xl
          bg-gray-50
          "
        >

         <Image
  src={product.image || "/placeholder.png"}

            alt={product.name}

            fill

            className="
            object-contain
            hover:scale-110
            transition-all
            duration-500
            "

          />

        </div>

       <h3
  className="
    mt-1
    text-sm
    font-medium
    text-gray-800
    leading-5
    line-clamp-2
    h-[28px]
    hover:text-blue-600
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

      href="/store"

      className="
      text-blue-700
      font-semibold
      "

    >
      View All →
    </Link>

  </div>
  </section>
  );
}