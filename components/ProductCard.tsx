"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Heart, Scale, Star } from "lucide-react";

import { motion } from "framer-motion";

type Props = { id:string; name:string; price:number; image:string; stock:number; vendorId?:string; };

export default function ProductCard({ id, name, price, image, stock, vendorId
}:Props){
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

  const addToCart = ()=>{

    const existingCart =

      JSON.parse(

        localStorage.getItem(
          "cart"
        ) || "[]"

      );

    const existingIndex =

      existingCart.findIndex(

        (cartItem:any)=>

          cartItem.id === id

      );

    if(existingIndex > -1){

  if(

    existingCart[
      existingIndex
    ].qty < stock

  ){

    existingCart[
      existingIndex
    ].qty += 1;

  }else{

    alert(
      "Maximum stock reached"
    );

    return;

  }

}
    
    
    else{

      existingCart.push({ id, name, price, image, stock, qty:1 });

    }

    localStorage.setItem(

      "cart",

      JSON.stringify(
        existingCart
      )

    );

    window.dispatchEvent(

      new Event(
        "cartUpdated"
      )

    );

   alert(

  existingIndex > -1

    ? "Cart Updated"

    : "Added To Cart"

);

  };
  // Compare list: localStorage "compareProducts" (the list /compare renders),
  // max 4. The button toggles — click to add, click again to remove — and its
  // selected state is kept in sync across cards and tabs via "compareUpdated".
  const MAX_COMPARE = 4;
  const [inCompare, setInCompare] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        const list = JSON.parse(localStorage.getItem("compareProducts") || "[]");
        setInCompare(Array.isArray(list) && list.some((item: any) => item.id === id));
      } catch {
        setInCompare(false);
      }
    };
    sync();
    window.addEventListener("compareUpdated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("compareUpdated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [id]);

  const toggleCompare = () => {
    let compare: any[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("compareProducts") || "[]");
      if (Array.isArray(parsed)) compare = parsed;
    } catch {
      compare = [];
    }

    if (compare.some((item) => item.id === id)) {
      compare = compare.filter((item) => item.id !== id);
    } else {
      if (compare.length >= MAX_COMPARE) {
        alert(`You can compare up to ${MAX_COMPARE} products only`);
        return;
      }
      compare.push({ id, name, price, image, stock });
    }

    localStorage.setItem("compareProducts", JSON.stringify(compare));
    window.dispatchEvent(new Event("compareUpdated"));
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
  src={image}
  alt={name}
  loading="lazy"
  decoding="async"
  className="
    w-full
    h-48
    md:h-52
    object-cover
    group-hover:scale-105
    transition
    duration-500
  "
/>
         </Link>
        {/* WISHLIST */}

        <motion.button

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
            w-8
            h-8
            md:w-6
            md:h-6
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

          <Heart size={12} />

        </motion.button>

        {/* COMPARE */}

        <button
          type="button"
          onClick={toggleCompare}
          aria-pressed={inCompare}
          aria-label={inCompare ? "Remove from compare" : "Add to compare"}
          title={inCompare ? "Remove from compare" : "Add to compare"}
          className={`absolute top-12 right-2 w-8 h-8 md:w-6 md:h-6 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition ${
            inCompare
              ? "bg-green-600 text-white"
              : "bg-white text-gray-700 hover:bg-green-600 hover:text-white"
          }`}
        >
          <Scale size={12} />
        </button>

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
 {/* PRICE + DETAILS */}

<div className="flex mt-3">

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