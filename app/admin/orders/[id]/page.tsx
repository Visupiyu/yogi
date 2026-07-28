"use client";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

import Invoice from "@/components/invoice/Invoice";

export default function AdminInvoicePage() {

  const params = useParams();

  const id = params.id as string;

  const [order, setOrder] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {

    async function fetchOrder() {

      try {

        const docRef = doc(db, "orders", id);

        const snap = await getDoc(docRef);

        if (snap.exists()) {

          setOrder({

            id: snap.id,

            ...snap.data(),

          });

        }

      } catch (error) {

        console.error(error);

      } finally {

        setLoading(false);

      }

    }

    if (id) {

      fetchOrder();

    }

  }, [id]);

  if (loading) {

    return (

      <div className="flex justify-center items-center min-h-screen">

        Loading...

      </div>

    );

  }

  if (!order) {

    return (

      <div className="flex justify-center items-center min-h-screen text-red-600 text-xl">

        Order Not Found

      </div>

    );

  }

  return (

    <div className="bg-gray-100 min-h-screen py-8">

      <Invoice

        order={order}

        type="admin"

      />

    </div>

  );

}