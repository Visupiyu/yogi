"use client";

import { useEffect, useState } from "react";

import {
  collection,
  addDoc,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminCouponsPage(){

  const [code,setCode] =
    useState("");

  const [discount,setDiscount] =
    useState("");

  const [coupons,setCoupons] =
    useState<any[]>([]);
    const [search,setSearch] =
  useState("");

  const loadCoupons =
    async ()=>{

    const snapshot =
      await getDocs(
        collection(
          db,
          "coupons"
        )
      );

    const items:any[] = [];

    snapshot.forEach((doc)=>{

      items.push({

        id:doc.id,

        ...doc.data()

      });

    });

    setCoupons(items);

  };

  useEffect(()=>{

    loadCoupons();

  },[]);

  const createCoupon =
    async ()=>{

    if(
      !code ||
      !discount
    ){

      alert(
        "Fill all fields"
      );

      return;

    }
    if(

  Number(discount) <= 0 ||

  Number(discount) > 100

){

  alert(
    "Discount must be between 1 and 100"
  );

  return;

}

const exists = coupons.find(
  (coupon)=>
    coupon.code ===
    code.toUpperCase()
);

if(exists){

  alert(
    "Coupon already exists"
  );

  return;

}

    await addDoc( 
            collection(
        db,
        "coupons"
      ),
     {

        code:
          code.toUpperCase(),

        discount:
          Number(discount),

          
        active:true,

        createdAt:
          new Date()
          

      }

    );

    setCode("");

    setDiscount("");

    loadCoupons();

  };

  return (

    <div className="min-h-screen p-8 bg-gray-100">

      <div className="
  bg-gradient-to-r
  from-green-600
  to-blue-600
  text-white
  p-8
  rounded-3xl
  mb-8
">

  <h1 className="
    text-4xl
    font-bold
  ">
    Coupon Management
  </h1>

  <p className="opacity-90">
    Create and manage marketplace discount coupons
  </p>

</div>

      <p className="mb-6 text-gray-600">

  Total Coupons:
  {" "}
  {coupons.length}

</p>
<input
  type="text"
  placeholder="Search Coupon..."
  value={search}
  onChange={(e)=>
    setSearch(e.target.value)
  }
  className="
    w-full
    border
    p-4
    rounded-2xl
    mb-6
  "
/>

      <div className="
        bg-white
        p-6
        rounded-2xl
        shadow
        mb-8
      ">

        <input
          placeholder="Coupon Code"
          value={code}
          onChange={(e)=>
            setCode(
              e.target.value
            )
          }
          className="
            border
            p-3
            rounded-lg
            mr-3
          "
        />

        <input
          placeholder="Discount %"
          value={discount}
          onChange={(e)=>
            setDiscount(
              e.target.value
            )
          }
          className="
            border
            p-3
            rounded-lg
            mr-3
          "
        />

        <button
          onClick={
            createCoupon
          }
          className="
           bg-gradient-to-r
from-green-600
to-blue-600
            text-white
            px-5
            py-3
            rounded-lg
          "
        >
          Create Coupon
        </button>

      </div>

      <div className="
        bg-white
        p-6
        rounded-2xl
        shadow
      ">

        <table className="w-full">

          <thead>

            <tr>

              <th>
                Code
              </th>

              <th>
                Discount
              </th>

              <th>
                Status
              </th>

            </tr>

          </thead>

       {coupons.length === 0 && (

  <tr>

    <td
      colSpan={3}
      className="
        text-center
        py-10
        text-gray-500
      "
    >

      No Coupons Found

    </td>

  </tr>

)}

          <tbody>

           {coupons
  .filter((coupon)=>

    coupon.code
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

  )
  .map(
    (coupon)=>(
              <tr
                key={coupon.id}
              >

                <td>
                  {coupon.code}
                </td>

                <td>
                  {coupon.discount}%
                </td>

                <td>

  <span
    className={`
      px-3
      py-1
      rounded-full
      text-sm
      font-semibold

      ${
        coupon.active
        ? "bg-green-100 text-green-700"
        : "bg-red-100 text-red-700"
      }
    `}
  >

    {
      coupon.active
      ? "Active"
      : "Inactive"
    }

  </span>

</td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}