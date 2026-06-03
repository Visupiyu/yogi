"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ShoppingCart,
  Heart,
  User,
  Search,
} from "lucide-react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import NotificationBell
from "@/components/NotificationBell";

import { db } from "@/lib/firebase";

interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
  stock?: number;
}

export default function Header() {

  const [search, setSearch] =
  useState("");

const [suggestions, setSuggestions] =
  useState<Product[]>([]);

  useEffect(() => {

  const loadSuggestions =
    async () => {

      if (
        search.trim().length < 2
      ) {

        setSuggestions([]);

        return;

      }

      const snapshot =
        await getDocs(
          collection(
            db,
            "products"
          )
        );

     const items:Product[] = [];

      snapshot.forEach((doc) => {

        const data = doc.data();

        if (
          data.name
            ?.toLowerCase()
            .includes(
              search.toLowerCase()
            )
        ) {

         items.push({

  id: doc.id,

  name: data.name || "",

  price: Number(data.price || 0),

  image: data.image || "",

});
items.push({

  id: doc.id,

  name: data.name || "",

  price: Number(data.price || 0),

  image: data.image || "",

  stock: Number(data.stock || 0),

});

        }

      });

      setSuggestions(
        items.slice(0, 5)
      );

    };

  loadSuggestions();

}, [search]);

  return (

    <header className="
      sticky
      top-0
      z-50
      bg-white
      shadow-md
    ">

      <div className="
        max-w-7xl
        mx-auto
        px-4
      ">

        <div className="
          h-20
          flex
          items-center
          justify-between
          gap-4
        ">

          {/* LOGO */}

          <Link href="/">

            <h1 className="
              text-2xl
              font-extrabold
              text-green-600
              whitespace-nowrap
            ">
              Yogi Mart
            </h1>

          </Link>

          {/* SEARCH BAR */}

          <div className="
            flex-1
            hidden
            md:flex
          ">

            <div className="
              w-full
              relative
            ">

              <input
  type="text"
  placeholder="Search products..."
  value={search}
  onChange={(e) =>
    setSearch(
      e.target.value
    )
  }
  className="
    w-full
    border
    border-gray-300
    rounded-full
    py-3
    pl-5
    pr-12
    outline-none
    focus:border-green-500
  "
/>

              <button className="
                absolute
                right-2
                top-1/2
                -translate-y-1/2
                bg-green-600
                hover:bg-green-700
                text-white
                p-2
                rounded-full
              ">

                <Search size={18} />

              </button>

              

            </div>

          </div>

          {suggestions.length > 0 && (

  <div className="
    absolute
    top-full
    left-0
    right-0
    bg-white
    rounded-2xl
    shadow-xl
    mt-2
    overflow-hidden
    z-50
  ">

    {suggestions.map(
      (product) => (

        

      <Link
        key={product.id}
        href={`/product/${product.id}`}
        className="
          flex
          items-center
          gap-3
          p-3
          hover:bg-gray-100
        "
      >

        <img
          src={
            product.image ||
            "/no-image.png"
          }
          alt=""
          className="
            w-12
            h-12
            rounded-lg
            object-cover
          "
        />

        <div>

          <p className="
            font-medium
          ">
            {product.name}
          </p>

          <p className="
            text-green-600
            font-bold
          ">
            ₹{product.price}
          </p>

        </div>

      </Link>

    ))}

  </div>

)}

          {/* RIGHT SIDE */}

          <div className="
  flex
  items-center
  gap-5
">

  <NotificationBell />


            <Link
              href="/wishlist"
              className="relative"
            >

              <Heart className="
                w-6
                h-6
                text-gray-700
              " />

            </Link>

            <Link
              href="/cart"
              className="relative"
            >

              <ShoppingCart className="
                w-6
                h-6
                text-gray-700
              " />

            </Link>

            <Link
              href="/login"
            >

              <div className="
                flex
                items-center
                gap-2
                bg-green-600
                hover:bg-green-700
                text-white
                px-4
                py-2
                rounded-full
                transition
              ">

                <User size={18} />

                <span className="
                  hidden
                  md:block
                ">
                  Login
                </span>

              </div>

              

            </Link>

          </div>

        </div>

      </div>

    </header>

  );

}