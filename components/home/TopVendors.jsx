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
          gap-3
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
 rounded-3xl
shadow-md
hover:shadow-2xl
                overflow-hidden
                hover:shadow-xl
                transition
                duration-300
              ">

                <div className="
  h-28
  bg-gradient-to-r
  from-green-500
  via-blue-500
  to-purple-600
">

                </div>

                <div className="
                  p-4
                  text-center
                ">

                 <div className="
  w-20
  h-20
  rounded-full
  bg-gray-200
  mx-auto
  -mt-10
  border-4
  border-white
  overflow-hidden
  shadow-lg
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
  text-xs
  text-gray-400
  mt-1
">
  📍 {vendor.city || "India"}
</p>

                  <>
  <p className="
    text-gray-500
    text-sm
    mt-1
  ">
    Trusted Seller
  </p>

  <p className="
    text-yellow-500
    font-semibold
    text-sm
    mt-1
  ">
    ⭐ 4.8 Rating
  </p>
</>

                  <button className="
  mt-4
  w-full
  bg-gradient-to-r
  from-green-600
  to-blue-600
  text-white
  py-3
  rounded-xl
  font-semibold
  hover:from-green-500
  hover:to-blue-500
  transition
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