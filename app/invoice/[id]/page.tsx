"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function InvoicePage(){

  const params =
    useParams();

  const [order,setOrder] =
    useState<any>(null);

  const [loading,setLoading] =
    useState(true);

useEffect(() => {

  const unsubscribe = onAuthStateChanged(auth, async (user) => {

    if (!user) {
      alert("Please login first");
      window.location.href = "/login";
      return;
    }

    try {

      const snap = await getDoc(
        doc(db, "orders", params.id as string)
      );

      if (!snap.exists()) {
        alert("Invoice not found");
        window.location.href = "/orders";
        return;
      }

      const data: any = {
        id: snap.id,
        ...snap.data(),
      };

      if (
        data.userEmail?.trim().toLowerCase() !==
        user.email?.trim().toLowerCase()
      ) {
        alert("Unauthorized access");
        window.location.href = "/orders";
        return;
      }

      setOrder(data);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  });

  return () => unsubscribe();

}, [params]);

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

const grandTotal =
  Number(order.finalTotal || order.total || 0);

const shipping =
  Number(order.shippingCharge || 0);

const discount =
  Number(order.discount || 0);

// Assuming total is GST-inclusive
const taxableAmount =
  grandTotal / 1.18;

const gst =
  grandTotal - taxableAmount;

const subtotal =
  taxableAmount;

  return(

    <div
  className="
    max-w-4xl
    mx-auto
    p-10
    bg-white
    print:max-w-full
    print:p-4
    print:shadow-none
  "
>

      <div className="
  flex
  justify-between
  items-start
  mb-8
">

  <div>

  <img
    src="/logo.png"
    alt="YOMICO"
    className="h-16 mb-4"
  />

  <h1 className="text-4xl font-bold text-green-700">
    YOMICO
  </h1>

  <p className="text-gray-600">
    India's Multi-Vendor Marketplace
  </p>

  <p className="text-gray-600">
    Vadodara, Gujarat, India
  </p>

  <p className="text-gray-600">
    GSTIN: 24ABCDE1234F1Z5
  </p>

  <p className="text-gray-600">
    Email: support@yomico.in
  </p>

  <p className="text-gray-600">
    Website: www.yomico.in
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

 <div className="mt-8 text-right space-y-2">

  <p>
    Subtotal :
    ₹{subtotal.toFixed(2)}
  </p>

  <p>
    GST (18%) :
    ₹{gst.toFixed(2)}
  </p>

  <p>
    Shipping :
    ₹{shipping.toLocaleString("en-IN")}
  </p>

  <p>
    Discount :
    ₹{discount.toLocaleString("en-IN")}
  </p>

  <hr className="my-3" />

  <p>
    Payment Method :
    {order.paymentMethod || "-"}
  </p>

  <p>
    Payment Status :
    {order.paymentStatus || "-"}
  </p>

  <h2 className="text-2xl font-bold text-green-700">

    Grand Total :
    ₹{grandTotal.toLocaleString("en-IN")}

  </h2>

</div>
      <div className="flex gap-4 mt-8 print:hidden">

  <button
    onClick={() => window.print()}
    className="
      bg-black
      hover:bg-gray-800
      text-white
      px-6
      py-3
      rounded-xl
    "
  >
    🖨️ Print Invoice
  </button>

  <button
    onClick={() => window.history.back()}
    className="
      bg-gray-200
      hover:bg-gray-300
      px-6
      py-3
      rounded-xl
    "
  >
    ← Back
  </button>

</div>

      <hr className="my-10" />

<div className="text-center text-gray-500 text-sm">

  <p className="font-semibold text-gray-700">
    Thank you for shopping with YOMICO.
  </p>

  <p className="mt-2">
    This is a computer-generated invoice and does not require a signature.
  </p>

  <p className="mt-2">
    For support, contact:
    <span className="font-semibold">
      {" "}support@yomico.in
    </span>
  </p>

  <p className="mt-1">
    www.yomico.in
  </p>

</div>

    </div>

  );

}