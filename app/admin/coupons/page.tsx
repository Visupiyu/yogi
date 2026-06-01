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

      <h1 className="text-4xl font-bold mb-8">
        Coupon Management
      </h1>

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
            bg-green-600
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

          <tbody>

            {coupons.map(
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
                  {
                    coupon.active
                    ? "Active"
                    : "Inactive"
                  }
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  );

}