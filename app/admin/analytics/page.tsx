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
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
} from "recharts";

interface AnalyticsStats {
  revenue: number;
  orders: number;
  vendors: number;
  customers: number;
  averageOrderValue: number;
}

export default function AdminAnalyticsPage() {

  const [loading, setLoading] =
    useState(true);

  const [stats, setStats] =
    useState<AnalyticsStats>({
      revenue: 0,
      orders: 0,
      vendors: 0,
      customers: 0,
      averageOrderValue: 0,
    });

    const [monthlyData, setMonthlyData] =
  useState([
    { month: "Jan", revenue: 0, orders: 0 },
    { month: "Feb", revenue: 0, orders: 0 },
    { month: "Mar", revenue: 0, orders: 0 },
    { month: "Apr", revenue: 0, orders: 0 },
    { month: "May", revenue: 0, orders: 0 },
    { month: "Jun", revenue: 0, orders: 0 },
    { month: "Jul", revenue: 0, orders: 0 },
    { month: "Aug", revenue: 0, orders: 0 },
    { month: "Sep", revenue: 0, orders: 0 },
    { month: "Oct", revenue: 0, orders: 0 },
    { month: "Nov", revenue: 0, orders: 0 },
    { month: "Dec", revenue: 0, orders: 0 },
  ]);

  const [refundStats, setRefundStats] =
  useState<any[]>([]);

const [topProducts, setTopProducts] =
  useState<any[]>([]);

const [recentOrders, setRecentOrders] =
  useState<any[]>([]);

  const [topVendors, setTopVendors] =
  useState<any[]>([]);

  useEffect(() => {

    loadAnalytics();

  }, []);

  const loadAnalytics =
    async () => {

      try {

        const ordersSnapshot =
          await getDocs(
            collection(
              db,
              "orders"
            )
          );

        const vendorsSnapshot =
          await getDocs(
            collection(
              db,
              "vendors"
            )
          );

        const usersSnapshot =
          await getDocs(
            collection(
              db,
              "users"
            )
          );

          const returnsSnapshot =
  await getDocs(
    collection(
      db,
      "returns"
    )
  );

        let revenue = 0;

        ordersSnapshot.forEach(
          (docSnap) => {

            const order: any =
              docSnap.data();

            revenue += Number(
              order.finalTotal || 0
            );

          }
        );

        const totalOrders =
          ordersSnapshot.size;

          const monthly = [
  { month: "Jan", revenue: 0, orders: 0 },
  { month: "Feb", revenue: 0, orders: 0 },
  { month: "Mar", revenue: 0, orders: 0 },
  { month: "Apr", revenue: 0, orders: 0 },
  { month: "May", revenue: 0, orders: 0 },
  { month: "Jun", revenue: 0, orders: 0 },
  { month: "Jul", revenue: 0, orders: 0 },
  { month: "Aug", revenue: 0, orders: 0 },
  { month: "Sep", revenue: 0, orders: 0 },
  { month: "Oct", revenue: 0, orders: 0 },
  { month: "Nov", revenue: 0, orders: 0 },
  { month: "Dec", revenue: 0, orders: 0 },
];

ordersSnapshot.forEach((docSnap) => {

  const order: any =
    docSnap.data();

  if (order.createdAt?.seconds) {

    const date =
      new Date(
        order.createdAt.seconds * 1000
      );

    const month =
      date.getMonth();

    monthly[month].revenue +=
      Number(
        order.finalTotal || 0
      );

    monthly[month].orders += 1;

  }

});

setMonthlyData(monthly);

const pendingRefunds =
  returnsSnapshot.docs.filter(
    (doc:any)=>
      doc.data().status ===
      "Pending"
  ).length;

const approvedRefunds =
  returnsSnapshot.docs.filter(
    (doc:any)=>
      doc.data().status ===
      "Approved"
  ).length;

const refundedOrders =
  returnsSnapshot.docs.filter(
    (doc:any)=>
      doc.data().status ===
      "Refunded"
  ).length;

setRefundStats([
  {
    name:"Pending",
    value:pendingRefunds,
  },
  {
    name:"Approved",
    value:approvedRefunds,
  },
  {
    name:"Refunded",
    value:refundedOrders,
  },
]);

const productSales:any = {};

ordersSnapshot.forEach(
  (docSnap)=>{

    const order:any =
      docSnap.data();

    if(order.items){

      order.items.forEach(
        (item:any)=>{

          if(
            !productSales[
              item.name
            ]
          ){

            productSales[
              item.name
            ] = 0;

          }

          productSales[
            item.name
          ] += item.qty || 0;

        }
      );

    }

  }
);

setTopProducts(

  Object.entries(
    productSales
  )

  .map(
    ([name,qty])=>({
      name,
      qty,
    })
  )

  .sort(
    (a:any,b:any)=>
      b.qty-a.qty
  )

  .slice(0,5)

);

const vendorSales:any = {};

ordersSnapshot.forEach(
  (docSnap)=>{

    const order:any =
      docSnap.data();

    if(order.items){

      order.items.forEach(
        (item:any)=>{

          const vendor =
            item.vendorName ||
            "Unknown Vendor";

          if(
            !vendorSales[vendor]
          ){

            vendorSales[vendor] = {

              revenue:0,

              orders:0,

            };

          }

          vendorSales[vendor]
            .revenue +=

            Number(
              item.price || 0
            ) *

            Number(
              item.qty || 0
            );

          vendorSales[vendor]
            .orders +=
            Number(
              item.qty || 0
            );

        }
      );

    }

  }
);

setTopVendors(

  Object.entries(
    vendorSales
  )

  .map(
    ([name,data]:any)=>({

      name,

      revenue:
        data.revenue,

      orders:
        data.orders,

    })
  )

  .sort(
    (a,b)=>
      b.revenue -
      a.revenue
  )

  .slice(0,5)

);

setRecentOrders(

  ordersSnapshot.docs

  .slice(-5)

  .map((doc)=>({

    id:doc.id,

    ...(doc.data() as any),

  }))

);

        setStats({

          revenue,

          orders:
            totalOrders,

          vendors:
            vendorsSnapshot.size,

          customers:
            usersSnapshot.size,

          averageOrderValue:

            totalOrders > 0
              ? revenue /
                totalOrders
              : 0,

        });

      } catch (error) {

        console.log(error);

      } finally {

        setLoading(false);

      }

    };

  if (loading) {

    return (

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
      ">

        <div className="
          text-xl
          font-semibold
        ">
          Loading Analytics...
        </div>

      </div>

    );

  }

  return (

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
          from-indigo-600
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
            Admin Analytics
          </h1>

          <p className="
            mt-2
            opacity-90
          ">
            Marketplace Performance Overview
          </p>

        </div>

        <div className="
          grid
          grid-cols-1
          md:grid-cols-2
          xl:grid-cols-5
          gap-6
        ">

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
              text-sm
            ">
              Total Revenue
            </p>

            <h2 className="
              text-3xl
              font-bold
              mt-2
              text-green-600
            ">
              ₹
              {stats.revenue.toLocaleString()}
            </h2>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
              text-sm
            ">
              Total Orders
            </p>

            <h2 className="
              text-3xl
              font-bold
              mt-2
            ">
              {stats.orders}
            </h2>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
              text-sm
            ">
              Total Vendors
            </p>

            <h2 className="
              text-3xl
              font-bold
              mt-2
            ">
              {stats.vendors}
            </h2>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
              text-sm
            ">
              Total Customers
            </p>

            <h2 className="
              text-3xl
              font-bold
              mt-2
            ">
              {stats.customers}
            </h2>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
              text-sm
            ">
              Avg Order Value
            </p>

            <h2 className="
              text-3xl
              font-bold
              mt-2
              text-blue-600
            ">
              ₹
              {Math.round(
                stats.averageOrderValue
              ).toLocaleString()}
            </h2>

          </div>

          <div
  className="
    grid
    grid-cols-1
    lg:grid-cols-2
    gap-6
    mt-8
  "
>

  <div
    className="
      bg-white
      rounded-3xl
      p-6
      shadow
      h-[400px]
    "
  >

    <h2
      className="
        text-xl
        font-bold
        mb-4
      "
    >
      Monthly Revenue
    </h2>

    <ResponsiveContainer
      width="100%"
      height="100%"
    >

      <BarChart
        data={monthlyData}
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
          dataKey="revenue"
        />

      </BarChart>

    </ResponsiveContainer>

  </div>

  <div
    className="
      bg-white
      rounded-3xl
      p-6
      shadow
      h-[400px]
    "
  >

    <h2
      className="
        text-xl
        font-bold
        mb-4
      "
    >
      Monthly Orders
    </h2>

    <ResponsiveContainer
      width="100%"
      height="100%"
    >

      <BarChart
        data={monthlyData}
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
          dataKey="orders"
        />

      </BarChart>

    </ResponsiveContainer>

  </div>

</div>

<div
  className="
    bg-white
    rounded-3xl
    p-6
    shadow
    mt-8
  "
>

  <h2
    className="
      text-xl
      font-bold
      mb-6
    "
  >
    Refund Statistics
  </h2>

  <div
    className="
      h-[350px]
    "
  >

    <ResponsiveContainer
      width="100%"
      height="100%"
    >

      <PieChart>

        <Pie
          data={refundStats}
          dataKey="value"
          nameKey="name"
          outerRadius={120}
        />

        <Tooltip />

      </PieChart>

    </ResponsiveContainer>

  </div>

</div>

<div
  className="
    bg-white
    rounded-3xl
    shadow
    p-6
    mt-8
  "
>

  <h2
    className="
      text-xl
      font-bold
      mb-4
    "
  >
    Top Selling Products
  </h2>

  <table
    className="
      w-full
    "
  >

    <thead>

      <tr>

        <th
          className="
            text-left
            py-3
          "
        >
          Product
        </th>

        <th
          className="
            text-left
          "
        >
          Sold
        </th>

      </tr>

    </thead>

    <tbody>

      {topProducts.map(
        (product:any)=>(
          <tr
            key={product.name}
            className="
              border-t
            "
          >

            <td
              className="
                py-3
              "
            >
              {product.name}
            </td>

            <td>
              {product.qty}
            </td>

          </tr>
        )
      )}
      

    </tbody>

  </table>

</div>
<div
  className="
    bg-white
    rounded-3xl
    shadow
    p-6
    mt-8
  "
>

  <h2
    className="
      text-xl
      font-bold
      mb-4
    "
  >
    Top Vendors
  </h2>

  <div
    className="
      overflow-x-auto
    "
  >

    <table
      className="
        w-full
      "
    >

      <thead>

        <tr>

          <th
            className="
              text-left
              py-3
            "
          >
            Vendor
          </th>

          <th
            className="
              text-left
            "
          >
            Orders
          </th>

          <th
            className="
              text-left
            "
          >
            Revenue
          </th>

        </tr>

      </thead>

      <tbody>

        {topVendors.map(
          (vendor:any)=>(

            <tr
              key={vendor.name}
              className="
                border-t
              "
            >

              <td
                className="
                  py-3
                "
              >
                {vendor.name}
              </td>

              <td>
                {vendor.orders}
              </td>

              <td>
                ₹
                {vendor.revenue.toLocaleString()}
              </td>

            </tr>

          )
        )}

      </tbody>

    </table>

  </div>

</div>


<div
  className="
    bg-white
    rounded-3xl
    shadow
    p-6
    mt-8
  "
>

  <h2
    className="
      text-xl
      font-bold
      mb-4
    "
  >
    Recent Orders
  </h2>

  <table
    className="
      w-full
    "
  >

    <thead>

      <tr>

        <th className="text-left py-3">
          Customer
        </th>

        <th className="text-left">
          Amount
        </th>

        <th className="text-left">
          Status
        </th>

      </tr>

    </thead>

    <tbody>

      {recentOrders.map(
        (order:any)=>(
          <tr
            key={order.id}
            className="
              border-t
            "
          >

            <td
              className="
                py-3
              "
            >
              {order.customerName}
            </td>

            <td>
              ₹{order.finalTotal}
            </td>

            <td>
              {order.status}
            </td>

          </tr>
        )
      )}

    </tbody>

  </table>

</div>


        </div>

      </div>

    </div>

  );

}