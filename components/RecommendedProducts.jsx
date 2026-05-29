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
                ...data,
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

  if (
    loading ||
    products.length === 0
  ) {
    return null;
  }

  return (

    <section className="
      max-w-7xl
      mx-auto
      px-4
      py-12
    ">

      <h2 className="
        text-3xl
        font-bold
        mb-8
      ">
        🎯 Recommended For You
      </h2>

      <div className="
        grid
        grid-cols-2
        md:grid-cols-4
        gap-4
      ">

        {products.map(
          (product) => (

          <ProductCard
            key={product.id}
            product={product}
          />

        ))}

      </div>

    </section>

  );

}