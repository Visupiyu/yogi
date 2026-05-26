"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

export default function WishlistPage() {

  const [wishlist, setWishlist] =
    useState<any[]>([]);

  /* LOAD WISHLIST */

  useEffect(() => {

    const storedWishlist =
      JSON.parse(
        localStorage.getItem(
          "wishlist"
        ) || "[]"
      );

    setWishlist(storedWishlist);

  }, []);

  /* REMOVE ITEM */

  const removeItem = (
    index: number
  ) => {

    const updatedWishlist =
      wishlist.filter(
        (_: any, i: number) =>
          i !== index
      );

    setWishlist(updatedWishlist);

    localStorage.setItem(
      "wishlist",
      JSON.stringify(updatedWishlist)
    );

    window.dispatchEvent(
      new Event("wishlistUpdated")
    );

  };

  /* MOVE TO CART */

  const moveToCart = (
    item: any
  ) => {

    const cart =
      JSON.parse(
        localStorage.getItem(
          "cart"
        ) || "[]"
      );

    const exists =
      cart.findIndex(
        (cartItem: any) =>
          cartItem.id === item.id
      );

    if (exists > -1) {

      if(

  cart[exists].qty <

  item.stock

){

  cart[exists].qty += 1;

}

    } else {

      cart.push({

        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image || "",
        qty: 1,
        vendorId:
  item.vendorId,

stock:
  item.stock,

      });

    }

    localStorage.setItem(
      "cart",
      JSON.stringify(cart)
    );

    window.dispatchEvent(
      new Event("cartUpdated")
    );

    alert("Added to cart");

  };

  return (

    <section className="
      py-10
      px-4
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <h1 className="
          text-4xl
          font-bold
          mb-10
        ">
          My Wishlist
        </h1>

        {wishlist.length === 0 ? (

          <div className="
            bg-white
            rounded-3xl
            shadow-md
            p-10
            text-center
          ">

            <p className="
              text-gray-500
              text-lg
            ">
              Your wishlist is empty
            </p>

            <Link href="/">

              <button className="
                mt-6
                bg-green-600
                hover:bg-green-700
                text-white
                px-6
                py-3
                rounded-xl
                font-semibold
              ">
                Continue Shopping
              </button>

            </Link>

          </div>

        ) : (

          <div className="
            grid
            grid-cols-1
            sm:grid-cols-2
            lg:grid-cols-3
            xl:grid-cols-4
            gap-6
          ">

            {wishlist.map(
              (
                item: any,
                index: number
              ) => (

              <div
                key={index}
                className="
                  bg-white
                  rounded-3xl
                  shadow-md
                  overflow-hidden
                "
              >

                <img
                  src={
                    item.image ||
                    "/no-image.png"
                  }
                  alt={item.name}
                  className="
                    w-full
                    h-60
                    object-cover
                  "
                />

                <div className="p-5">

                  <h2 className="
                    text-lg
                    font-bold
                    line-clamp-2
                    min-h-[56px]
                  ">
                    {item.name}
                  </h2>

                  <p className="
                    text-green-600
                    font-bold
                    text-2xl
                    mt-3
                  ">
                    ₹{item.price}
                  </p>

                  {/* BUTTONS */}

                  <div className="
                    mt-5
                    flex
                    flex-col
                    gap-3
                  ">

                    <button
                    disabled={
    item.stock <= 0
  }
                      onClick={() =>
                        moveToCart(item)
                      }
                      className="
                        bg-green-600
                        hover:bg-green-700
                        text-white
                        py-3
                        rounded-xl
                        font-semibold
                        transition
                      "
                    >
                      Move To Cart
                    </button>

                    <button
                      onClick={() =>
                        removeItem(index)
                      }
                     className={`
                     text-white
                     py-3
                     rounded-xl
                     font-semibold
                      transition

                     ${ item.stock <= 0 ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                       }
                      `}
                    >
                      Remove
                    </button>

                  </div>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </section>

  );

}