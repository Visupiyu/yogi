"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import ProductCard from "./ProductCard";


export default function RecommendedProducts() {

  const [products, setProducts] =
  useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    const loadRecommendations =
      async () => {

        try {

          const wishlist =
            JSON.parse(
              localStorage.getItem(
                "wishlist"
              ) || "[]"
            );

          const recent =
            JSON.parse(
              localStorage.getItem(
                "recentProducts"
              ) || "[]"
            );

          const preferredIds =
            [
              ...wishlist,
              ...recent,
            ].map(
              (item) => item.id
            );

          const snapshot =
            await getDocs(
              collection(
                db,
                "products"
              )
            );

   const items = [];

          snapshot.forEach((doc) => {

            const data =
              doc.data();

            if (
              !preferredIds.includes(
                doc.id
              )
            ) {

             items.push({

  id: doc.id,

  name: data.name || "",

  price: Number(data.price || 0),

  image: data.image || "",

  stock: Number(data.stock || 0),

});

            }

          });

          setProducts(
            items.slice(0, 8)
          );

        } catch (error) {

          console.log(error);

        }

        setLoading(false);

      };

    loadRecommendations();

  }, []);

  if (loading) {

  return (
    <div className="py-10 text-center">
      Loading recommendations...
    </div>
  );

}
if (products.length === 0) {
  return null;
}

  return (

    <section className="
      max-w-7xl
      mx-auto
      px-2
      py-2
    ">

      <h2 className="
        text-3xl
        font-bold
        mb-4
      ">
        🎯 Recommended For You
      </h2>

      <div className="
        grid
        grid-cols-2
       sm:grid-cols-3
md:grid-cols-4
lg:grid-cols-5
xl:grid-cols-6
        gap-0
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

      </div>

    </section>

  );

}