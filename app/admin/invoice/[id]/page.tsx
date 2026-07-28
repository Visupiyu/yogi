"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Invoice from "@/components/invoice/Invoice";

export default function AdminInvoicePage() {

  const params = useParams();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {

        if (!user) {

          alert("Please login first");

          window.location.href = "/admin-login";

          return;

        }

        try {

          const snap = await getDoc(
            doc(db, "orders", params.id as string)
          );

          if (!snap.exists()) {

            alert("Invoice not found");

            window.location.href = "/admin/orders";

            return;

          }

          setOrder({
            id: snap.id,
            ...snap.data(),
          });

        } catch (error) {

          console.error(error);

        } finally {

          setLoading(false);

        }

      }
    );

    return () => unsubscribe();

  }, [params]);

  if (loading) {

    return (
      <div className="p-10">
        Loading invoice...
      </div>
    );

  }

  if (!order) {

    return (
      <div className="p-10 text-center">
        Invoice not found.
      </div>
    );

  }

  return (
    <Invoice
      order={order}
      type="admin"
    />
  );

}