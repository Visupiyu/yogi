"use client";

import Link from "next/link";

import {
  ShoppingCart,
  Heart,
  User,
  Search,
} from "lucide-react";

export default function Header() {

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

          {/* RIGHT SIDE */}

          <div className="
            flex
            items-center
            gap-5
          ">

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