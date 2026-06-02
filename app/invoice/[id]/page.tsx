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

      <div className="
  flex
  justify-between
  items-start
  mb-8
">

  <div>

    <h1 className="
      text-4xl
      font-bold
    ">
      YOGI MART
    </h1>

    <p className="text-gray-600">
      Ahmedabad, Gujarat
    </p>

    <p className="text-gray-600">
      GSTIN: 24ABCDE1234F1Z5
    </p>

  </div>

  <div className="text-right">

    <h2 className="
      text-3xl
      font-bold
    ">
      TAX INVOICE
    </h2>

    <p>
      #{order.id}
    </p>

  </div>

</div>

      <div className="
  bg-gray-50
  border
  rounded-2xl
  p-6
  mb-8
">

  <h3 className="
    text-xl
    font-bold
    mb-4
  ">
    Billing Details
  </h3>

  <p>
    <strong>Invoice No:</strong>
    {" "}
    {order.id}
  </p>

  <p>
    <strong>Name:</strong>
    {" "}
    {order.customerName}
  </p>

  <p>
    <strong>Email:</strong>
    {" "}
    {order.userEmail}
  </p>

  <p>
    <strong>Phone:</strong>
    {" "}
    {order.phone}
  </p>

  <p>
    <strong>Address:</strong>
    {" "}
    {order.address}
  </p>

</div>
      <table className="
  w-full
  border
  border-gray-300
">

        <thead>

  <tr>

    <th className="
      border
      p-3
      bg-gray-100
    ">
      Name
    </th>

    <th className="
      border
      p-3
      bg-gray-100
    ">
      Qty
    </th>

    <th className="
      border
      p-3
      bg-gray-100
    ">
      Price
    </th>

    <th className="
      border
      p-3
      bg-gray-100
    ">
      Total
    </th>

  </tr>

</thead>
        <tbody>

          {order.items?.map(
            (
              item:any,
              index:number
            )=>(

            <tr key={index}>

              <td className="
  border
  p-3
">
  {item.name}
</td>

<td className="
  border
  p-3
  text-center
">
  {item.qty}
</td>

<td className="
  border
  p-3
  text-center
">
  ₹{item.price}
</td>

<td className="
  border
  p-3
  text-center
">
  ₹{item.price * item.qty}
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