"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import {
  doc,
  getDoc
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

export default function InvoicePage(){

  const params =
    useParams();

  const [order,setOrder] =
    useState<any>(null);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    async function loadOrder(){

      const snap =
        await getDoc(

          doc(
            db,
            "orders",
            params.id as string
          )

        );

      if(
        snap.exists()
      ){

        setOrder({

          id:snap.id,

          ...snap.data()

        });

      }

      setLoading(false);

    }

    if(params?.id){

      loadOrder();

    }

  },[params]);

  if(loading){

    return(
      <div className="p-10">
        Loading...
      </div>
    );

  }

  if(!order){

    return(
      <div className="p-10">
        Invoice Not Found
      </div>
    );

  }

  const gst =

    Math.round(
      order.total * 0.18
    );

  const subtotal =

    order.total - gst;

  return(

    <div className="
      max-w-4xl
      mx-auto
      p-10
      bg-white
    ">

      <h1 className="
        text-4xl
        font-bold
        mb-6
      ">
        GST Invoice
      </h1>

      <p>
        Invoice No:
        {order.id}
      </p>

      <p>
        Customer:
        {order.customer}
      </p>

      <p>
        Email:
        {order.userEmail}
      </p>

      <p>
        Phone:
        {order.phone}
      </p>

      <p>
        Address:
        {order.address}
      </p>

      <hr className="my-6"/>

      <table className="
        w-full
        border
      ">

        <thead>

          <tr>

            <th>Name</th>

            <th>Qty</th>

            <th>Price</th>

            <th>Total</th>

          </tr>

        </thead>

        <tbody>

          {order.items?.map(
            (
              item:any,
              index:number
            )=>(

            <tr key={index}>

              <td>
                {item.name}
              </td>

              <td>
                {item.qty}
              </td>

              <td>
                ₹{item.price}
              </td>

              <td>
                ₹{
                  item.price *
                  item.qty
                }
              </td>

            </tr>

          ))}

        </tbody>

      </table>

      <div className="
        mt-8
        text-right
      ">

        <p>
          Subtotal:
          ₹{subtotal}
        </p>

        <p>
          GST (18%):
          ₹{gst}
        </p>

        <h2 className="
          text-2xl
          font-bold
        ">
          Grand Total:
          ₹{order.total}
        </h2>

      </div>

      <button

        onClick={()=>
          window.print()
        }

        className="
          mt-8
          bg-black
          text-white
          px-6
          py-3
          rounded-xl
        "
      >

        Print Invoice

      </button>

    </div>

  );

}