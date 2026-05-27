"use client";

import { useEffect, useState } from "react";

import Hero from "@/components/Hero";
import ProductCard from "@/components/ProductCard";
import CategoryStrip from "@/components/CategoryStrip";
import DealStrip from "@/components/DealStrip";
import Footer from "@/components/Footer";
import HeroSlider from "@/components/heroSlider";

import FeaturedProducts from "@/components/home/FeaturedProducts";
import TopVendors from "@/components/home/TopVendors";
import CategoriesGrid from "@/components/home/CategoriesGrid";
import FlashSale from "@/components/home/FlashSale";

import {
  collection,
  getDocs
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Product = {

  id:string;

  name:string;

  price:number;

  image:string;

  stock:number;

  category:string;

};

export default function Home() {

  const [products,setProducts] =
    useState<Product[]>([]);

    const [loading,setLoading] =
  useState(true);

  const [search,setSearch] =
    useState("");

    const [category,setCategory] =
  useState("All");

const [sortBy,setSortBy] =
  useState("default");

  async function loadProducts(){

    try{

      const snapshot =
        await getDocs(
          collection(db,"products")
        );

      const items:Product[] = [];

      snapshot.forEach((doc)=>{

        items.push({

          id:doc.id,

          ...doc.data()

        } as Product);

      });

      setProducts(items);

      setLoading(false);

    }catch(err){

      console.log(err);

    }

  }

  useEffect(()=>{

    loadProducts();

  },[]);

  if(loading){

  return(

    <main className="
      min-h-screen
      bg-gray-100
      flex
      items-center
      justify-center
    ">

      <h1 className="
        text-4xl
        font-bold
      ">

        Loading Products...

      </h1>

    </main>

  );

}

  const filteredProducts =
  products

    .filter((product)=>{

      const matchesSearch =

        product.name
          .toLowerCase()
          .includes(
            search.toLowerCase()
          );

      const matchesCategory =

        category === "All"

        ||

        product.category ===
        category;

      return(

  matchesSearch &&

  matchesCategory &&

  product.stock > 0

);

    })

    .sort((a:any,b:any)=>{

      if(
        sortBy ===
        "low"
      ){

        return (
          a.price -
          b.price
        );

      }

      if(
        sortBy ===
        "high"
      ){

        return (
          b.price -
          a.price
        );

      }

      if(
  sortBy ===
  "stock"
){

  return (
    b.stock -
    a.stock
  );

}

      return 0;

    });

    return ( 
    <main className="min-h-screen bg-gray-100">

      <CategoryStrip />
      <DealStrip />
      <HeroSlider />

      <section className="max-w-7xl mx-auto px-6 py-16">

        <div className="flex items-center justify-between mb-8">

          <h2 className="text-4xl font-bold">

            Trending Products

            <FlashSale />

      <FeaturedProducts />
      <TopVendors />
      

        <p className="
  text-gray-500
  mt-2
">

  {filteredProducts.length}

  {" "}

  Products Found

</p>

          </h2>

        </div>

        <div className="mb-8">

          <input

            type="text"

            placeholder="Search products..."

            value={search}

            onChange={(e)=>
              setSearch(
  e.target.value.trimStart()
)
            }

            className="
              w-full
              p-3
              rounded-xl
              border
              outline-none
              text-lg
              shadow-sm
            "
          />

        </div>
        <div className="
  flex
  flex-col
  md:flex-row
  gap-4
  mt-5
">

  <select

    value={category}

    onChange={(e)=>
      setCategory(
        e.target.value
      )
    }

    className="
      p-3
      rounded-xl
      border
      bg-white
    "
  >

    <option>
      All
    </option>

    <option>
      Grocery
    </option>

    <option>
      Fashion
    </option>

    <option>
      Beauty
    </option>

    <option>
      Electronics
    </option>

  </select>

  <select

    value={sortBy}

    onChange={(e)=>
      setSortBy(
        e.target.value
      )
    }

    className="
      p-4
      rounded-xl
      border
      bg-white
    "
  >

    <option value="default">
      Sort By
    </option>

    <option value="low">
      Price: Low to High
    </option>

    <option value="high">
      Price: High to Low

      <option value="stock">
  Stock Available
      </option>

    </option>

  </select>

  <button

  onClick={()=>{

    setSearch("");

    setCategory("All");

    setSortBy("default");

  }}

  className="
    bg-red-500
    hover:bg-red-600
    text-white
    px-6
    py-4
    rounded-xl
    font-semibold
  "
>

  Clear Filters

</button>

</div>

{filteredProducts.length === 0 && (

  <div className="
    bg-white
    rounded-3xl
    shadow-md
    p-10
    text-center
    mb-8
  ">

    <h3 className="
      text-3xl
      font-bold
      mb-4
    ">

      No Products Found

    </h3>

    <p className="
      text-gray-500
      text-lg
    ">

      Try another search
      or category

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
            gap-6
          "
        >

          {filteredProducts.map((product)=>(

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

      <Footer />

    </main>

  );

}