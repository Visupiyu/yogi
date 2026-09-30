"use client";

import Link from "next/link";

import { Heart } from "lucide-react";

import { motion } from "framer-motion";

import { discountPercent } from "@/lib/products/discount";

// Shared by the homepage rows, category page, store page and product
// recommendations. `mrp` is optional so every existing caller keeps working
// unchanged; when it is passed and above the price, the card shows the
// struck-through MRP and the % saving.
type Props = { id:string; name:string; price:number; image:string; stock:number; vendorId?:string; mrp?:number; };

// public/placeholder.png — shown when a product has no image or it fails to load.
const PLACEHOLDER_IMAGE = "/placeholder.png";

export default function ProductCard({ id, name, price, image, stock, vendorId, mrp
}:Props){
  const imageSrc = typeof image === "string" && image.trim() ? image : PLACEHOLDER_IMAGE;
  const discount = discountPercent(price, mrp);
  // Only a real, known stock of zero or less is "out of stock" — a caller
  // that doesn't pass stock never shows the badge.
  const outOfStock = typeof stock === "number" && Number.isFinite(stock) && stock <= 0;

  const addToWishlist = ()=>{

    const wishlist =

      JSON.parse(

        localStorage.getItem(
          "wishlist"
        ) || "[]"

      );

    const exists = wishlist.find( (item:any)=> item.id === id );

    if(exists){ alert("Already In Wishlist");

      return;

    }

    // vendorId is required to move this item into the cart later
    // (app/wishlist/page.tsx's moveToCart reads it) — without it, an
    // order created from a wishlisted-then-moved item would carry an
    // undefined vendorId, corrupting the whole multi-vendor commission
    // attribution downstream.
    wishlist.push({id, name, price, image, stock, vendorId });

    localStorage.setItem(

      "wishlist",

      JSON.stringify(wishlist)

    );

    window.dispatchEvent(

      new Event(
        "wishlistUpdated"
      )

    );

    alert("Added To Wishlist");

  };

  return(

 <motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  whileHover={{
    y: -4,
    scale: 1.02,
  }}
  transition={{
    duration: 0.3,
  }}
  className="
    bg-gradient-to-b
    from-pink-50
    to-white
    rounded-2xl
    overflow-hidden
    shadow-lg
    hover:shadow-2xl
    transition
    duration-300
    group
  "
>

      {/* IMAGE */}

<motion.div
  className="
    relative
    overflow-hidden
    bg-pink-50
  "
>

        <Link
          href={`/product/${id}`}
        >

<img
  src={imageSrc}
  alt={name}
  onError={(e) => {
    // Swap a broken image for the placeholder once (never loop).
    const img = e.currentTarget;
    if (img.dataset.fallback) return;
    img.dataset.fallback = "1";
    img.src = PLACEHOLDER_IMAGE;
  }}
  className="
    w-full
    h-48
    md:h-52
    object-contain
    sm:object-cover
    group-hover:scale-105
    transition
    duration-500
  "
/>
         </Link>

        {/* OUT OF STOCK */}

        {outOfStock && (
          <span
            className="
              absolute
              top-2
              left-2
              bg-gray-900/85
              text-white
              text-[11px]
              font-semibold
              px-2
              py-1
              rounded-full
            "
          >
            Out of stock
          </span>
        )}

        {/* WISHLIST — 40px tap target */}

        <motion.button

  type="button"

  aria-label="Add to wishlist"

  whileTap={{
    scale:0.95
  }}

  whileHover={{
    scale:1.03
  }}

          onClick={addToWishlist}

          className="
            absolute
            top-2
            right-2
            bg-gradient-to-b
from-white
to-gray-50
            w-10
            h-10
            rounded-full
            flex
            items-center
            justify-center
            shadow-md
            hover:bg-pink-500
            hover:scale-110
            hover:text-white
            transition
          "
        >

          <Heart size={16} />

        </motion.button>

     </motion.div>

      {/* CONTENT */}

      <motion.div className="
  p-2
">

        {/* NAME */}

        <Link
          href={`/product/${id}`}
        >

          <h3 className="
            font-semibold
           text-sm
            line-clamp-2
            min-h-[42px]
            hover:text-green-600
            transition
          ">

            {name}

          </h3>

        </Link>

 {/* MRP + DISCOUNT (only when a real MRP above the price is known) */}

{discount !== null && (
  <div className="mt-2 flex items-center gap-2 text-xs">
    <span className="text-gray-500 line-through">
      ₹{Number(mrp).toLocaleString("en-IN")}
    </span>
    <span className="font-semibold text-green-700">
      {discount}% off
    </span>
  </div>
)}

 {/* PRICE + DETAILS */}

<div className={`flex ${discount !== null ? "mt-2" : "mt-3"}`}>

  {/* PRICE */}

  <div
    className="
      flex-1
      bg-green-600
      text-white
      text-center
      py-2
      rounded-l-lg
      font-bold
      text-sm
    "
  >
    ₹{Number(price).toLocaleString("en-IN")}
  </div>

  {/* DETAILS */}

  <Link
    href={`/product/${id}`}
    className="
      flex-1
      bg-gray-900
      hover:bg-black
      text-white
      text-center
      py-2
      rounded-r-lg
      text-sm
      font-semibold
      transition
    "
  >
    Details →
  </Link>

</div>
     </motion.div>

   </motion.div>

  );

}
