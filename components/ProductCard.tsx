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

  return(

    <motion.div

  initial={{ opacity:0, y:20 }}

  animate={{ opacity:1, y:0 }}

  whileHover={{
    y:-10,
    scale:1.03
  }}

  transition={{
    duration:0.3
  }}

 className="
  bg-gradient-to-b
  from-white
  to-gray-50
  rounded-3xl
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
    h-56
    md:h-64
    object-cover
    group-hover:scale-105
    transition
    duration-500
  "
/>
 

        </Link>

        {/* DISCOUNT */}

        <motion.div className="
          absolute
          top-3
          left-3
        bg-gradient-to-r
        from-orange-500
         to-red-500
          text-white
          text-xs
          font-bold
          px-3
          py-1
          rounded-full
        ">
            25% OFF

      </motion.div>

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
            top-3
            right-3
            bg-gradient-to-b
from-white
to-gray-50
            w-8
            h-8
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

        {/* RATING */}

        <motion.div className="
          flex
          items-center
          gap-1
          text-yellow-500
          mb-0
        ">

          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />

          <span className="
            text-gray-500
            text-xs
            ml-1
          ">

          (4.9)

          </span>

     </motion.div>

        {/* NAME */}

        <Link
          href={`/product/${id}`}
        >

          <h3 className="
            font-semibold
           text-sm
            line-clamp-2
            min-h-[24px]
            hover:text-green-600
            transition
          ">

            {name}

          </h3>

        </Link>

        {/* PRICE */}

        <motion.div className="
          flex
          items-center
          gap-2
      
        ">

          <p className="
            text-green-600
            font-bold
            text-sm
          ">

            ₹{price}

          </p>

          <p className="
            text-gray-400
            line-through
            text-sm
          ">

           ₹{Math.round(price * 1.25)}

          </p>
          <p className="
  text-xs
  text-green-600
  font-medium
  mt-1
">
  🚚 Free Delivery
</p>

       </motion.div>

       <p className="
  text-xs
  font-medium
  mt-2
  mb-2
">
  {stock <= 10
 ? "⚠️ Limited Stock"
 : "🟢 In Stock"
}
</p>

        {/* BUTTON */}


     </motion.div>

   </motion.div>

  );

}