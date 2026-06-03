"use client";

import { useEffect, useState }
from "react";

import {
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

import ProductCard
from "@/components/ProductCard";

type Props = {

  params:Promise<{
    name:string;
  }>;

};

type Product = {

  id:string;

  name:string;

  price:number;

  image:string;

  stock:number;

};

export default function CategoryPage({

  params

}:Props){

  const [products,setProducts] =
    useState<Product[]>([]);

  const [category,setCategory] =
    useState("");
    const [loading,setLoading] =
  useState(true);

  useEffect(()=>{

    async function loadProducts(){

        setLoading(true);

      const { name } =
        await params;

      setCategory(name);

      const q =
        query(

          collection(db,"products"),

          where(
            "category",
            "==",
            name
          )

        );

      const snapshot =
        await getDocs(q);

      const items:Product[] = [];

      snapshot.forEach((doc)=>{

  const data =
    doc.data();

  items.push({

    id:doc.id,

    name:data.name,

    price:Number(data.price),

    image:data.image,

    stock:Number(data.stock)

  });

});

      setProducts(items);
      setLoading(false);

    }

    loadProducts();

  },[params]);

  if(loading){

  return(

    <div className="
      min-h-screen
      flex
      items-center
      justify-center
    ">

      Loading Products...

    </div>

  );

}

  return (

    <main className="min-h-screen bg-gray-100 p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-5xl font-bold mb-10 capitalize">

          {category} Products

        </h1>
        </div>

        {products.length === 0 && (

  <div className="
    bg-white
    rounded-3xl
    shadow-md
    p-10
    text-center
  ">

    <h2 className="
      text-2xl
      font-bold
      mb-3
    ">
      No Products Found
    </h2>

    <p className="
      text-gray-500
    ">
      No products available in this category.
    </p>

  </div>

)}

        <div
          className="
            grid
            grid-cols-1
            sm:grid-cols-2
            md:grid-cols-3
            lg:grid-cols-4
            gap-8
          "
        >
          {products.length > 0 && (
  <div className="grid ...">

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

          )}

      </div>

    </main>

  );

}