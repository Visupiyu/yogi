"use client";

import { useEffect,useState }
from "react";

import Link from "next/link";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

export default function TopVendors(){

  const [vendors,setVendors] =
    useState([]);

  useEffect(()=>{

    const fetchVendors =
    async()=>{

      try{

        const snapshot =
        await getDocs(
          collection(db,"vendors")
        );

        const items = [];

        snapshot.forEach((doc)=>{

          items.push({
            id:doc.id,
            ...doc.data(),
          });

        });

        setVendors(items);

      }catch(error){

  console.error(
    "Vendor Fetch Error:",
    error
  );

}
    };

    fetchVendors();

  },[]);

  return(

    <section className="
      py-4
      px-4
      bg-gray-50
    ">

      <div className="
  max-w-7xl
  mx-auto
  px-4
">

        <div className="
          flex
          justify-between
          items-center
          mb-2
        ">

          <h2 className="
            text-2xl md:text-3xl
            font-bold
          ">
            Top Vendors
          </h2>

        </div>

        <div className="
          grid
          grid-cols-1
          sm:grid-cols-2
          md:grid-cols-3
          lg:grid-cols-4
          gap-*
        ">

          {vendors.map((vendor)=>(

            <Link
              key={vendor.id}
              href={`/vendor/${vendor.id}`}
            >

             <div className="
  bg-gradient-to-br
  from-white
  to-green-50
  rounded-2xl
  shadow-md
                overflow-hidden
                hover:shadow-xl
                transition
                duration-300
              ">

                <div className="
                  h-24
                  bg-gradient-to-r
                  from-green-400
                  to-green-600
                ">

                </div>

                <div className="
                  p-4
                  text-center
                ">

                  <div className="
                    w-16
                    h-16
                    rounded-full
                    bg-gray-200
                    mx-auto
                    -mt-*
                    border-4
                    border-white
                    overflow-hidden
                  ">

                    <img
                      src={
                        vendor.logo ||
                        "/user.png"
                      }
                      alt=""
                      className="
                        w-full
                        h-full
                        object-cover
                      "
                    />

                  </div>

                  <h3 className="
                    mt-3
                    font-bold
                    text-base md:text-lg
                  ">
                    {vendor.shopName}
                  </h3>

                  <p className="
                    text-gray-500
                    text-sm
                    mt-1
                  ">
                    Trusted Seller
                  </p>

                  <button className="
                    mt-3
                    bg-green-600
                    text-white
                    px-4
                    py-4
                   rounded-xl
                    hover:bg-green-700
                  ">
                    Visit Store
                  </button>

                </div>

              </div>

            </Link>

          ))}

        </div>

      </div>

    </section>

  );

}