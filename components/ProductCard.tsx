"use client";

import Link from "next/link";

import { Heart, Star } from "lucide-react";

import { motion } from "framer-motion";

type Props = { id:string; name:string; price:number; image:string; stock:number; };

export default function ProductCard({ id, name, price, image, stock 
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

    wishlist.push({id, name, price, image, stock });

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
  const addToCompare = () => {

  const compare = JSON.parse(
    localStorage.getItem("compareProducts") || "[]"
  );

  const exists = compare.find(
    (item: any) => item.id === id
  );

  if (exists) {
    alert("Product already added for comparison");
    return;
  }

  if (compare.length >= 4) {
    alert("You can compare up to 4 products only");
    return;
  }

  compare.push({
    id,
    name,
    price,
    image,
    stock,
  });

  localStorage.setItem(
    "compareProducts",
    JSON.stringify(compare)
  );

  alert("Added to Compare");
};

  return(

    <motion.div

  initial={{ opacity:0, y:20 }}

  animate={{ opacity:1, y:0 }}

  whileHover={{
    y:-4,
    scale:1.02
  }}

  transition={{
    duration:0.3
  }}

 className="
  bg-gradient-to-b
  from-white
  to-gray-50
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

      <motion.div className="
  relative
  overflow-hidden
  bg-slate-50
">

        <Link
          href={`/product/${id}`}
        >
        
<img
  src={image}
  alt={name}
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
            w-6
            h-6
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