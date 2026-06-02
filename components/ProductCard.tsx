"use client";

import Link from "next/link";

import {

  Heart,

  ShoppingCart,

  Star

} from "lucide-react";

import { motion }
from "framer-motion";

type Props = {

  id:string;

  name:string;

  price:number;

  image:string;

  stock:number;

};

export default function ProductCard({

  id,

  name,

  price,

  image,

  stock

}:Props){

  const addToWishlist = ()=>{

    const wishlist =

      JSON.parse(

        localStorage.getItem(
          "wishlist"
        ) || "[]"

      );

    const exists = wishlist.find(

      (item:any)=>

        item.id === id

    );

    if(exists){

      alert("Already In Wishlist");

      return;

    }

    wishlist.push({

      id,

      name,

      price,

      image

    });

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

      existingCart.push({

        id,

        name,

        price,

        image,

        stock,

        qty:1

      });

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

    alert("Added To Cart");

  };

  return(

    <motion.div

  initial={{ opacity:0, y:20 }}

  animate={{ opacity:1, y:0 }}

  whileHover={{
    y:-8,
    scale:1.02
  }}

  transition={{
    duration:0.3
  }}

  className="
    bg-white
    rounded-2xl
    overflow-hidden
    shadow-md
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
      ">

        <Link
          href={`/product/${id}`}
        >
        

          <img
            src={
              image ||
              "/no-image.png"
            }
            alt={name}
            className="
              w-full
              h-44
              md:h-52
              object-cover
              bg-white
              p-1
              group-hover:scale-110
              ease-out
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
          bg-orange-500
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
            bg-white
            w-10
            h-10
            rounded-full
            flex
            items-center
            justify-center
            shadow-md
            hover:bg-pink-500
            hover:text-white
            transition
          "
        >

          <Heart size={18} />

        </motion.button>

     </motion.div>

      {/* CONTENT */}

      <motion.div className="
        p-3
      ">

        {/* RATING */}

        <motion.div className="
          flex
          items-center
          gap-1
          text-yellow-500
          mb-2
        ">

          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />
          <Star size={14} fill="currentColor" />

          <span className="
            text-gray-500
            text-sm
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
            text-base
            md:text-lg
            line-clamp-2
            min-h-[36px]
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
          mt-0
        ">

          <p className="
            text-green-600
            font-bold
            text-lg
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

       </motion.div>

        {/* BUTTON */}

        <motion.button

          disabled={
            stock <= 0
          }

          onClick={addToCart}

          className={`

  mt-3
  w-full
  flex
  items-center
  justify-center
  gap-2
  py-2.5
  rounded-xl
  font-semibold
  transition

  ${stock <= 0

    ? "bg-gray-300 text-gray-500"

    : "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white"

  }

`}        >

          <ShoppingCart size={18} />

          {stock <= 0

            ? "Out Of Stock"

            : "Add To Cart"

          }

        </motion.button>

     </motion.div>

   </motion.div>

  );

}