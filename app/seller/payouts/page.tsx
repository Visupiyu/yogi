"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
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

        // Orders are Firestore-rules-scoped to vendorIds containing the
        // signed-in seller's auth uid — a full collection scan is both
        // denied by the rules and unnecessary.
        const ordersSnapshot =
          await getDocs(
            query(
              collection(db, "orders"),
              where("vendorIds", "array-contains", vendor.uid)
            )
          );

        let totalSales = 0;
        let totalCommission = 0;
        let totalNet = 0;

        ordersSnapshot.forEach((doc)=>{

          const order:any =
            doc.data();

          if (order.status === "Cancelled") return;

          const vendorItems =
            order.items?.filter(
              (item:any)=>

                // order items store the seller's auth uid, not the
                // vendors-collection document id
                item.vendorId ===
                vendor.uid

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

        // "Paid Payout" reflects withdrawal requests this seller can
        // actually see the status of (the vendor_payouts admin ledger
        // is admin-only and not readable here).
        const withdrawalsSnapshot =
          await getDocs(
            query(
              collection(db, "withdrawals"),
              where("vendorEmail", "==", vendor.email)
            )
          );

        let totalPaid = 0;

        withdrawalsSnapshot.forEach((doc)=>{

          const withdrawal:any = doc.data();

          if (withdrawal.status === "Paid") {
            totalPaid += Number(withdrawal.amount || 0);
          }

        });

        setPaidPayout(totalPaid);

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