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
      w-16
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
           className="
  block
  px-4
  py-3
  rounded-xl
  hover:bg-white/20
  transition
"
          >
            Add Product
          </Link>

          <Link
            href="/seller/products"
            className="block"
          >
            Products
          </Link>

          <Link
  href="/store"
  className="
    block
    px-4
    py-3
    rounded-xl
    hover:bg-white/20
    transition
  "
>
  View Stores
</Link>

<Link
  href="/seller/questions"
  className="
    block
    px-4
    py-3
    rounded-xl
    hover:bg-white/20
    transition
  "
>
  Questions
</Link>
<Link
  href="/seller/analytics"
  className="
    block
    px-4
    py-3
    rounded-xl
    hover:bg-white/20
    transition
  "
>
  Analytics
</Link>
<Link
  href="/seller/reports"
  className="
    block
    px-4
    py-3
    rounded-xl
    hover:bg-white/20
    transition
  "
>
  Reports
</Link>
<Link
  href="/seller/assistant"
  className="
    block
    px-4
    py-3
    rounded-xl
    hover:bg-white/20
    transition
  "
>
  AI Assistant
</Link>
<Link

  href="/seller/chat"

  className="
    block
    px-4
    py-3
    rounded-xl
    hover:bg-white/20
  "

>

  💬 Customer Chats

</Link>

<button
  onClick={()=>{
    localStorage.removeItem(
      "vendor"
    );

    window.location.href =
      "/vendor-login";
  }}
  className="
    w-full
    text-left
    px-4
    py-3
    rounded-xl
    hover:bg-red-500
    transition
  "
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