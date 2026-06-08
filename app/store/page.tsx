"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function StoresPage() {

  const [stores,setStores] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    const loadStores =
      async ()=>{

      try{

        const snap =
          await getDocs(
            collection(
              db,
              "vendors"
            )
          );

       const data =
  snap.docs
    .map((doc)=>({
      id: doc.id,
      ...doc.data()
    }))
    .filter(
      (vendor:any)=>
        vendor.status ===
        "Approved"
    );

        setStores(data);

      }catch(error){

        console.log(error);

      }finally{

        setLoading(false);

      }

    };

    loadStores();

  },[]);

  return (

   <div className="
  min-h-screen
  bg-gradient-to-br
  from-green-50
  via-white
  to-blue-50
">

      <div className="max-w-7xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-4">
          All Stores
        </h1>

        <p className="text-center text-gray-600 mb-12">
          Explore stores and discover products from trusted vendors.
        </p>
        <p className="
  text-center
  text-green-600
  font-semibold
  mb-10
">
  {stores.length} Stores Available
</p>

        {loading && (

          <p className="text-center">
            Loading stores...
          </p>

        )}

        {!loading && stores.length === 0 && (

          <p className="text-center text-gray-500">
            No stores found.
          </p>

        )}

        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            lg:grid-cols-3
            gap-8
          "
        >

          {stores.map((store:any)=>(

            <div
              key={store.id}
              className="
                bg-white
                p-8
                rounded-2xl
                shadow
                hover:shadow-xl
                transition
              "
            >

              <div className="
  flex
  items-center
  gap-4
  mb-4
">

  <img
    src={
      store.logo ||
      "/user.png"
    }
    alt=""
    className="
      w-16
      h-16
      rounded-full
      object-cover
      border
    "
  />

  <div>

    <h2
      className="
        text-2xl
        font-bold
      "
    >
      {store.businessName}
    </h2>

    <p className="
      text-sm
      text-gray-500
    ">
      Verified Seller
    </p>

  </div>

</div>

              <p className="text-gray-600 mb-2">
                Owner:
                {" "}
                {store.fullName}
              </p>

              <p className="text-gray-600 mb-2">
                {store.city},
                {" "}
                {store.state}
              </p>

              <p className="text-gray-600 mb-6">
                Vendor Verified Seller
              </p>

              <span className="
  inline-block
  bg-green-100
  text-green-700
  px-3
  py-1
  rounded-full
  text-sm
  font-semibold
  mb-3
">
  Verified Store
</span>

<span className="
  inline-block
  bg-yellow-100
  text-yellow-700
  px-3
  py-1
  rounded-full
  text-sm
  font-semibold
  ml-2
">
  ⭐ 4.8
</span>

              <Link
                href={`/store/${store.uid}`}
                className="
                  inline-block
                 bg-gradient-to-r
from-green-600
to-blue-600
hover:from-green-500
hover:to-blue-500
                  text-white
                  px-5
                  py-3
                  rounded-xl
                  font-semibold
                "
              >
                Visit Store
              </Link>

            </div>

          ))}

        </div>

      </div>

    </div>

  );

}