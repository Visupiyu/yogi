"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

export default function StorePage() {

  const params =
    useParams();

  const [products, setProducts] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [vendorName, setVendorName] =
    useState("");

  useEffect(() => {

    const fetchStore =
    async () => {

      try {

        const q = query(

          collection(
            db,
            "products"
          ),

          where(
            "vendorId",
            "==",
            params.id)

        );

        const snapshot =
          await getDocs(q);

        const items:any[] = [];

        snapshot.forEach((doc) => {

          const data =
            doc.data();

          items.push({

            id: doc.id,

            ...data,

          });

        });

        setProducts(items);

        if(items.length > 0){

          setVendorName(
            items[0].vendorName
            || "Vendor Store"
          );

        }

      } catch (error) {

        console.log(error);

      }

      setLoading(false);

    };

    if(params?.id){

      fetchStore();

    }

  }, [params]);

  if(loading){

    return(

      <div className="
        py-20
        text-center
      ">
        Loading store...
      </div>

    );

  }

  return (

    <section className="
      py-10
      px-4
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        {/* STORE HEADER */}

        <div className="
          bg-gradient-to-r
          from-green-500
          to-green-700
          rounded-3xl
          p-10
          text-white
          mb-10
        ">

          <p className="
            uppercase
            tracking-widest
            text-sm
            opacity-80
          ">
            Vendor Store
          </p>

          <h1 className="
            text-5xl
            font-bold
            mt-3
          ">
            {vendorName}
          </h1>

          <p className="
            mt-4
            text-lg
            opacity-90
          ">
            Browse products from this seller
          </p>

        </div>

        {/* PRODUCTS */}

        {products.length === 0 ? (

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
              No products found
            </p>

          </div>

        ) : (

          <div className="
            grid
            grid-cols-2
            md:grid-cols-3
            lg:grid-cols-4
            gap-6
          ">

            {products.map(
              (
                product:any,
                index:number
              ) => (

              <Link
                key={index}
                href={`/product/${product.id}`}
              >

                <div className="
                  bg-white
                  rounded-3xl
                  shadow-md
                  overflow-hidden
                  hover:shadow-xl
                  transition
                  duration-300
                ">

                  <img
                    src={
                      product.image ||
                      "/no-image.png"
                    }
                    alt={product.name}
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
                      {product.name}
                    </h2>

                    <p className="
                      text-green-600
                      font-bold
                      text-2xl
                      mt-3
                    ">
                      ₹{product.price}
                    </p>

                    {product.stock > 0 ? (

                      <p className="
                        text-green-600
                        text-sm
                        mt-2
                      ">
                        In Stock
                      </p>

                    ) : (

                      <p className="
                        text-red-500
                        text-sm
                        mt-2
                      ">
                        Out Of Stock
                      </p>

                    )}

                  </div>

                </div>

              </Link>

            ))}

          </div>

        )}

      </div>

    </section>

  );

}