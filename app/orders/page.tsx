"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";
import { toast } from "sonner";

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

            const q = query(

              collection(db, "orders"),

              where(
                "userEmail",
                "==",
                firebaseUser.email
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

  const getStep = (

    status: string = ""

  ) => {

    switch (status) {

      case "Pending":
        return 1;

      case "Confirmed":
        return 2;

      case "Packed":
        return 3;

      case "Shipped":
        return 4;

      case "Out For Delivery":
        return 5;

      case "Delivered":
        return 6;

      default:
        return 1;

    }

  };

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

      await updateDoc(

        doc(db, "orders", id),

        {

          status: "Cancelled",

        }

      );

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

  const steps = [

    "📝 Placed",

    "✅ Confirmed",

    "📦 Packed",

    "🚚 Shipped",

    "🏍️ Out For Delivery",

    "🎉 Delivered",

  ];

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

                <div className="grid lg:grid-cols-3 gap-8 p-8 border-b">

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

      {order.paymentMethod || "COD"}

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
                    {/* ACTION BUTTONS */}
{order.paymentStatus === "Paid" ? (
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
) : (
  <button
    disabled
    className="w-full h-12 rounded-xl bg-gray-300 text-gray-600 cursor-not-allowed font-semibold"
  >
    📄 Invoice Unavailable
  </button>
)}

{order.chatId ? (

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

) : (

  <button
    disabled
    className="
      w-full
      h-12
      rounded-xl
      bg-gray-300
      text-gray-600
      cursor-not-allowed
      font-semibold
    "
  >
    💬 Chat Unavailable
  </button>

)}

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

{order.status === "Pending" && (

  <button
    onClick={() =>
      cancelOrder(order.id)
    }
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

) : (

  <div className="flex items-center justify-between">

    {steps.map((step, index) => (

      <div
        key={index}
        className="flex items-center flex-1"
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

                🏬 Sold By:
                {" "}
                <span className="font-semibold">

                 {item.vendorName || "YOMICO"}

                </span>

              </p>

              <p>

                📦 Quantity:
                {" "}
                <span className="font-semibold">

                  {item.qty}

                </span>

              </p>

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