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

async function fetchBestSellers() {

  const q = query(
    collection(db, "products"),
    orderBy("sales", "desc"),
    limit(12)
  );

  const snapshot =
    await getDocs(q);

  return snapshot.docs.map(
    (doc) => ({
      id: doc.id,
      ...doc.data(),
    })
  );

}

function ProductSkeleton() {

  return (

    <div className="
      bg-white
      rounded-2xl
      shadow-md
      p-4
      animate-pulse
    ">

      <div className="
        h-40
        bg-gray-200
        rounded-xl
        mb-*
      " />

      <div className="
        h-4
        bg-gray-200
        rounded
        mb-*
      " />

      <div className="
        h-4
        bg-gray-200
        rounded
        w-2/3
        mb-*
      " />

      <div className="
        h-6
        bg-gray-200
        rounded
        w-1/3
      " />

    </div>

  );

}

export default function BestSellers() {

  const {
    data: products,
    isLoading,
    error,
  } = useQuery({

    queryKey: ["best-sellers"],

    queryFn: fetchBestSellers,

    staleTime: 1000 * 60 * 5,

  });

  return (

    <section className="
    max-w-7xl
      mx-auto
      px-*
      py-*
    ">

      <div className="
        flex
        items-center
        justify-between
        mb-*
      ">

        <h2 className="
          text-2xl
          font-bold
        ">
          🏆 Best Sellers
        </h2>

      </div>

      {error && (

        <p className="
          text-red-500
        ">
          Failed to load products
        </p>

      )}

      {isLoading && (

        <div className="
  grid
  grid-cols-2
  sm:grid-cols-3
  md:grid-cols-4
  lg:grid-cols-5
  xl:grid-cols-6
  gap-1
">
          {[...Array(8)].map(
            (_, index) => (

            <ProductSkeleton
              key={index}
            />

          ))}

        </div>

      )}

      {!isLoading &&
       products?.length > 0 && (

        

        <div className="
  grid
  grid-cols-2
  sm:grid-cols-3
  md:grid-cols-4
  lg:grid-cols-5
  xl:grid-cols-6
  gap-1
">


          {products.map(
            (product) => (

            <ProductCard
  key={product.id}
  id={product.id}
  name={product.name}
  price={product.price}
  image={product.image}
  stock={product.stock}
/>

          ))}

          {!isLoading &&
 products?.length === 0 && (

  <div className="
    text-center
    py-*
    text-gray-500
  ">

    No Best Sellers Found

  </div>

)}

        </div>

      )}

    </section>

  );

}