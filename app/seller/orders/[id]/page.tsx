"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useParams } from "next/navigation";

import {

  doc,

  getDoc,

  updateDoc,

  addDoc,

  collection,

  serverTimestamp

} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function SellerOrderDetailsPage(){

  const params = useParams();

  const id = params.id as string;

  const [loading,setLoading] =
    useState(true);

  const [order,setOrder] =
    useState<any>(null);

  const [status,setStatus] =
    useState("Pending");

  const [trackingNumber,setTrackingNumber] =
    useState("");

  const [courierPartner,setCourierPartner] =
    useState("");

  const [dispatchDate,setDispatchDate] =
    useState("");

  const [expectedDelivery,setExpectedDelivery] =
    useState("");

  const [sellerNotes,setSellerNotes] =
    useState("");

  useEffect(()=>{

    loadOrder();

  },[]);

  const loadOrder = async()=>{

    try{

      const snap = await getDoc(

        doc(
          db,
          "orders",
          id
        )

      );

      if(snap.exists()){

        const data:any={

          id:snap.id,

          ...snap.data()

        };

        setOrder(data);

        setStatus(
          data.status || "Pending"
        );

        setTrackingNumber(
          data.trackingNumber || ""
        );

        setCourierPartner(
          data.courierPartner || ""
        );

        setDispatchDate(
          data.dispatchDate || ""
        );

        setExpectedDelivery(
          data.expectedDelivery || ""
        );

        setSellerNotes(
          data.sellerNotes || ""
        );

      }

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const saveOrder = async()=>{

    try{

      await updateDoc(

        doc(
          db,
          "orders",
          id
        ),

        {

          status,

          trackingNumber,

          courierPartner,

          dispatchDate,

          expectedDelivery,

          sellerNotes,

          updatedAt:
            serverTimestamp()

        }

      );

      await addDoc(

        collection(
          db,
          "notifications"
        ),

        {

          title:
            "Order Status Updated",

          message:

            `Your order ${id.slice(0,8)} is now ${status}`,

          userEmail:
            order.userEmail,

          read:false,

          createdAt:
            serverTimestamp()

        }

      );

      alert("Order Updated");

    }catch(error){

      console.log(error);

      alert("Update Failed");

    }

    await addDoc(

  collection(
    db,
    "notifications"
  ),

  {

    title:

      "Shipping Update",

    message:

      `Your order has been updated to ${status}`,

    userEmail:

      order.userEmail,

    type:

      "shipping",

    read:false,

    createdAt:

      serverTimestamp()

  }

);

  };
  

  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading...

      </div>

    );

  }

  if(!order){

    return(

      <div className="
        p-10
        text-center
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
          from-green-600
          to-blue-600
          text-white
          rounded-3xl
          p-8
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">

            Seller Order Details

          </h1>

          <p className="mt-2">

            Order ID :
            {" "}
            {order.id}

          </p>

        </div>
                <div className="
          grid
          lg:grid-cols-3
          gap-8
        ">

          {/* LEFT */}

          <div className="
            lg:col-span-2
            space-y-8
          ">

            {/* Customer */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-5
              ">

                Customer Information

              </h2>

              <div className="
                grid
                md:grid-cols-2
                gap-4
              ">

                <p>

                  <strong>Name :</strong>

                  {" "}

                  {order.customerName}

                </p>

                <p>

                  <strong>Phone :</strong>

                  {" "}

                  {order.phone}

                </p>

                <p>

                  <strong>Email :</strong>

                  {" "}

                  {order.userEmail}

                </p>

                <p>

                  <strong>Payment :</strong>

                  {" "}

                  {order.paymentMethod}

                </p>

              </div>

              <div className="
                mt-6
              ">

                <strong>

                  Shipping Address

                </strong>

                <div className="
                  mt-2
                  bg-gray-100
                  rounded-xl
                  p-4
                ">

                  {order.address}

                </div>

              </div>

            </div>

            {/* Products */}

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
                space-y-5
              ">

                {order.items?.map(

                  (item:any,index:number)=>(

                    <div

                      key={index}

                      className="
                        flex
                        gap-5
                        items-center
                        border-b
                        pb-5
                      "

                    >

                      <img

                        src={
                          item.image
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
                          font-bold
                          text-lg
                        ">

                          {item.name}

                        </h3>

                        <p>

                          Qty :

                          {" "}

                          {item.qty}

                        </p>

                        <p>

                          Price :

                          ₹{item.price}

                        </p>

                      </div>

                      <div className="
                        text-right
                        font-bold
                      ">

                        ₹

                        {item.price * item.qty}

                      </div>

                    </div>

                  )

                )}

              </div>

            </div>

            <div className="
  mt-6
  flex
  flex-wrap
  gap-2
">

  {[

    "Packed",

    "Shipped",

    "Out For Delivery",

    "Delivered"

  ].map((step)=>(

    <span

      key={step}

      className={`

        px-4

        py-2

        rounded-full

        text-sm

        ${

          [

            "Packed",

            "Shipped",

            "Out For Delivery",

            "Delivered"

          ].indexOf(step)

          <=

          [

            "Pending",

            "Confirmed",

            "Packed",

            "Shipped",

            "Out For Delivery",

            "Delivered"

          ].indexOf(status)

          ?

          "bg-green-600 text-white"

          :

          "bg-gray-200"

        }

      `}

    >

      {step}

    </span>

  ))}

</div>

            {/* Timeline */}

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

                Order Progress

              </h2>

              <div className="
                flex
                flex-wrap
                gap-3
              ">

                {[

                  "Pending",

                  "Confirmed",

                  "Packed",

                  "Shipped",

                  "Out For Delivery",

                  "Delivered"

                ].map((step,index)=>(

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

                        ].indexOf(step)

                        <=

                        [

                          "Pending",

                          "Confirmed",

                          "Packed",

                          "Shipped",

                          "Out For Delivery",

                          "Delivered"

                        ].indexOf(status)

                        ?

                        "bg-green-600 text-white"

                        :

                        "bg-gray-200"

                      }

                    `}

                  >

                    {step}

                  </div>

                ))}

              </div>
             </div>

            </div>
                      {/* RIGHT */}

          <div className="
            space-y-8
          ">

            {/* Order Summary */}

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

                Order Summary

              </h2>

              <div className="
                space-y-4
              ">

                <div className="
                  flex
                  justify-between
                ">

                  <span>

                    Subtotal

                  </span>

                  <span>

                    ₹{order.total || 0}

                  </span>

                </div>

                <div className="
                  flex
                  justify-between
                ">

                  <span>

                    Shipping

                  </span>

                  <span>

                    ₹{order.shippingCharge || 0}

                  </span>

                </div>

                <div className="
                  flex
                  justify-between
                ">

                  <span>

                    Payment

                  </span>

                  <span>

                    {order.paymentMethod}

                  </span>

                </div>

                <div className="
                  border-t
                  pt-4
                  flex
                  justify-between
                  text-xl
                  font-bold
                ">

                  <span>

                    Total

                  </span>

                  <span>

                    ₹

                    {order.finalTotal ||

                     order.total ||

                     0}

                  </span>

                </div>

              </div>

            </div>

            {/* Order Status */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-5
              ">

                Update Status

              </h2>

              <select

                value={status}

                onChange={(e)=>

                  setStatus(

                    e.target.value

                  )

                }

                className="
                  w-full
                  border
                  rounded-xl
                  p-3
                "

              >

                <option>

                  Pending

                </option>

                <option>

                  Confirmed

                </option>

                <option>

                  Packed

                </option>

                <option>

                  Shipped

                </option>

                <option>

                  Out For Delivery

                </option>

                <option>

                  Delivered

                </option>

                <option>

                  Cancelled

                </option>

              </select>

            </div>

            {/* Courier */}

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
                space-y-4
              ">

                <input

                  value={courierPartner}

                  onChange={(e)=>

                    setCourierPartner(

                      e.target.value

                    )

                  }

                  placeholder="Courier Partner"

                  className="
                    w-full
                    border
                    rounded-xl
                    p-3
                  "

                />

                <input

                  value={trackingNumber}

                  onChange={(e)=>

                    setTrackingNumber(

                      e.target.value

                    )

                  }

                  placeholder="Tracking Number"

                  className="
                    w-full
                    border
                    rounded-xl
                    p-3
                  "

                />

                <div>

                  <label className="
                    font-semibold
                  ">

                    Dispatch Date

                  </label>

                  <input

                    type="date"

                    value={dispatchDate}

                    onChange={(e)=>

                      setDispatchDate(

                        e.target.value

                      )

                    }

                    className="
                      w-full
                      border
                      rounded-xl
                      p-3
                      mt-2
                    "

                  />

                </div>

                <div>

                  <label className="
                    font-semibold
                  ">

                    Expected Delivery

                  </label>

                  <input

                    type="date"

                    value={expectedDelivery}

                    onChange={(e)=>

                      setExpectedDelivery(

                        e.target.value

                      )

                    }

                    className="
                      w-full
                      border
                      rounded-xl
                      p-3
                      mt-2
                    "

                  />

                </div>

              </div>

            </div>
            <div className="
  bg-blue-50
  rounded-3xl
  p-6
  border
  border-blue-200
">

  <h2 className="
    text-xl
    font-bold
    mb-4
  ">

    Shipping Status

  </h2>

  <p>

    <strong>Courier:</strong>

    {" "}

    {courierPartner || "-"}

  </p>

  <p>

    <strong>Tracking:</strong>

    {" "}

    {trackingNumber || "-"}

  </p>

  <p>

    <strong>Dispatch:</strong>

    {" "}

    {dispatchDate || "-"}

  </p>

  <p>

    <strong>Expected Delivery:</strong>

    {" "}

    {expectedDelivery || "-"}

  </p>

</div>

            {/* Seller Notes */}

            <div className="
              bg-white
              rounded-3xl
              shadow
              p-6
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-5
              ">

                Seller Notes

              </h2>

              <textarea

                rows={6}

                value={sellerNotes}

                onChange={(e)=>

                  setSellerNotes(

                    e.target.value

                  )

                }

                placeholder="Internal notes..."

                className="
                  w-full
                  border
                  rounded-xl
                  p-4
                "

              />

              <button

                onClick={saveOrder}

                className="
                  w-full
                  mt-6
                  bg-green-600
                  text-white
                  py-3
                  rounded-xl
                  font-semibold
                "

              >

                Save Changes

              </button>

            </div>

          </div>

        </div>
                {/* Quick Actions */}

        <div className="
          mt-8
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

            Quick Actions

          </h2>

          <div className="
            grid
            md:grid-cols-2
            gap-4
          ">

            <button
              className="
                bg-blue-600
                text-white
                py-3
                rounded-xl
                font-semibold
              "
              onClick={()=>
                window.print()
              }
            >

              🖨 Print Invoice

            </button>
            <button

  onClick={()=>

    window.print()

  }

  className="
    bg-indigo-600
    text-white
    py-3
    rounded-xl
    font-semibold
  "

>

  📦 Print Shipping Label

</button>

            <button
              className="
                bg-purple-600
                text-white
                py-3
                rounded-xl
                font-semibold
              "
              onClick={()=>
                alert(
                  "Invoice download coming soon."
                )
              }
            >

              📄 Download Invoice

            </button>

            <Link

              href={`/seller/chat`}

              className="
                bg-green-600
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              💬 Chat Customer

            </Link>

            <a

              href={`tel:${order.phone}`}

              className="
                bg-orange-500
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              📞 Call Customer

            </a>

            <a

              href={`mailto:${order.userEmail}`}

              className="
                bg-red-600
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              ✉ Email Customer

            </a>

            <Link

              href="/seller/orders"

              className="
                bg-gray-700
                text-white
                py-3
                rounded-xl
                font-semibold
                text-center
              "

            >

              ← Back To Orders

            </Link>

          </div>

        </div>

      </div>

    </div>

  );

}