"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function SellerAnalyticsPage() {

  const [totalOrders,setTotalOrders] =
    useState(0);

  const [totalSales,setTotalSales] =
    useState(0);

  const [totalCommission,setTotalCommission] =
    useState(0);

  const [netEarnings,setNetEarnings] =
    useState(0);

  const [loading,setLoading] =
    useState(true);

  const [chartData,setChartData] =
    useState<any[]>([]);

  useEffect(()=>{

    loadAnalytics();

  },[]);

  const loadAnalytics =
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

        let orders = 0;
        let sales = 0;
        let commission = 0;
        let earnings = 0;

        const monthly:any = {};

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

            orders++;

            sales +=
              order.finalTotal || 0;

            commission +=
              order.commission || 0;

            earnings +=
              order.sellerEarning || 0;

            let month = "Unknown";

            if(
              order.createdAt?.seconds
            ){

              month =
                new Date(
                  order.createdAt.seconds *
                  1000
                ).toLocaleString(
                  "en-US",
                  {
                    month:"short"
                  }
                );

            }

            if(!monthly[month]){

              monthly[month] = {

                month,

                sales:0,

                commission:0,

                earnings:0,

              };

            }

            monthly[month].sales +=
              order.finalTotal || 0;

            monthly[month].commission +=
              order.commission || 0;

            monthly[month].earnings +=
              order.sellerEarning || 0;

          }

        });

        setTotalOrders(
          orders
        );

        setTotalSales(
          sales
        );

        setTotalCommission(
          commission
        );

        setNetEarnings(
          earnings
        );

        setChartData(
          Object.values(
            monthly
          )
        );

      }catch(error){

        console.log(error);

      }finally{

        setLoading(false);

      }

    };

  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">
        Loading Analytics...
      </div>

    );

  }

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
            Seller Analytics
          </h1>

          <p>
            Revenue & Earnings Overview
          </p>

        </div>

        <div className="
          grid
          grid-cols-1
          md:grid-cols-2
          lg:grid-cols-4
          gap-6
          mb-8
        ">

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>📦 Orders</h3>
            <p className="
              text-3xl
              font-bold
            ">
              {totalOrders}
            </p>
          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>💰 Sales</h3>
            <p className="
              text-3xl
              font-bold
              text-green-600
            ">
              ₹{totalSales}
            </p>
          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>🏦 Commission</h3>
            <p className="
              text-3xl
              font-bold
              text-orange-600
            ">
              ₹{totalCommission}
            </p>
          </div>

          <div className="
            bg-white
            p-6
            rounded-2xl
            shadow
          ">
            <h3>💵 Net Earnings</h3>
            <p className="
              text-3xl
              font-bold
              text-blue-600
            ">
              ₹{netEarnings}
            </p>
          </div>

        </div>

        <div className="
          bg-white
          p-6
          rounded-3xl
          shadow
        ">

          <h2 className="
            text-2xl
            font-bold
            mb-6
          ">
            Monthly Performance
          </h2>

          <div
            style={{
              width:"100%",
              height:400
            }}
          >

            <ResponsiveContainer>

              <BarChart
                data={chartData}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  dataKey="month"
                />

                <YAxis />

                <Tooltip />

                <Bar
                  dataKey="sales"
                  name="Sales"
                />

                <Bar
                  dataKey="commission"
                  name="Commission"
                />

                <Bar
                  dataKey="earnings"
                  name="Earnings"
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>

      </div>

    </div>

  );

}