"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import ProductCard from "@/components/ProductCard";

import {
  collection,
  getDocs,
  limit,
  query,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function FeaturedProducts() {

  const [products,setProducts] =
    useState([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    const fetchProducts = async()=>{

      try{

        const q = query(
          collection(db,"products"),
          limit(8)
        );

        const snapshot =
          await getDocs(q);

        const items = [];

        snapshot.forEach((doc)=>{

          items.push({
            id:doc.id,
            ...doc.data(),
          });

        });

        setProducts(items);

      }catch(error){

        console.log(error);

      }

      setLoading(false);

    };

    fetchProducts();

  },[]);

  if(loading){

    return(

      <div className="py-12 text-center">
        Loading products...
      </div>

    );

  }

  return(

    <section className="py-5 px-4">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-6">

          <h2 className="text-2xl md:text-3xl font-bold">
            Featured Products
          </h2>

          <Link
            href="/products"
            className="text-green-600 font-semibold"
          >
            View All
          </Link>

        </div>

                <div className="
          grid
          grid-cols-2
          md:grid-cols-3
          lg:grid-cols-4
          gap-1
        ">

          {products.map((product)=>(

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

      </div>

    </section>

  );

}