"use client";

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
import { computeVendorShare } from "@/lib/vendorEarnings";

export default function SellerPayoutsPage() {

  const router = useRouter();

  const [sales,setSales] =
    useState(0);

  const [commission,setCommission] =
    useState(0);

  const [netEarnings,setNetEarnings] =
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

        // Orders are Firestore-rules-scoped to vendorIds containing the
        // signed-in seller's auth uid — a full collection scan is both
        // denied by the rules and unnecessary.
        const ordersSnapshot =
          await getDocs(
            query(
              collection(db, "orders"),
              where("vendorIds", "array-contains", vendorUid),
              // Sellers must never see a Pending order: it belongs to them only once
              // an admin confirms it. firestore.rules enforces this on the orders
              // read rule, and the rules engine REJECTS this entire query unless it
              // carries a filter proving the constraint - an unfiltered
              // array-contains query returns permission-denied. Load-bearing, not
              // cosmetic. Needs the orders vendorIds+status composite index.
              where("status", "!=", "Pending")
            )
          );

        let totalSales = 0;
        let totalCommission = 0;
        let totalNet = 0;

        ordersSnapshot.forEach((doc)=>{

          const order:any =
            doc.data();

          // Same eligibility gate app/seller/wallet/page.tsx applies, so the
          // two seller-facing figures agree. This page previously counted
          // every non-Cancelled order — Pending, Packed, Shipped and unpaid
          // Pay-on-Delivery included — which reported a larger "Payout
          // Report" than the seller could ever withdraw.
          //
          // Delivered AND Paid are both required because the two payment
          // methods reach them in opposite order: a Pay-on-Delivery order is
          // Delivered before the customer transfers, a Razorpay order is Paid
          // long before it ships. Either alone would count money not received
          // or goods not delivered. This also subsumes the old Cancelled
          // check — a Cancelled order can never satisfy it.
          //
          // needsReview marks an order that was PAID but could not be
          // fulfilled as priced (short stock, a coupon already spent, a moved
          // reward balance — see lib/onlineOrder.ts). Its items[] still carry
          // the full requested quantities, so computeVendorShare() would
          // credit units that were never in stock. Excluded until an admin
          // resolves the flag in app/admin/orders.
          if (
            order.status !== "Delivered" ||
            order.paymentStatus !== "Paid" ||
            order.needsReview === true
          )
            return;

          const share = computeVendorShare(order, vendorUid);

          if (share) {

            totalSales +=
              share.vendorRawSubtotal;

            totalCommission +=
              share.vendorCommission;

            totalNet +=
              share.vendorEarning;

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

        const withdrawalsSnapshot =
          await getDocs(
            query(
              collection(db, "withdrawals"),
              where("vendorEmail", "==", vendorEmail)
            )
          );

        let totalPaid = 0;

        withdrawalsSnapshot.forEach((doc)=>{

          const withdrawal:any = doc.data();

          if (withdrawal.status === "Paid") {
            totalPaid += Number(withdrawal.amount || 0);
          }

        });

        // Admin can also settle a seller directly from app/admin/payouts,
        // bypassing the withdrawal-request flow entirely — that ledger
        // used to be invisible here, undercounting what's actually paid.
        const payoutsSnapshot =
          await getDocs(
            query(
              collection(db, "vendor_payouts"),
              where("vendorId", "==", vendorUid)
            )
          );

        payoutsSnapshot.forEach((doc) => {
          totalPaid += Number(doc.data().amount || 0);
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
            <h3>Total Earnings</h3>
            <p className="
              text-3xl
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