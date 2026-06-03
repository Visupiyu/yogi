"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import {
  doc,
  getDoc
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import Link from "next/link";

export default function ProductPage() {

  const params = useParams();

  const [product,setProduct] =
    useState<any>(null);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    async function loadProduct(){

      try{

        const snap =
          await getDoc(

            doc(
              db,
              "products",
              params.id as string
            )

          );

        if(
          snap.exists()
        ){

          setProduct({

            id:snap.id,

            ...snap.data()

          });

        }

      }catch(error){

        console.log(error);

      }finally{

        setLoading(false);

      }

    }

    if(params?.id){

      loadProduct();

    }

  },[params]);

  const addToCart = ()=>{

    const cart = JSON.parse(

      localStorage.getItem(
        "cart"
      ) || "[]"

    );

    const index = cart.findIndex(

      (item:any)=>

        item.id === product.id

    );

    if(index > -1){

      cart[index].qty += 1;

    }else{

      cart.push({

        id:product.id,

        name:product.name,

        price:product.price,

        image:product.image,

        stock:product.stock,

        qty:1

      });

    }

    localStorage.setItem(

      "cart",

      JSON.stringify(cart)

    );

    window.dispatchEvent(

      new Event(
        "cartUpdated"
      )

    );

    alert(
      "Added To Cart"
    );

  };

  const addToWishlist = ()=>{

    const wishlist = JSON.parse(

      localStorage.getItem(
        "wishlist"
      ) || "[]"

    );

    const exists = wishlist.find(

      (item:any)=>

        item.id === product.id

    );

    if(exists){

      alert(
        "Already In Wishlist"
      );

      return;

    }

    wishlist.push(product);

    localStorage.setItem(

      "wishlist",

      JSON.stringify(wishlist)

    );

    window.dispatchEvent(

      new Event(
        "wishlistUpdated"
      )

    );

    alert(
      "Added To Wishlist"
    );

  };

  if(loading){

    return(

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
      ">

        Loading Product...

      </div>

    );

  }

  if(!product){

    return(

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
      ">

        Product Not Found

      </div>

    );

  }

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-7xl
        mx-auto
        bg-white
        rounded-3xl
        shadow
        p-8
      ">

        <div className="
          grid
          md:grid-cols-2
          gap-10
        ">

          {/* IMAGE */}

          <div>

            <img
              src={
                product.image ||
                "/no-image.png"
              }
              alt={product.name}
              className="
                w-full
                rounded-2xl
                object-cover
              "
            />

          </div>

          {/* DETAILS */}

          <div>

            <h1 className="
              text-4xl
              font-bold
              mb-4
            ">

              {product.name}

            </h1>

            <p className="
              text-green-600
              text-3xl
              font-bold
              mb-4
            ">

              ₹{product.price}

            </p>

            <p className="
              text-gray-600
              mb-4
            ">

              Category:
              {" "}
              {product.category}
            </p>

            <p className="
              text-gray-600
              mb-6
            ">

              Stock:
              {" "}
              {product.stock}
            </p>

            <div className="
              flex
              gap-4
              mb-8
            ">

              <button

                onClick={addToCart}

                className="
                  bg-green-600
                  text-white
                  px-6
                  py-3
                  rounded-xl
                  font-bold
                "
              >

                Add To Cart

              </button>

              <button

                onClick={addToWishlist}

                className="
                  bg-pink-600
                  text-white
                  px-6
                  py-3
                  rounded-xl
                  font-bold
                "
              >

                Wishlist

              </button>

            </div>

            <Link
              href="/checkout"
              className="
                inline-block
                bg-blue-600
                text-white
                px-6
                py-3
                rounded-xl
                font-bold
              "
            >

              Buy Now

            </Link>

          </div>

        </div>

        {/* DESCRIPTION */}

        <div className="mt-12">

          <h2 className="
            text-2xl
            font-bold
            mb-4
          ">

            Product Description

          </h2>

          <p className="
            text-gray-700
            leading-8
          ">

            {
              product.description ||
              "No description available."
            }

          </p>

        </div>

        {/* REVIEWS */}

        <div className="mt-12">

          <h2 className="
            text-2xl
            font-bold
            mb-4
          ">

            Reviews & Ratings

          </h2>

          <p className="text-gray-500">

            Reviews feature coming soon.

          </p>

        </div>

        {/* RELATED PRODUCTS */}

        <div className="mt-12">

          <h2 className="
            text-2xl
            font-bold
            mb-4
          ">

            Related Products

          </h2>

          <p className="text-gray-500">

            Related products section coming soon.

          </p>

        </div>

      </div>

    </div>

  );

}