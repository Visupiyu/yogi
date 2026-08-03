"use client";

import Link from "next/link";
import Image from "next/image";
import { useQueries } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

const collections = [
  {
    title: "Electronics",
    category: "Electronics",
    link: "/category/Electronics",
  },
  {
    title: "Grocery",
    category: "Grocery",
    link: "/category/Grocery",
  },
  {
    title: "Fashion",
    category: "Fashion",
    link: "/category/Fashion",
  },
  {
    title: "Beauty",
    category: "Beauty",
    link: "/category/Beauty",
  },
];

async function getCategoryProducts(category) {

  const q = query(
    collection(db, "products"),
    where("category", "==", category),
    limit(4)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

}

export default function RecommendedProducts() {

  const queries = useQueries({

    queries: collections.map((item) => ({

      queryKey: ["recommended", item.category],

      queryFn: () => getCategoryProducts(item.category),

      staleTime: 1000 * 60 * 5,

    })),

  });

  const loading = queries.some((q) => q.isLoading);

  const error = queries.some((q) => q.error);

  if (loading) {

    return (

      <section className="max-w-7xl mx-auto px-4 py-8">

        <div className="animate-pulse">

          <div className="h-8 w-60 bg-gray-200 rounded mb-6"/>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

            {[...Array(4)].map((_,index)=>(

              <div
                key={index}
                className="bg-white rounded-3xl shadow p-5"
              >

                <div className="grid grid-cols-2 gap-3">

                  {[...Array(4)].map((_,i)=>(

                    <div
                      key={i}
                      className="h-28 rounded-xl bg-gray-200"
                    />

                  ))}

                </div>

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

            Unable to load recommendations.

          </h2>

        </div>

      </section>

    );

  }

  return (
    <section className="max-w-7xl mx-auto px-2 py-4">

  <h2 className="text-2xl md:text-3xl font-bold mb-3">
    ❤️ Recommended For You
  </h2>

  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

    {collections.map((item, index) => {

      const products = queries[index].data || [];

      return (

        <div
          key={item.category}
          className="bg-white rounded-3xl shadow-lg border border-gray-100 p-3 hover:shadow-xl transition"
        >

          <div className="flex items-center justify-between mb-2">

            <h3 className="font-bold text-lg">
              {item.title}
            </h3>

          </div>

          <div className="grid grid-cols-2 gap-1">

            {products.map((product) => (

              <Link
                key={product.id}
                href={`/product/${product.id}`}
              >

                <div className="group">

                  <div className="relative h-48 rounded-xl overflow-hidden bg-gray-50">

                    <Image
                      src={product.image || "/placeholder.png"}
                      alt={product.name}
                      fill
                      className="
                      object-contain
                      p-1
                      group-hover:scale-105
                      transition
                      "
                    />

                  </div>

                  <p
                    className="
                    text-xs
                    mt-2
                    line-clamp-2
                    text-gray-700
                    group-hover:text-blue-600
                    "
                  >
                    {product.name}
                  </p>

                </div>

              </Link>

            ))}

          </div>

          <Link
            href={item.link}
            className="
            inline-block
            mt-1
            text-blue-600
            font-semibold
            hover:text-orange-500
            "
          >
            See More →
          </Link>

        </div>

      );

    })}

  </div>

</section>
  );
}