"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function SellerPayoutsPage() {

  const [sales,setSales] =
    useState(0);

  const [commission,setCommission] =
    useState(0);

  const [netEarnings,setNetEarnings] =
    useState(0);

  const [paidPayout,setPaidPayout] =
    useState(0);

  useEffect(()=>{

    loadPayouts();

  },[]);

  const loadPayouts =
    async()=>{

      try{

        const vendor =
          JSON.parse(
            localStorage.getItem(
              "vendor"
            ) || "{}"
          );

        const snapshot =
          await getDocs(
            collection(
              db,
              "orders"
            )
          );

        let totalSales = 0;
        let totalCommission = 0;
        let totalNet = 0;

        snapshot.forEach((doc)=>{

          const order:any =
            doc.data();

          const vendorItems =
            order.items?.filter(
              (item:any)=>

                item.vendorId ===
                vendor.id

            ) || [];

          if(vendorItems.length){

            totalSales +=
              order.finalTotal || 0;

            totalCommission +=
              order.commission || 0;

            totalNet +=
              order.sellerEarning || 0;

          }

        });

        setSales(
          totalSales
        );

        setCommission(
          totalCommission
        );

        setNetEarnings(
          totalNet
        );

      }catch(error){

        console.log(error);

      }

    };

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

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
            Payout Report
          </h1>

        </div>

        <div className="
          grid
          grid-cols-1
          md:grid-cols-4
          gap-6
        ">

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>Total Sales</h3>
            <p className="
              text-3xl
              font-bold
            ">
              ₹{sales}
            </p>
          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>Commission</h3>
            <p className="
              text-3xl
              font-bold
              text-orange-600
            ">
              ₹{commission}
            </p>
          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>Net Earnings</h3>
            <p className="
              text-3xl
              font-bold
              text-green-600
            ">
              ₹{netEarnings}
            </p>
          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>Paid Payout</h3>
            <p className="
              text-3xl
              font-bold
              text-blue-600
            ">
              ₹{paidPayout}
            </p>
          </div>

        </div>

      </div>

    </div>

  );

}