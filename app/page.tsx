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
import CategoryRow from "@/components/CategoryRow";

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
    py-1
  ">

    <div className="
      max-w-7xl
      mx-auto
      grid
     grid-cols-2
sm:grid-cols-2
md:grid-cols-3
lg:grid-cols-4
xl:grid-cols-5
      gap-3
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
  py-1
  grid
  grid-cols-1
  lg:grid-cols-4
  gap-3
">

  <div className="
    lg:col-span-3
  ">

    <HeroSlider />

  </div>

  <OfferCards />

</section>
        

       <CouponPopup />

      <FlashSale />

     <CategoryRow
  title="📱 Mobiles"
  products={
    filteredData.filter(
      (p) => p.category === "Mobile"
    )
  }
/>
<CategoryRow
  title=" 👔 Men Fashion"
  products={
    filteredData.filter(
      (p) => p.category === "Men Fashion"
    )
  }
/>

<CategoryRow
  title="👗 Women Fashion"
  products={
    filteredData.filter(
      (p) => p.category === "Women Fashion"
    )
  }
/>
<CategoryRow
  title=" 🧒 Kids Fashion"
  products={
    filteredData.filter(
      (p) => p.category === "Kids Fashion"
    )
  }
/>

<CategoryRow
  title="👕 Fashion"
  products={
    filteredData.filter(
      (p) => p.category === "Fashion"
    )
  }
/>

<CategoryRow
  title="💻 Electronics"
  products={
    filteredData.filter(
      (p) => p.category === "Electronics"
    )
  }
/>

<CategoryRow
  title=" 💄 Beauty"
  products={
    filteredData.filter(
      (p) => p.category === "Beauty"
    )
  }
/>

<CategoryRow
  title=" 🏠 Appliances"
  products={
    filteredData.filter(
      (p) => p.category === "Appliances"
    )
  }
/>

<CategoryRow
  title="🛒 Grocery"
  products={
    filteredData.filter(
      (p) => p.category === "Grocery"
    )
  }
/>


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
