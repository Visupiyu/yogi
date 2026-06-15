"use client";

import TopStrip from "@/components/TopStrip";

import { useEffect, useState } from "react";

import ProductCard from "@/components/ProductCard";

import CategoryStrip from "@/components/CategoryStrip";

import Footer from "@/components/Footer";

import HeroSlider from "@/components/heroSlider";

import FeaturedProducts from "@/components/home/FeaturedProducts";

import TopVendors from "@/components/home/TopVendors";

import FlashSale from "@/components/home/FlashSale";

import FeatureStrip from "@/components/home/FeatureStrip";

import OfferCards from "@/components/home/OfferCards";

import ProductSkeleton from "@/components/ProductSkeleton";

import { useQuery } from "@tanstack/react-query";

import { motion } from "framer-motion";

import TrendingProducts from "@/components/TrendingProducts";

import BestSellers from "@/components/BestSellers";

import { collection, getDocs } from "firebase/firestore";

import CustomerReviewsCarousel
from "@/components/CustomerReviewsCarousel";

import CouponPopup
from "@/components/CouponPopup";

import RecommendedProducts
from "@/components/RecommendedProducts";

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

    return items;

  }catch(err){

    console.log(err);

    return [];

  }

}

const {

  data:filteredData = [],

  isLoading,

  error,

} = useQuery({

  queryKey:["products"],

  queryFn:loadProducts,

});

if(error){

  return(

    <div className="
      p-10
      text-center
    ">

      Failed to load products

    </div>

  );

}

 if(isLoading)

    return(

  <main className="
    min-h-screen
    bg-slate-100
    px-2
    py-*
  ">

    <div className="
      max-w-7xl
      mx-auto
      grid
     grid-cols-2
sm:grid-cols-3
md:grid-cols-4
lg:grid-cols-5
xl:grid-cols-6
      gap-1
    ">

      

      {[...Array(10)].map((_,i)=>(

        <ProductSkeleton
          key={i}
        />

      ))}

    </div>

  </main>

);

  const filteredProducts =
  filteredData

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

      .sort((a,b)=>{

        if(sortBy === "low"){

          return a.price - b.price;

        }

        if(sortBy === "high"){

          return b.price - a.price;

        }

        if(sortBy === "stock"){

          return b.stock - a.stock;

        }

        return 0;

      });

  return(

    <main className="
      min-h-screen
      bg-gray-100
    ">

      <CategoryStrip />

      <TopStrip />

      <FeatureStrip />

      <section className="
  max-w-7xl
  mx-auto
  px-2
  py-*
  grid
  grid-cols-1
  lg:grid-cols-4
  gap-1
">

  <div className="
    lg:col-span-3
  ">

    <HeroSlider />

  </div>

  <OfferCards />

</section>

      <motion.section className="
      initial={{ opacity:0, y:40 }}

whileInView={{
  opacity:1,
  y:0
}}

transition={{
  duration:0.5
}}

viewport={{
  once:true
}}
        max-w-7xl
        mx-auto
        px-2
        py-*
      ">

        <div className="
          flex
          flex-col
          md:flex-row
          md:items-center
          md:justify-between
          gap-1
          mb-*
        ">

          <div>

           <h2 className="
  text-2xl
  md:text-3xl
  font-bold
  text-gray-800
">

              Trending Products

            </h2>

            <p className="
              text-gray-500
              mt-*
            ">

              {filteredProducts.length}
              {" "}
              Products Found

            </p>

          </div>

        </div>

        <div className="
  bg-white
  rounded-3xl
  p-6
  shadow-md
  border
  border-gray-100
">

          <div className="
            flex
            flex-col
            md:flex-row
            gap-1
          ">

            <input

              type="text"

              placeholder="Search products..."

              value={search}

              onChange={(e)=>
                setSearch(
                  e.target.value
                )
              }

              className="
  flex-1
  px-2
  py-*
  rounded-2xl
  border
  border-gray-200
  outline-none
  focus:ring-4
  focus:ring-green-100
  focus:border-green-500
"
            />

            <select

              value={category}

              onChange={(e)=>
                setCategory(
                  e.target.value
                )
              }

              className="
  px-2
  py-*
  rounded-2xl
  border
  border-gray-200
  bg-white
  outline-none
  focus:border-green-500
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
                p-2
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
              </option>

              <option value="stock">
                Stock Available
              </option>

            </select>

            <button

              onClick={()=>{

                setSearch("");

                setCategory("All");

                setSortBy("default");

              }}

              className="
               bg-gradient-to-r
from-green-600
to-blue-600
hover:from-green-500
hover:to-blue-500
                text-white
                px-6
                py-1
                rounded-xl
                font-semibold
              "
            >

              Clear

            </button>

          </div>

        </div>

        {filteredProducts.length === 0 && (

          <div className="
            bg-white
            rounded-2xl
            shadow-sm
            p-10
            text-center
            mb-*
          ">

            <h3 className="
              text-2xl
              font-bold
              mb-3
            ">

              No Products Found

            </h3>

            <p className="
              text-gray-500
            ">

              Try another search
              or category

            </p>

          </div>

        )}

       <div className="
  grid
 grid-cols-2
sm:grid-cols-3
md:grid-cols-4
lg:grid-cols-5
xl:grid-cols-6
  gap-2
">

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

      </motion.section>

       <CouponPopup />

      <FlashSale />

      <TrendingProducts />

      <BestSellers />

      <RecommendedProducts />

      <CustomerReviewsCarousel />

      <FeaturedProducts />

      <TopVendors />

      <Footer />

    </main>

  );

}
