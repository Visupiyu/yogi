"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

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

    <section className="py-12 px-4">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-8">

          <h2 className="text-3xl font-bold">
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
          gap-6
        ">

          {products.map((product)=>(

            <Link
              key={product.id}
              href={`/product/${product.id}`}
            >

              <div className="
                bg-white
                rounded-2xl
                shadow-md
                overflow-hidden
                hover:shadow-xl
                transition
                duration-300
                hover:-translate-y-1
              ">

                <div className="
                  h-52
                  bg-gray-100
                  overflow-hidden
                ">

                  <img
                    src={
                      product.image ||
                      "/no-image.png"
                    }
                    alt={product.name}
                    className="
                      w-full
                      h-full
                      object-cover
                    "
                  />

                </div>

                <div className="p-4">

                  <h3 className="
                    font-semibold
                    line-clamp-2
                    min-h-[48px]
                  ">
                    {product.name}
                  </h3>

                  <p className="
                    text-green-600
                    font-bold
                    text-lg
                    mt-2
                  ">
                    ₹{product.price}
                  </p>

                  {product.stock <= 0 ? (

                    <div className="
                      mt-3
                      text-red-500
                      font-semibold
                    ">
                      Out of Stock
                    </div>

                  ) : (

                    <div className="
                      mt-3
                      text-sm
                      text-gray-500
                    ">
                      Stock:
                      {" "}
                      {product.stock}
                    </div>

                  )}

                </div>

              </div>

            </Link>

          ))}

        </div>

      </div>

    </section>

  );

}