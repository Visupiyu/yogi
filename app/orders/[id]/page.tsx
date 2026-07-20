"use client";

import { useEffect, useState } from "react";

import {doc,getDoc,} from "firebase/firestore";

import { onAuthStateChanged,} from "firebase/auth";

import Link from "next/link";

import { useRouter, useParams,} from "next/navigation";

import { auth, db,} from "@/lib/firebase";

export default function OrderDetailsPage() {

  const router = useRouter();

  const params = useParams();

  const orderId = params.id as string;

  const [loading, setLoading] = useState(true);

  const [order, setOrder] = useState<any>(null);

  useEffect(() => {

    const unsub = onAuthStateChanged(

      auth,

      async (user) => {

        if (!user) {

          alert("Please login first");

          router.push("/login");

          return;

        }

        try {

          const ref = doc(
            db,
            "orders",
            orderId
          );

          const snap = await getDoc(ref);

          if (!snap.exists()) {

            alert("Order not found");

            router.push("/orders");

            return;

          }

        const data: any = {id: snap.id,...snap.data(),};
       if (data.userEmail !== user.email) {
  router.push("/orders");
  return;
}

setOrder(data);
       } catch (err) {
  console.error("Order page error:", err);
  alert("ERROR FROM CATCH");
  console.log(err);
} finally {
  setLoading(false);
}
      }

    );

    return () => unsub();

  }, [

    orderId,

    router,

  ]);

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

      <div className="min-h-screen flex items-center justify-center text-xl font-semibold">

        Loading Order...

      </div>

    );

  }

  if (!order) return null;

  return (

    <section className="bg-gray-50 min-h-screen py-10">

      <div className="max-w-6xl mx-auto px-5">

        <div className="flex items-center justify-between mb-8">

          <div>

            <h1 className="text-4xl font-bold">

              Order Details

            </h1>

            <p className="text-gray-500 mt-2">

              Order #

              {order.id.slice(0,8)}

            </p>

          </div>

          <Link

            href="/orders"

            className="px-5 py-3 rounded-xl bg-gray-800 text-white hover:bg-black"

          >

            ← Back to Orders

          </Link>

        </div>

        <div className="grid lg:grid-cols-3 gap-8">

          {/* LEFT */}

          <div className="lg:col-span-2 bg-white rounded-3xl shadow border p-8">

            <h2 className="text-2xl font-bold mb-6">

              Customer Details

            </h2>

            <div className="space-y-3">

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

              <p>

                <strong>Ordered On:</strong>

                {" "}

                {

                  order.createdAt?.seconds

                  ?

                  new Date(

                    order.createdAt.seconds * 1000

                  ).toLocaleString()

                  :

                  "-"

                }

              </p>

            </div>

          </div>

          {/* RIGHT */}

          <div className="bg-white rounded-3xl shadow border p-8">

            <h2 className="text-2xl font-bold mb-6">

              Payment Summary

            </h2>

            <div className="space-y-4">

              <div className="flex justify-between">

                <span>Total</span>

                <span className="font-bold text-green-700">

                  ₹

                  {(

                    order.finalTotal ||

                    order.total

                  )?.toLocaleString("en-IN")}

                </span>

              </div>

              <div className="flex justify-between">

                <span>Method</span>

                <span>

                  {order.paymentMethod}

                </span>

              </div>

              <div className="flex justify-between">

                <span>Status</span>

                <span className="font-semibold text-blue-600">

                  {order.paymentStatus}

                </span>

              </div>

              <div className="flex justify-between">

                <span>Order Status</span>

                <span className="font-semibold text-green-700">

                  {order.status}

                </span>

              </div>

            </div>

          </div>

        </div>
                {/* TRACKING */}

        <div className="mt-8 bg-white rounded-3xl shadow border p-8">

          <h2 className="text-2xl font-bold mb-8">

            🚚 Order Tracking

          </h2>

          <div className="flex items-center justify-between overflow-x-auto">

            {steps.map((step, index) => (

              <div
                key={index}
                className="flex items-center flex-1 min-w-[120px]"
              >

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

                  <p className="mt-3 text-sm text-center">

                    {step}

                  </p>

                </div>

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

        </div>

       {/* DELIVERY DETAILS */}

<div className="mt-8 bg-white rounded-3xl shadow border p-8">

  <h2 className="text-2xl font-bold mb-6">

    📦 Delivery Details

  </h2>

  {order.expectedDelivery ||
   order.courierName ||
   order.trackingNumber ? (

    <div className="space-y-4">

      {order.expectedDelivery && (

        <div className="flex justify-between">

          <span>Expected Delivery</span>

          <span className="font-semibold">

            {order.expectedDelivery}

          </span>

        </div>

      )}

      {order.courierName && (

        <div className="flex justify-between">

          <span>Courier Partner</span>

          <span className="font-semibold">

            {order.courierName}

          </span>

        </div>

      )}

      {order.trackingNumber && (

        <div className="flex justify-between items-center">

          <span>Tracking Number</span>

          <span className="font-semibold">

            {order.trackingNumber}

          </span>

        </div>

      )}

    </div>

  ) : (

    <div className="flex flex-col items-center justify-center py-10">

  <div className="text-4xl mb-4">

    🚚

  </div>

  <p className="text-lg font-medium text-gray-700">

    Delivery partner has not been assigned yet.

  </p>

  <p className="mt-2 text-sm text-gray-500">

    Tracking details will appear once your order is shipped.

  </p>

</div>
  )}

</div>

        {/* ACTION BUTTONS */}

        <div className="mt-8 grid md:grid-cols-3 gap-4">

          <a
            href={`/invoice/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center"
          >

            📄 Download Invoice

          </a>

          {order.chatId ? (

            <a
              href={`/chat/${order.chatId}`}
              className="h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center justify-center"
            >

              💬 Contact Seller

            </a>

          ) : (

            <button
              disabled
              className="h-12 rounded-xl bg-gray-300 text-gray-600 cursor-not-allowed font-semibold"
            >

              💬 Chat Unavailable

            </button>

          )}

          <Link
            href="/orders"
            className="h-12 rounded-xl bg-gray-800 hover:bg-black text-white font-semibold flex items-center justify-center"
          >

            ← Back to Orders

          </Link>

        </div>
                {/* ORDERED PRODUCTS */}

        <div className="mt-8 bg-white rounded-3xl shadow border p-8">

          <h2 className="text-2xl font-bold mb-8">

            📦 Ordered Products

          </h2>

          <div className="space-y-6">

            {order.items?.map(

              (item: any, index: number) => (

                <div
                  key={index}
                  className="
                    border
                    rounded-2xl
                    p-5
                    flex
                    flex-col
                    md:flex-row
                    gap-6
                    items-center
                    hover:shadow-md
                    transition
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

                        🏬 Seller:

                        {" "}

                        <span className="font-semibold">

                          {item.vendorName || "Yogi Mart"}

                        </span>

                      </p>

                      <p>

                        📦 Quantity:

                        {" "}

                        {item.qty}

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

                  <div className="text-right">

                    <p className="text-3xl font-bold text-green-700">

                      ₹

                      {(

                        item.price *

                        item.qty

                      ).toLocaleString("en-IN")}

                    </p>

                    <p className="text-gray-500">

                      Item Total

                    </p>

                  </div>

                </div>

              )

            )}

          </div>

        </div>

        {/* DELIVERY SUCCESS */}

        {order.status === "Delivered" && (

          <div
            className="
              mt-8
              bg-green-50
              border
              border-green-200
              rounded-3xl
              p-8
            "
          >

            <h2 className="text-2xl font-bold text-green-700">

              🎉 Order Delivered Successfully

            </h2>

            <p className="mt-3 text-gray-700">

              Thank you for shopping with Yogi Mart.

            </p>

            <Link
              href={`/returns?orderId=${order.id}`}
              className="
                inline-flex
                mt-6
                px-6
                py-3
                rounded-xl
                bg-orange-500
                hover:bg-orange-600
                text-white
                font-semibold
              "
            >

              Request Return

            </Link>

          </div>

        )}

      </div>

    </section>

  );

}