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

        <h1 className="text-4xl font-bold mb-8">

          Admin Orders

        </h1>

        {loading ? (

          <p>
            Loading...
          </p>

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

                </tr>

              </thead>

              <tbody>

                {orders.map(
                  (order)=>(
                  <tr
                    key={order.id}
                    className="
                      border-b
                    "
                  >

                    <td className="py-4">
                      {order.id}
                    </td>

                    <td>
                      {order.customerName}
                    </td>

                    <td>
                      ₹{order.total}
                    </td>

                    <td>

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