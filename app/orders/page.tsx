"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { toast } from "sonner";
import { addToCart } from "@/lib/cart";
import { ORDER_STEPS, getStep } from "@/lib/orderTracking";
import {
  RETURN_WINDOW_DAYS,
  canRequestReturn,
  returnWindowEndsAt,
} from "@/lib/returnEligibility";
export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (!firebaseUser) {
          setLoading(false);
          alert("Please login first");
          router.push("/login");
          return;
        }
        const fetchOrders = async () => {
          try {
            // firestore.rules gates orders reads on resource.data.userId,
            // not userEmail -- querying a different field than the rule
            // checks makes Firestore reject the whole query.
            const q = query(
              collection(db, "orders"),
              where(
                "userId",
                "==",
                firebaseUser.uid
              )
            );
            const snapshot =
              await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((docSnap) => {
              items.push({
                id: docSnap.id,
                ...docSnap.data(),
              });
            });
            const unique = Array.from(
              new Map(
                items.map((o) => [
                  o.id,
                  o,
                ])
              ).values()
            );
            unique.sort(
              (a, b) =>
                (b.createdAt?.seconds || 0) -
                (a.createdAt?.seconds || 0)
            );
            setOrders(unique);
          } catch (error) {
            console.error(error);
          } finally {
            setLoading(false);
          }
        };
        fetchOrders();
      }
    );
    return () => unsub();
  }, [router]);
  // getStep() and the step labels now come from lib/orderTracking.ts, shared
  // with app/orders/[id] and app/track-order. This page's copy had already
  // drifted — it still read "Placed" for the stored status "Pending" after the
  // detail page was corrected.
  const cancelOrder = async (
    id: string
  ) => {
    if (
      !confirm(
        "Cancel this order?"
      )
    )
      return;
    try {
      // Cancellation is server-authoritative: /api/cancel-order re-reads the
      // order, authorizes the caller against it, and performs the status
      // change plus stock/sales restoration in one Admin SDK transaction,
      // then reverses reward points and releases the coupon. Doing it here
      // in the browser meant this page, app/seller/orders and
      // app/seller/orders/[id] each had their own copy, and only this one
      // reversed rewards/coupons at all.
      const currentUser = auth.currentUser;

      if (!currentUser) {
        alert("Please login first");
        router.push("/login");
        return;
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch("/api/cancel-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ orderId: id }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data?.error || "Couldn't cancel this order.");
        return;
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                status: "Cancelled",
              }
            : o
        )
      );
    } catch (error) {
      console.log(error);
    }
  };
  const reorderItems = (items: any[]) => {
  items.forEach((item) => {
    addToCart(item, {
      qty: item.qty,
      size: item.size,
      color: item.color,
      // Absent on older order items, which fall back to size/color exactly
      // as before.
      variantId: item.variantId,
      attributes: item.attributes,
    });
  });
  toast.success(
  `${items.length} item(s) added to your cart.`
);
  router.push("/cart");
};
  const steps = ORDER_STEPS;
  if (loading) {
    return (
      <div className="py-20 text-center">
      Loading your orders...
      </div>
    );
  }
  return (
  <section className="bg-gray-50 min-h-screen py-10">
      <div className="max-w-6xl mx-auto px-5">
        <h1 className="text-4xl font-bold mb-10">
          My Orders
        </h1>
        {orders.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md p-10 text-center">
            <p className="text-gray-500 text-lg">
              No Orders Found
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {orders.map((order: any) => (
              <div
                key={order.id}
                className="bg-white rounded-3xl shadow-md border overflow-hidden"
              >
                {/* ORDER SUMMARY */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-8 border-b">
                  {/* LEFT */}
                  <div>
                    <h2 className="text-2xl font-bold">
                      Order #
                      {order.id.slice(0, 8)}
                    </h2>
                    <p className="mt-4">
                      👤 {order.customerName}
                    </p>
                    <p className="mt-2 text-gray-500">
                      📅
                      {" "}
                      {order.createdAt?.seconds
                        ? new Date(
                            order.createdAt.seconds *
                              1000
                          ).toLocaleString()
                        : "-"}
                    </p>
                    <p className="mt-2">
                      📧
                      {" "}
                      {order.userEmail}
                    </p>
                    <p className="mt-2">
                      📞
                      {" "}
                      {order.phone}
                    </p>
                    <p className="mt-2">
                      📍
                      {" "}
                      {order.address}
                    </p>
                  </div>
                  {/* CENTER */}
                  <div className="bg-gray-50 rounded-3xl border p-6">
                    <p className="text-4xl font-bold text-green-700">
                      ₹
                      {(
                        order.finalTotal ||
                        order.total
                      )?.toLocaleString(
                        "en-IN"
                      )}
                    </p>
                    <p className="text-gray-500 mt-2">
                      Total Amount
                    </p>
                    <hr className="my-5" />
<div className="space-y-4">
  <div className="flex justify-between">
    <span>Items</span>
    <span>{order.items?.length}</span>
  </div>
  <div className="flex justify-between">
    <span>Payment</span>
    <span
      className={
        order.paymentStatus === "Paid"
          ? "text-green-600 font-semibold"
          : "text-red-600 font-semibold"
      }
    >
      {order.paymentStatus || "Pending"}
    </span>
  </div>
  <div className="flex justify-between">
    <span>Method</span>
    <span>
      {order.paymentMethod || "Pay on Delivery (UPI Only)"}
    </span>
  </div>
  <div className="flex justify-between">
    <span>Status</span>
    <span className="text-blue-600 font-semibold">
      {order.status}
    </span>
  </div>
  <div className="flex justify-between">
    <span>Shipping</span>
    <span>
      Free
    </span>
  </div>
</div>
</div>
{/* RIGHT */}
<div className="space-y-3">
  {/* View Details */}
  <a
    href={`/orders/${order.id}`}
    className="
      w-full
      h-12
      rounded-xl
      bg-indigo-600
      hover:bg-indigo-700
      text-white
      font-semibold
      flex
      items-center
      justify-center
    "
  >
    👁️ View Details
  </a>
  {/* Download Invoice */}
 {["Confirmed", "Shipped", "Delivered"].includes(order.status) && (
    <a
      href={`/invoice/${order.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="
        w-full
        h-12
        rounded-xl
        bg-blue-600
        hover:bg-blue-700
        text-white
        font-semibold
        flex
        items-center
        justify-center
      "
    >
      📄 Download Invoice
    </a>

  )}

  {/* Contact Seller */}

  {order.chatId && (

    <a
      href={`/chat/${order.chatId}`}
      className="
        w-full
        h-12
        rounded-xl
        bg-green-600
        hover:bg-green-700
        text-white
        font-semibold
        flex
        items-center
        justify-center
      "
    >
      💬 Contact Seller
    </a>

  )}

  {/* Track Order */}

  <a
    href={`/orders/${order.id}`}
    className="
      w-full
      h-12
      rounded-xl
      bg-purple-600
      hover:bg-purple-700
      text-white
      font-semibold
      flex
      items-center
      justify-center
    "
  >
    📍 Track Order
  </a>

  <button
  onClick={() => reorderItems(order.items)}
  className="
    w-full
    h-12
    rounded-xl
    bg-green-700
    hover:bg-green-800
    text-white
    font-semibold
  "
>
  🔄 Reorder
</button>

  {/* Cancel Order */}

  {order.status === "Pending" && (

    <button
      onClick={() => cancelOrder(order.id)}
      className="
        w-full
        h-12
        rounded-xl
        bg-red-600
        hover:bg-red-700
        text-white
        font-semibold
      "
    >
      ❌ Cancel Order
    </button>

)}

{/* Refund status — read-only, mirroring app/orders/[id]. Present only on a
    cancelled order whose payment was actually captured, so nothing renders
    for the normal case. Wording stays honest about whether the money has
    actually been returned yet. */}
{order.refundStatus === "Required" && (
  <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm">
    <p className="font-semibold text-amber-700">Refund pending</p>
    <p className="text-gray-600 mt-1">
      A refund of ₹
      {Number(order.refundAmountDue || 0).toLocaleString("en-IN")} is being
      arranged for this cancelled order. It has not been sent yet.
    </p>
  </div>
)}

{order.refundStatus === "Processing" && (
  <div className="mt-5 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-sm">
    <p className="font-semibold text-orange-700">Refund in progress</p>
    <p className="text-gray-600 mt-1">
      Your refund of ₹
      {Number(order.refundAmountDue || 0).toLocaleString("en-IN")} has been
      initiated. Banks usually take 5–7 business days.
    </p>
  </div>
)}

{order.refundStatus === "Refunded" && (
  <div className="mt-5 rounded-3xl border border-green-200 bg-green-50 p-5 text-sm">
    <p className="font-semibold text-green-700">Refunded</p>
    <p className="text-gray-600 mt-1">
      ₹{Number(order.refundedAmount || 0).toLocaleString("en-IN")} has been
      refunded
      {order.refundTransactionId
        ? ` · Ref: ${order.refundTransactionId}`
        : ""}
      .
    </p>
  </div>
)}

{/* ORDER STATUS */}

<div className="
  mt-5
  rounded-3xl
  border
  bg-gray-50
  p-5
">

  <div className="
    flex
    justify-between
    items-center
    mb-4
  ">

    <h3 className="
      font-bold
      text-lg
    ">
      Order Status
    </h3>

    <span
      className={`

        px-4
        py-2
        rounded-full
        text-sm
        font-semibold

        ${

          order.status === "Delivered"

            ? "bg-green-600 text-white"

          : order.status === "Out For Delivery"

            ? "bg-orange-100 text-orange-700"

          : order.status === "Shipped"

            ? "bg-purple-100 text-purple-700"

          : order.status === "Packed"

            ? "bg-indigo-100 text-indigo-700"

          : order.status === "Confirmed"

            ? "bg-blue-100 text-blue-700"

          : order.status === "Cancelled"

            ? "bg-red-600 text-white"

          : order.status === "Delivery Failed"

            ? "bg-red-600 text-white"

          : "bg-yellow-100 text-yellow-700"

        }

      `}
    >

      {order.status}

    </span>

<div className="mt-4 border-t pt-4">

  <p className="text-xs text-gray-500">

    Last Updated

  </p>

  <p className="font-medium">

    {order.createdAt?.seconds
      ? new Date(
          order.createdAt.seconds * 1000
        ).toLocaleString()
      : "-"}

  </p>

</div>

  </div>

  {order.expectedDelivery && (

    <p className="mb-2">

      📅 Expected Delivery:

      {" "}

      <span className="font-semibold">

      {new Date(order.expectedDelivery).toLocaleDateString("en-IN")}

      </span>

    </p>

  )}

  {order.courierName && (

    <p className="mb-2">

      🚚 Delivery Partner:

      {" "}

      <span className="font-semibold">

        {order.courierName}

      </span>

    </p>

  )}

  {order.trackingNumber && (

    <div className="flex items-center gap-2 flex-wrap">

      <span>

        📦 Tracking:

      </span>

      <span className="font-semibold">

        {order.trackingNumber}

      </span>

      <button
        onClick={() => {

          navigator.clipboard.writeText(
            order.trackingNumber
          );

         toast.success("Tracking number copied.");

        }}
        className="
          text-blue-600
          underline
          text-sm
        "
      >
        Copy
      </button>

    </div>

  )}

</div>

</div>

</div>

{/* ORDER TRACKING */}

<div className="
  p-8
  border-b
">

  <h2 className="
    text-2xl
    font-bold
    mb-8
  ">
    🚚 Order Tracking
  </h2>

 {order.status === "Cancelled" ? (

  <div className="bg-red-50 border border-red-200 rounded-3xl p-6">

    <h3 className="text-xl font-bold text-red-700">
      ❌ Order Cancelled
    </h3>

    <p className="mt-2 text-gray-600">
      This order has been cancelled and will not be processed.
    </p>

  </div>

) : order.status === "Delivery Failed" ? (

  <div className="bg-orange-50 border border-orange-200 rounded-3xl p-6">

    <h3 className="text-xl font-bold text-orange-700">
      ⚠️ Delivery Attempt Failed
    </h3>

    <p className="mt-2 text-gray-600">
      We couldn&apos;t deliver your order. Our delivery partner will retry soon.
    </p>

  </div>

) : (

  <div className="flex items-center justify-between overflow-x-auto">

    {steps.map((step, index) => (

      <div
        key={index}
        className="flex items-center flex-1 min-w-[120px]"
      >

      {/* Circle */}

      <div className="flex flex-col items-center">

        <div
          className={`
            w-12
            h-12
            rounded-full
            flex
            items-center
            justify-center
            text-white
            font-bold

            ${
              getStep(order.status) >= index + 1
                ? "bg-green-600"
                : "bg-gray-300"
            }
          `}
        >
          {index + 1}
        </div>

        <p className="mt-3 text-sm text-center whitespace-nowrap">
          {step}
        </p>

      </div>

      {/* CONNECTING LINE */}

      {index < steps.length - 1 && (

        <div
          className={`
            flex-1
            h-1
            mx-3
            rounded-full

            ${
              getStep(order.status) > index + 1
                ? "bg-green-600"
                : "bg-gray-300"
            }
          `}
        />

      )}

    </div>

   ))}

  </div>

)}

</div>
{/* ORDERED PRODUCTS */}

<div className="p-8">

  <h2 className="text-2xl font-bold mb-8">

    📦 Ordered Item

  </h2>

  <div className="space-y-5">

    {order.items?.map(

      (item: any, index: number) => (

        <div
          key={index}
          className="
            border
            rounded-3xl
            p-6
            shadow-sm
            hover:shadow-md
            transition
            flex
            flex-col
            md:flex-row
            gap-6
            items-center
          "
        >

          <img
            src={
              item.image ||
              "/no-image.png"
            }
            alt={item.name}
            className="
              w-28
              h-28
              rounded-2xl
              object-cover
              border
            "
          />

          <div className="flex-1">

            <h3 className="text-xl font-bold">

              {item.name}

            </h3>

           <div className="mt-3 space-y-2 text-gray-600">

  <p>
    🏬 Sold By:{" "}
    <a
      href={`/seller/${item.vendorId}`}
      className="
        font-semibold
        text-blue-600
        hover:underline
      "
    >
      {item.vendorName || "YOMICO"}
    </a>
  </p>

              <p>

                📦 Quantity:
                {" "}
                <span className="font-semibold">

                  {item.qty}

                </span>

              </p>

              {item.attributes &&
              Object.keys(item.attributes).length > 0 ? (

                Object.entries(item.attributes).map(
                  ([dimension, value]) => (

                    <p key={dimension}>

                      🔹 {dimension}:
                      {" "}
                      {String(value)}

                    </p>

                  )
                )

              ) : (

                <>

                  {item.color && (

                    <p>

                      🎨 Color:
                      {" "}
                      {item.color}

                    </p>

                  )}

                  {item.size && (

                    <p>

                      📏 Size:
                      {" "}
                      {item.size}

                    </p>

                  )}

                </>

              )}

            </div>

          </div>

          <div className="text-right self-start">

            <p className="text-3xl font-bold text-green-700">

              ₹

              {(
                item.price *
                item.qty
              ).toLocaleString("en-IN")}

            </p>

            <p className="text-gray-500 mt-2">

              Item Total

            </p>

          </div>

        </div>

      )

    )}

  </div>

  {order.status === "Delivered" && (

    <div
      className="
        mt-8
        bg-green-50
        border
        border-green-200
        rounded-3xl
        p-6
      "
    >

      <h3 className="text-green-700 text-xl font-bold">

        🎉 Order Delivered Successfully

      </h3>

      <p className="mt-2 text-gray-600">

        Thank you for shopping with
       YOMICO.

      </p>

      {/* Return action only while eligible. Delivered-only behaviour is
          preserved — this whole block already required it — with the 7-day
          window added on top. canRequestReturn() is the same rule
          /api/request-return enforces server-side; this is only what the
          customer sees. */}
      {canRequestReturn(order) ? (
        <a
          href={`/returns?orderId=${order.id}`}
          className="
            inline-flex
            mt-5
            bg-orange-500
            hover:bg-orange-600
            text-white
            px-6
            py-3
            rounded-xl
            font-semibold
          "
        >

          Request Return

        </a>
      ) : (
        <p className="mt-5 text-sm text-gray-600">
          {returnWindowEndsAt(order)
            ? `The ${RETURN_WINDOW_DAYS}-day return window closed on ${returnWindowEndsAt(
                order
              )!.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}.`
            : `The ${RETURN_WINDOW_DAYS}-day return window has closed.`}
        </p>
      )}

    </div>

  )}

</div>

</div>

))

}

</div>

)}

</div>

</section>

);

}