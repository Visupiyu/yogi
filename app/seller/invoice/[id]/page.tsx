"use client";

import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Invoice from "@/components/invoice/Invoice";
import type { SellerOrderDetail } from "@/lib/sellerOrders/sellerOrderView";
import { timestampLike } from "@/lib/sellerOrders/sellerOrdersClient";

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

          // The seller-scoped order view (app/api/seller/orders/[orderId]):
          // only this seller's own items and item value — never the shared
          // order document, which sellers can no longer read. The GST tax
          // invoice components are unchanged; they receive this seller's
          // lines and this seller's item value, exactly as before.
          const res = await fetch(
            `/api/seller/orders/${encodeURIComponent(String(params.id))}`,
            { headers: { Authorization: `Bearer ${await user.getIdToken()}` } }
          );
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || !payload?.order) {
            alert("Invoice not found");
            window.location.href = "/seller/orders";
            return;
          }
          const view = payload.order as SellerOrderDetail;
          const vendorSubtotal = view.sellerShare.rawSubtotal;
          setOrder({
            id: view.orderId,
            orderNumber: view.orderNumber,
            invoiceNumber: view.invoiceNumber,
            status: view.orderStatus,
            createdAt: timestampLike(view.createdAt),
            paymentMethod: view.payment.method,
            paymentStatus: view.payment.status,
            customerName: view.customer.name,
            phone: view.customer.phone,
            address: view.customer.address,
            items: view.items.map((item) => ({ ...item, id: item.productId })),
            total: vendorSubtotal,
            finalTotal: vendorSubtotal,
            // Shipping/coupon discount aren't split per vendor anywhere
            // in this app — showing the whole order's figures here would
            // overstate this seller's own invoice.
            shippingCharge: 0,
            discount: 0,
          });

        } catch (error) {

          console.error(error);
      toast.error("Couldn't load this page's data. Please check your connection and refresh to try again.");
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