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
          bg-black
          text-white
          p-5
        "
      >

        <h1
          className="
            text-2xl
            font-bold
            mb-8
          "
        >
          Seller Panel
        </h1>

        <div className="space-y-4">

          <Link
            href="/seller"
            className="block"
          >
            Dashboard
          </Link>

          <Link
            href="/seller/orders"
            className="block"
          >
            Orders
          </Link>

          <Link
            href="/seller/add-product"
            className="block"
          >
            Add Product
          </Link>

          <Link
            href="/seller/products"
            className="block"
          >
            Products
          </Link>

        </div>

      </div>

      <div className="flex-1">

        {children}

      </div>

    </div>

  );

}