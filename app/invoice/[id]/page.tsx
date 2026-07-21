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
       Loading invoice...
      </div>
    );

  }

  if(!order){

    return(
      <div className="p-10 text-center text-gray-500">
  Invoice not found.
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
      YOMICO
    </h1>

    <p className="text-gray-600">
      Vadodara, Gujarat
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
    <p>
  Date:{" "}
  {order.createdAt
    ? order.createdAt.toDate().toLocaleDateString("en-IN")
    : "-"}
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

  {order.items && order.items.length > 0 ? (

    order.items.map(
      (
        item:any,
        index:number
      ) => (

        <tr key={index}>

          <td className="border p-3">
            {item.name}
          </td>

          <td className="border p-3 text-center">
            {item.qty}
          </td>

          <td className="border p-3 text-center">
            ₹{Number(item.price).toLocaleString("en-IN")}
          </td>

          <td className="border p-3 text-center">
            ₹{Number(item.price * item.qty).toLocaleString("en-IN")}
          </td>

        </tr>

      )

    )

  ) : (

    <tr>

      <td
        colSpan={4}
        className="border p-6 text-center text-gray-500"
      >
        No items found.
      </td>

    </tr>

  )}

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
        <p>
  Payment Method:
  {order.paymentMethod || "-"}
</p>

<p>
  Payment Status:
  {order.paymentStatus || "-"}
</p>

        <h2 className="
          text-2xl
          font-bold
        ">
          Grand Total:
          ₹{Number(order.total).toLocaleString("en-IN")}
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
    print:hidden
  "
      >

       🖨️ Print Invoice

      </button>

    </div>

  );

}