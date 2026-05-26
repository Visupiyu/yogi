"use client";

import Link from "next/link";

import {
  Home,
  Search,
  Heart,
  ShoppingCart,
  User
} from "lucide-react";

export default function
MobileBottomNav(){

  return (

    <div className="
      md:hidden
      fixed
      bottom-0
      left-0
      w-full
      bg-white
      border-t
      z-50
      flex
      justify-around
      items-center
      py-3
      shadow-lg
    ">

      <Link
        href="/"
        className="
          flex
          flex-col
          items-center
          text-xs
          text-gray-700
        "
      >

        <Home size={22} />

        <span>Home</span>

      </Link>

      <Link
        href="/search"
        className="
          flex
          flex-col
          items-center
          text-xs
          text-gray-700
        "
      >

        <Search size={22} />

        <span>Search</span>

      </Link>

      <Link
        href="/wishlist"
        className="
          flex
          flex-col
          items-center
          text-xs
          text-gray-700
        "
      >

        <Heart size={22} />

        <span>Wishlist</span>

      </Link>

      <Link
        href="/cart"
        className="
          flex
          flex-col
          items-center
          text-xs
          text-gray-700
        "
      >

        <ShoppingCart size={22} />

        <span>Cart</span>

      </Link>

      <Link
        href="/login"
        className="
          flex
          flex-col
          items-center
          text-xs
          text-gray-700
        "
      >

        <User size={22} />

        <span>Account</span>

      </Link>

    </div>

  );

}