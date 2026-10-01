"use client";

import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { fetchSellerPayableBreakdown } from "@/lib/sellerPayableClient";

export default function SellerPayoutsPage() {

  const router = useRouter();

  const [sales,setSales] =
    useState(0);

  const [commission,setCommission] =
    useState(0);

  const [netEarnings,setNetEarnings] =
    useState(0);

  const [deliveryCharges,setDeliveryCharges] =
    useState(0);

  const [paidPayout,setPaidPayout] =
    useState(0);

  useEffect(()=>{

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      loadPayouts(user.uid, user.email || "");

    });

    return () => unsubscribe();

  },[router]);

  const loadPayouts =
    async(vendorUid: string, vendorEmail: string)=>{

      try{

        // Every figure comes from the server's single seller-payable
        // calculation (app/api/seller/payable -> lib/vendorPayable) — the
        // same one the wallet, the withdrawal request and admin settlement
        // use — instead of a second formula here that ignored delivery
        // charges and returns.
        void vendorUid;
        void vendorEmail;
        const b = await fetchSellerPayableBreakdown();
        if (!b) return;
        setSales(b.grossSales);
        setCommission(b.commission);
        setDeliveryCharges(b.sellerDeliveryCharges + b.returnLogisticsCharges);
        setNetEarnings(b.adjustedEarnings);
        setPaidPayout(b.paidOut);

      }catch(error){

        console.log(error);
      toast.error("Couldn't load this page's data. Please check your connection and refresh to try again.");
    }

    };

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-4 md:p-6
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
          p-5 md:p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-3xl md:text-4xl
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
              break-words text-3xl
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
              break-words text-3xl
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
            <h3>Delivery Charges</h3>
            <p className="
              break-words text-3xl
              font-bold
              text-orange-600
            ">
              ₹{deliveryCharges}
            </p>
            <p className="
              text-xs
              text-gray-500
              mt-1
            ">
              Your share of delivery on free-delivery orders.
            </p>
          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>Total Earnings</h3>
            <p className="
              break-words text-3xl
              font-bold
              text-green-600
            ">
              ₹{netEarnings}
            </p>
            <p className="
              text-xs
              text-gray-500
              mt-1
            ">
              Delivered and paid orders only.
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
              break-words text-3xl
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