"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Invoice from "@/components/invoice/Invoice";

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

return (

  <Invoice
    order={order}
    type="customer"
  />

);
}