"use client";

import { useCallback, useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

import LoadErrorState from "@/components/LoadErrorState";

import Invoice from "@/components/invoice/Invoice";

export default function AdminInvoicePage() {

  const params = useParams();

  const id = params.id as string;

  const [order, setOrder] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {

    if (!id) return;

    setLoading(true);

    setLoadError(null);

    try {

      const docRef = doc(db, "orders", id);

      const snap = await getDoc(docRef);

      setOrder(snap.exists() ? { id: snap.id, ...snap.data() } : null);

    } catch (error) {

      console.error(error);

      setLoadError("We couldn't load this order. Please check your connection and try again.");

    } finally {

      setLoading(false);

    }

  }, [id]);

  useEffect(() => {

    fetchOrder();

  }, [fetchOrder]);

  if (loading) {

    return (

      <div className="flex justify-center items-center min-h-screen">

        Loading...

      </div>

    );

  }

  if (loadError) {

    return (

      <div className="flex justify-center items-center min-h-screen p-4">

        <LoadErrorState message={loadError} onRetry={fetchOrder} className="max-w-md" />

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