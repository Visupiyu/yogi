"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Order = {

  id:string;

  customerName:string;

  total:number;

  status:string;

  createdAt:string;

};

export default function AdminOrdersPage(){

  const [orders,setOrders] =
    useState<Order[]>([]);

  const [loading,setLoading] =
    useState(true);
    const [search,setSearch] =
  useState("");

  useEffect(()=>{

    loadOrders();

  },[]);

  const loadOrders =
    async ()=>{

    try{

      const snapshot =
        await getDocs(
          collection(
            db,
            "orders"
          )
        );

      const items:any[] =
        [];

      snapshot.forEach(
        (docSnap)=>{

          const data =
            docSnap.data();

          items.push({

            id:docSnap.id,

            customerName:
              data.customerName ||
              "Customer",

            total:
              data.total ||
              0,

            status:
              data.status ||
              "Pending",

              finalTotal:
  data.finalTotal ||
  data.total,

            createdAt:
              data.createdAt
              ?.toDate?.()
              ?.toLocaleDateString()
              || "-"

          });

        }
      );

      setOrders(items);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const totalOrders =
  orders.length;

const pendingOrders =
  orders.filter(
    o => o.status === "Pending"
  ).length;

const deliveredOrders =
  orders.filter(
    o => o.status === "Delivered"
  ).length;

const totalRevenue =
  orders.reduce(
    (sum,o)=>
      sum + o.total,
    0
  );

  const updateStatus =
    async (
      orderId:string,
      status:string
    )=>{

    try{

      await updateDoc(

        doc(
          db,
          "orders",
          orderId
        ),

        { status }

      );

      setOrders(

        orders.map(
          (order)=>{

            if(
              order.id ===
              orderId
            ){

              return {
                ...order,
                status
              };

            }

            return order;

          }
        )

      );

    }catch(error){

      console.log(error);

    }

  };

  return (

    <div className="min-h-screen bg-gray-100">

      <div className="max-w-7xl mx-auto p-8">

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
    Admin Orders
  </h1>

  <p className="opacity-90">
    Manage marketplace orders and delivery status
  </p>

</div>

        <div className="
  grid
  grid-cols-1
  md:grid-cols-4
  gap-6
  mb-8
">

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>Total Orders</h3>
    <p className="text-3xl font-bold">
      {totalOrders}
    </p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>Pending</h3>
    <p className="text-3xl font-bold text-yellow-600">
      {pendingOrders}
    </p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>Delivered</h3>
    <p className="text-3xl font-bold text-green-600">
      {deliveredOrders}
    </p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>Revenue</h3>
    <p className="text-3xl font-bold text-blue-600">
      ₹{totalRevenue}
    </p>
  </div>

</div>

<input
  type="text"
  placeholder="Search Order ID or Customer..."
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

        {loading ? (

          <div className="
  bg-white
  rounded-3xl
  shadow
  p-10
  text-center
">

  <p className="
    text-lg
    text-gray-500
  ">
    Loading Orders...
  </p>

</div>
        ) : (

          <div className="
            bg-white
            rounded-2xl
            shadow
            p-6
            overflow-x-auto
          ">

            <table className="w-full">

              <thead>

                <tr className="border-b">

                  <th className="text-left py-4">
                    Order ID
                  </th>

                  <th className="text-left py-4">
                    Customer
                  </th>

                  <th className="text-left py-4">
                    Amount
                  </th>

                  <th className="text-left py-4">
                    Status
                  </th>

                  <th className="text-left py-4">
                    Date
                  </th>

                  <th className="text-left py-4">
  Invoice
</th>


                </tr>

              </thead>

              <tbody>

                {orders.length === 0 && (

  <tr>

    <div className="
  bg-white
  rounded-3xl
  shadow
  p-10
  text-center
">

  <p className="
    text-gray-500
    text-lg
  ">
    No Orders Found
  </p>

</div>

    <td
      colSpan={6}
      className="
        text-center
        py-10
        text-gray-500
      "
    >

      No Orders Found

    </td>

  </tr>

)}

               {orders
  .filter((order)=>

    order.id
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

    ||

    order.customerName
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

  )
  .map(
    (order)=>(
                  <tr
                    key={order.id}
                    className="
                      border-b
                    "
                  >

                    <td className="py-4">
                      {order.id.slice(0,8)}
                    </td>

                    <td>
                      {order.customerName}
                    </td>

                    <td>
                     ₹{
  (order as any).finalTotal ||
  order.total
}
                    </td>

                    <td>

  <div className="mb-2">

    <span
      className={`
        px-3
        py-1
        rounded-full
        text-sm
        font-semibold

        ${
          order.status === "Delivered"
          ? "bg-green-100 text-green-700"

          : order.status === "Cancelled"
          ? "bg-red-100 text-red-700"

          : order.status === "Out For Delivery"
          ? "bg-blue-100 text-blue-700"

          : "bg-yellow-100 text-yellow-700"
        }
      `}
    >

      {order.status}

    </span>

  </div>

  <select

    value={
      order.status
    }

    onChange={(e)=>

      updateStatus(

        order.id,

        e.target.value

      )

    }

    className="
      border
      p-2
      rounded-lg
    "
  >

                        <option>
                          Pending
                        </option>

                        <option>
                          Confirmed
                        </option>

                        <option>
                          Packed
                        </option>

                        <option>
                          Shipped
                        </option>

                        <option>
                     Out For Delivery
                        </option>

                        <option>
                          Delivered
                        </option>

                        <option>
                          Cancelled
                        </option>

                      </select>

                    </td>

                    <td>
                      {order.createdAt}
                    </td>

                    <td>

  <a
    href={`/invoice/${order.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="
     bg-gradient-to-r
from-green-600
to-blue-600
      text-white
      px-3
      py-2
      rounded-lg
    "
  >

    Invoice

  </a>

</td>

                  </tr>

                ))}

               

  
                
              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
    

  );

}