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

type Product = {

  id:string;

  name:string;

  price:number;

  image:string;

  stock:number;

};

export default function FeaturedProducts() {

 const [products,setProducts] =
  useState<Product[]>([]);

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

        const items: Product[] = [];

snapshot.forEach((doc)=>{

  const data = doc.data();

  items.push({

    id: doc.id,

    name: data.name || "",

    price: Number(data.price || 0),

    image: data.image || "",

    stock: Number(data.stock || 0),

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

    <section className="py-* px-*">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-6">

          <h2 className="text-2xl md:text-3xl font-bold">
            Featured Products
          </h2>

          <Link
            href="/store"
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
          gap-*
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

        {products.length === 0 && (

  <div className="
    col-span-full
    text-center
    py-*
    text-gray-500
  ">

    No Featured Products Found

  </div>

)}

      </div>

          </div>

    </section>

  );

}