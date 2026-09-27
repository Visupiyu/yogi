"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Invoice from "@/components/invoice/Invoice";
import { computeVendorShare } from "@/lib/vendorEarnings";

export default function SellerInvoicePage() {

  const params = useParams();

  const [order, setOrder] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {

        if (!user) {

          alert("Please login first");

          window.location.href = "/vendor-login";

          return;

        }

        try {

          const snap = await getDoc(
            doc(
              db,
              "orders",
              params.id as string
            )
          );

          if (!snap.exists()) {

            alert("Invoice not found");

            window.location.href = "/seller/orders";

            return;

          }

          const data: any = {

            ...snap.data(),

            id: snap.id,

          };

          // Optional security check
          if (
            data.vendorIds &&
            !data.vendorIds.includes(user.uid)
          ) {

            alert("Unauthorized access");

            window.location.href = "/seller/orders";

            return;

          }

          // The order document holds every vendor's items and one
          // whole-order total — a seller's invoice must only show their
          // own items and their own share of the money, not the full
          // multi-vendor order (same bug class already fixed in
          // payouts/wallet/dashboard elsewhere this session).
          const vendorItems = (data.items || []).filter(
            (item: any) => item.vendorId === user.uid
          );

          // This seller's own figures from the shared payout helper — the
          // same numbers app/seller/orders/[id]'s invoice embed shows. Its
          // commission is always ₹0 (lib/commissionPolicy.ts).
          const share = computeVendorShare(data, user.uid);
          const vendorSubtotal = share?.vendorRawSubtotal ?? 0;

          setOrder({
            ...data,
            items: vendorItems,
            finalTotal: vendorSubtotal,
            commission: share?.vendorCommission ?? 0,
            sellerEarning: share?.vendorEarning ?? 0,
            // Shipping/coupon discount aren't split per vendor anywhere
            // in this app — showing the whole order's figures here would
            // overstate this seller's own invoice.
            shippingCharge: 0,
            discount: 0,
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

      <div className="p-10 text-center text-gray-500">

        Invoice not found.

      </div>

    );

  }

  return (

    <Invoice
      order={order}
      type="seller"
    />

  );

}