"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useParams } from "next/navigation";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function CustomerOrderDetailsPage(){

  const params = useParams();

  const id = params.id as string;

  const [order,setOrder] =
    useState<any>(null);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    loadOrder();

  },[id]);

  const loadOrder = async()=>{

    try{

      const snap = await getDoc(

        doc(
          db,
          "orders",
          id
        )

      );

      if(

        snap.exists()

      ){

        setOrder({

          id:snap.id,

          ...snap.data()

        });

      }

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  if(loading){

    return(

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
        text-xl
      ">

        Loading Order...

      </div>

    );

  }

  if(!order){

    return(

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
        text-xl
      ">

        Order Not Found

      </div>

    );

  }

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-blue-600
          to-indigo-600
          text-white
          rounded-3xl
          p-8
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">

            Order Details

          </h1>

          <p className="mt-2">

            Order #

            {order.id.slice(0,8)}

          </p>

        </div>

        <div className="
          grid
          lg:grid-cols-3
          gap-8
        ">

          <div className="
            lg:col-span-2
            space-y-8
          ">

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Customer Information

              </h2>

              <div className="
                grid
                md:grid-cols-2
                gap-6
              ">

                <div>

                  <p>

                    <strong>Name :</strong>

                    {" "}

                    {order.customerName}

                  </p>

                  <p className="mt-3">

                    <strong>Email :</strong>

                    {" "}

                    {order.userEmail}

                  </p>

                  <p className="mt-3">

                    <strong>Phone :</strong>

                    {" "}

                    {order.phone}

                  </p>

                </div>

                <div>

                  <p>

                    <strong>Shipping Address</strong>

                  </p>

                  <p className="mt-3">

                    {order.address}

                  </p>

                </div>

              </div>

            </div>

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Order Information

              </h2>

              <div className="
                grid
                md:grid-cols-2
                gap-6
              ">

                <div>

                  <p>

                    <strong>Order ID :</strong>

                    {" "}

                    {order.id}

                  </p>

                  <p className="mt-3">

                    <strong>Date :</strong>

                    {" "}

                    {

                      order.createdAt?.toDate

                      ?

                      order.createdAt

                      .toDate()

                      .toLocaleString()

                      :

                      "-"

                    }

                  </p>

                  <p className="mt-3">

                    <strong>Status :</strong>

                    {" "}

                    {order.status}

                  </p>

                </div>

                <div>

                  <p>

                    <strong>Payment Method :</strong>

                    {" "}

                    {order.paymentMethod}

                  </p>

                  <p className="mt-3">

                    <strong>Payment Status :</strong>

                    {" "}

                    {order.paymentStatus}

                  </p>

                </div>

              </div>

                        <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Ordered Products

              </h2>

              <div className="
                space-y-6
              ">

                {

                  order.items?.map(

                    (

                      item:any,

                      index:number

                    )=>(

                      <div

                        key={index}

                        className="
                          flex
                          gap-4
                          items-center
                          border-b
                          pb-4
                        "

                      >

                        <img

                          src={

                            item.image ||

                            "/placeholder.png"

                          }

                          alt=""

                          className="
                            w-24
                            h-24
                            rounded-xl
                            object-cover
                          "

                        />

                        <div className="
                          flex-1
                        ">

                          <h3 className="
                            text-lg
                            font-semibold
                          ">

                            {item.name}

                          </h3>

                          <p className="mt-2">

                            Qty :

                            {" "}

                            {item.qty}

                          </p>

                          <p>

                            ₹

                            {item.price}

                          </p>

                        </div>

                        <div className="
                          font-bold
                          text-lg
                        ">

                          ₹

                          {

                            item.price *

                            item.qty

                          }

                        </div>

                      </div>

                    )

                  )

                }

              </div>

            </div>

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Live Order Tracking

              </h2>

              <div className="
                flex
                flex-wrap
                gap-3
              ">

                {

                  [

                    "Pending",

                    "Confirmed",

                    "Packed",

                    "Shipped",

                    "Out For Delivery",

                    "Delivered"

                  ].map(

                    (

                      step,

                      index

                    )=>(

                      <div

                        key={index}

                        className={`

                          px-4

                          py-2

                          rounded-full

                          text-sm

                          font-semibold

                          ${

                            [

                              "Pending",

                              "Confirmed",

                              "Packed",

                              "Shipped",

                              "Out For Delivery",

                              "Delivered"

                            ]

                            .indexOf(step)

                            <=

                            [

                              "Pending",

                              "Confirmed",

                              "Packed",

                              "Shipped",

                              "Out For Delivery",

                              "Delivered"

                            ]

                            .indexOf(

                              order.status

                            )

                            ?

                            "bg-green-600 text-white"

                            :

                            "bg-gray-200"

                          }

                        `}

                      >

                        {step}

                      </div>

                    )

                  )

                }

              </div>

            </div>

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-6
              ">

                Courier Details

              </h2>

              <div className="
                grid
                md:grid-cols-2
                gap-6
              ">

                <div>

                  <p>

                    <strong>Courier :</strong>

                    {" "}

                    {

                      order.courierPartner ||

                      "-"

                    }

                  </p>

                  <p className="mt-3">

                    <strong>Tracking :</strong>

                    {" "}

                    {

                      order.trackingNumber ||

                      "-"

                    }

                  </p>

                </div>

                <div>

                  <p>

                    <strong>Dispatch Date :</strong>

                    {" "}

                    {

                      order.dispatchDate ||

                      "-"

                    }

                  </p>

                  <p className="mt-3">

                    <strong>Expected Delivery :</strong>

                    {" "}

                    {

                      order.expectedDelivery ||

                      "-"

                    }

                  </p>

                </div>

              </div>

            </div>

          </div>

          <div className="
            space-y-8
          ">

          </div>

                      <div
              className="
                bg-white
                rounded-3xl
                shadow
                p-6
              "
            >

              <h2
                className="
                  text-2xl
                  font-bold
                  mb-6
                "
              >
                Order Summary
              </h2>

              <div className="space-y-3">

                <div className="flex justify-between">

                  <span>Subtotal</span>

                  <span>

                    ₹

                    {order.total || 0}

                  </span>

                </div>

                <div className="flex justify-between">

                  <span>Shipping</span>

                  <span>

                    ₹

                    {order.shippingCharge || 0}

                  </span>

                </div>

                <div className="flex justify-between">

                  <span>Discount</span>

                  <span>

                    ₹

                    {order.discount || 0}

                  </span>

                </div>

                <hr/>

                <div
                  className="
                    flex
                    justify-between
                    text-xl
                    font-bold
                  "
                >

                  <span>

                    Final Total

                  </span>

                  <span>

                    ₹

                    {

                      order.finalTotal ||

                      order.total ||

                      0

                    }

                  </span>

                </div>

              </div>

            </div>

            <div
              className="
                bg-white
                rounded-3xl
                shadow
                p-6
              "
            >

              <h2
                className="
                  text-2xl
                  font-bold
                  mb-6
                "
              >

                Quick Actions

              </h2>

              <div
                className="
                  flex
                  flex-col
                  gap-4
                "
              >

                <button

                  onClick={()=>

                    window.print()

                  }

                  className="
                    bg-blue-600
                    text-white
                    py-3
                    rounded-xl
                    font-semibold
                  "

                >

                  📄 Download Invoice

                </button>

                <Link

                  href="/chat"

                  className="
                    bg-green-600
                    text-white
                    text-center
                    py-3
                    rounded-xl
                    font-semibold
                  "

                >

                  💬 Chat Seller

                </Link>

                {

                  order.status==="Delivered"

                  &&

                  !order.returnRequested

                  &&

                  <Link

                    href={`/profile/returns/new?order=${order.id}`}

                    className="
                      bg-orange-500
                      text-white
                      text-center
                      py-3
                      rounded-xl
                      font-semibold
                    "

                  >

                    🔄 Return Request

                  </Link>

                }

                {

                  order.status==="Delivered"

                  &&

                  <button

                    className="
                      bg-yellow-500
                      text-white
                      py-3
                      rounded-xl
                      font-semibold
                    "

                  >

                    ⭐ Write Review

                  </button>

                }

                <Link

                  href="/profile/orders"

                  className="
                    bg-gray-700
                    text-white
                    text-center
                    py-3
                    rounded-xl
                    font-semibold
                  "

                >

                  ← Back to Orders

                </Link>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}