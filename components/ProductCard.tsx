"use client";

import Link from "next/link";

import {

  Heart,

  ShoppingCart,

  Star

} from "lucide-react";

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

      existingCart[
        existingIndex
      ].quantity += 1;

    }else{

      existingCart.push({

        id,

        name,

        price,

        image,

        stock,

        quantity:1

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

    <div className="
      bg-white
      rounded-2xl
      overflow-hidden
      shadow-sm
      hover:shadow-xl
      transition
      duration-300
      group
    ">

      {/* IMAGE */}

      <div className="
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
              h-52
              md:h-60
              object-cover
              group-hover:scale-105
              transition
              duration-500
            "
          />

        </Link>

        {/* DISCOUNT */}

        <div className="
          absolute
          top-3
          left-3
          bg-red-500
          text-white
          text-xs
          font-bold
          px-3
          py-1
          rounded-full
        ">

          SALE

        </div>

        {/* WISHLIST */}

        <button

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

        </button>

      </div>

      {/* CONTENT */}

      <div className="
        p-4
      ">

        {/* RATING */}

        <div className="
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

        </div>

        {/* NAME */}

        <Link
          href={`/product/${id}`}
        >

          <h3 className="
            font-semibold
            text-base
            md:text-lg
            line-clamp-2
            min-h-[52px]
            hover:text-green-600
            transition
          ">

            {name}

          </h3>

        </Link>

        {/* PRICE */}

        <div className="
          flex
          items-center
          gap-3
          mt-3
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

            ₹{price + 300}

          </p>

        </div>

        {/* STOCK */}

        <p className="
          text-sm
          mt-2
          text-gray-500
        ">

          {stock > 0

            ? `${stock} in stock`

            : "Out of stock"

          }

        </p>

        {/* BUTTON */}

        <button

          disabled={
            stock <= 0
          }

          onClick={addToCart}

          className={`

            mt-4
            w-full
            flex
            items-center
            justify-center
            gap-2
            py-3
            rounded-xl
            font-semibold
            transition

            ${stock <= 0

              ? "bg-gray-300 text-gray-500"

              : "bg-green-600 hover:bg-green-700 text-white"

            }

          `}
        >

          <ShoppingCart size={18} />

          {stock <= 0

            ? "Out Of Stock"

            : "Add To Cart"

          }

        </button>

      </div>

    </div>

  );

}