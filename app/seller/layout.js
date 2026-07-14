"use client";

import Link from "next/link";

export default function SellerLayout({
  children
}) {

  return (

    <div className="flex">

      <div
        className="
          w-64
          min-h-screen
         bg-gradient-to-b
from-green-700
to-blue-700
          text-white
          p-5
        "
      >

        <div className="mb-8 text-center">

  <img
    src="/logo.png"
    alt="Yogi Mart"
    className="
      w-72
      mx-auto
      mb-3
    "
  />

  <h1
    className="
      text-2xl
      font-bold
    "
  >
    Seller Panel
  </h1>

</div>

        <div className="space-y-3">

  <Link
    href="/seller"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    Dashboard
  </Link>

  <Link
    href="/seller/orders"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    Orders
  </Link>

  <Link
    href="/seller#add-product"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    Add Product
  </Link>

  <Link
   href="/seller#products"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    Products
  </Link>

  <Link href="/seller/store"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    My Stores
  </Link>

  <Link
    href="/seller/questions"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    Questions
  </Link>

  <Link
    href="/seller/analytics"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    Analytics
  </Link>

  <Link
    href="/seller/reports"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    Reports
  </Link>

  <Link
    href="/seller/assistant"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    AI Assistant
  </Link>

  <Link
    href="/seller/chat"
    className="block whitespace-nowrap px-4 py-3 rounded-xl hover:bg-white/20 transition"
  >
    💬 Customer Chats
  </Link>

  <button
    onClick={() => {
      localStorage.removeItem("vendor");
      window.location.href = "/vendor-login";
    }}
    className="w-full text-left whitespace-nowrap px-4 py-3 rounded-xl hover:bg-red-500 transition"
  >
    Logout
  </button>

        </div>

      </div>

      <div className="flex-1">

        {children}

      </div>

    </div>

  );

}