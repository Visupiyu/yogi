"use client";

import Link from "next/link";

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
        localStorage.getItem("wishlist") || "[]"
      );

    const exists = wishlist.find(
      (item:any)=> id === id
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
      new Event("wishlistUpdated")
    );

    alert("Added To Wishlist");

  };

  return (

    <div
      className="
        bg-white
        rounded-2xl
        shadow-md
        overflow-hidden
        hover:scale-105
        transition
        duration-300
      "
    >

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
      h-60
      object-cover
    "
  />

</Link>

      <div className="p-4">

        <Link href={`/product/${id}`}>

          <h3
            className="
              text-xl
              font-semibold
              mb-2
              cursor-pointer
            "
          >
            {name}
          </h3>

        </Link>

        <p
          className="
            text-green-600
            text-lg
            font-bold
            mb-4
          "
        >
          ₹{price}
        </p>

        <div className="flex gap-3">

          <Link
            href={`/product/${id}`}
            className="
              flex-1
              bg-blue-600
              text-white
              text-center
              py-2
              rounded-lg
            "
          >
            View
          </Link>

          <button

            onClick={addToWishlist}

            className="
              bg-pink-500
              text-white
              px-4
              rounded-lg
            "
          >
            ❤️
          </button>
   <button

  disabled={
    stock <= 0
  }

  className={`

    w-full
    py-3
    rounded-xl
    text-white
    font-semibold

    ${stock <= 0

      ? "bg-gray-400"

      : "bg-blue-600"

    }

  `}

  onClick={()=>{

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

    
window.dispatchEvent(
  new Event(
    "wishlistUpdated"
  )
);

    alert(
      "Added To Cart"
    );

  }}

>

  {stock <= 0

    ? "Out Of Stock"

    : "Add To Cart"

  }

</button>
        </div>

      </div>

    </div>

  );

}