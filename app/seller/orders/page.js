"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db }
from "@/lib/firebase";

export default function SellerOrdersPage(){

  const [orders,setOrders] =
    useState([]);

  const [loading,setLoading] =
    useState(true);

    const [search,setSearch] =
  useState("");

  useEffect(()=>{

    const fetchOrders =
      async ()=>{

      const user =
        auth.currentUser;

      if(!user){

        setLoading(false);

        return;
      }

      const vendorId =
        user.uid;

      const q = query(

        collection(
          db,
          "orders"
        ),

        orderBy(
          "createdAt",
          "desc"
        )

      );

      const snapshot =
        await getDocs(q);

      const sellerOrders =
        [];

      snapshot.forEach((docSnap)=>{

        const order = {

          id: docSnap.id,

          ...docSnap.data()

        };

        const myItems =

          order.items.filter(

            (item)=>

              item.vendorId ===
              vendorId

          );

        if(
          myItems.length > 0
        ){

          sellerOrders.push({

            ...order,

            items: myItems

          });

        }

      });

      setOrders(
        sellerOrders
      );

      setLoading(false);

    };

    fetchOrders();

  },[]);

  const updateStatus =
    async(
      orderId,
      newStatus
    )=>{

    try{

      await updateDoc(

        doc(
          db,
          "orders",
          orderId
        ),

        {

  status:newStatus,

  updatedAt:
    serverTimestamp()

}
      );

      setOrders((prev)=>

        prev.map((order)=>

          order.id === orderId

            ? {

                ...order,

                status:newStatus

              }

            : order

        )

      );

      alert(
        "Status Updated"
      );

    }catch(err){

      alert(
        "Error Updating Status"
      );

    }

  };

  if(loading){

    return(

      <div className="p-5">

        Loading...

      </div>

    );

  }

  return(

    <div className="p-5">

      <div className="
  bg-gradient-to-r
  from-green-600
  to-blue-600
  text-white
  p-6
  rounded-3xl
  mb-6
">

  <h1 className="
    text-4xl
    font-bold
  ">
    Seller Orders
  </h1>

  <p className="opacity-90">
    Manage customer orders and delivery status
  </p>

</div>

<div className="
  mb-6
  bg-white
  p-4
  rounded-2xl
  shadow
">

  <p className="
    text-lg
    font-semibold
  ">
    Total Orders: {orders.length}
  </p>

</div>

<input
  type="text"
  placeholder="Search Order ID / Customer..."
  value={search}
  onChange={(e)=>
    setSearch(e.target.value)
  }
  className="
    w-full
    border
    p-4
    rounded-2xl
    mb-6
  "
/>

      {orders.length === 0 ? (

      <div className="
  bg-white
  p-10
  rounded-3xl
  text-center
  shadow
">

  <p className="
    text-gray-500
    text-lg
  ">
    No orders available yet.
  </p>

</div>

      ) : (

        <div className="space-y-5">

         {orders
  .filter((order)=>

    order.id
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

    ||

    order.customerName
      ?.toLowerCase()
      .includes(
        search.toLowerCase()
      )

  )
  .map((order)=>(

            <div

              key={order.id}

              className="
                bg-white
                border
                rounded-xl
                p-5
                shadow
              "
            >

              <h2
                className="
                  font-bold
                  text-lg
                "
              >
                Order ID:
                {" "}
                {order.id.slice(0,8)}
              </h2>

              <p>
                Customer:
                {" "}
                {order.customerName}
              </p>

              <p>
  Date:
  {" "}
  {
    order.createdAt?.toDate
      ? order.createdAt
          .toDate()
          .toLocaleDateString()
      : "-"
  }
</p>

              <p>
                Phone:
                {" "}
                {order.phone}
              </p>
              <p>
  Email:
  {" "}
  {order.userEmail}
</p>

              <p>
                Address:
                {" "}
                {order.address}
              </p>

              <div className="mt-4">

                <p
                  className="
                    font-semibold
                    mb-2
                  "
                >
                  Status:
                  {" "}
                  <span
  className={`
    px-3
    py-1
    rounded-full
    text-sm
    font-semibold

    ${
      order.status === "Delivered"
      ? "bg-green-100 text-green-700"

      : order.status === "Cancelled"
      ? "bg-red-100 text-red-700"

      : order.status ===
        "Out For Delivery"
      ? "bg-blue-100 text-blue-700"

      : "bg-yellow-100 text-yellow-700"
    }
  `}
>

  {order.status}

</span>
                </p>

                <select

                  value={
                    order.status
                  }

                  onChange={(e)=>

                    updateStatus(

                      order.id,

                      e.target.value

                    )

                  }

                  className="
                    border
                    p-2
                    rounded-lg
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

              <div className="
  mt-4
  flex
  flex-wrap
  gap-2
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
        px-3
        py-1
        rounded-full
        text-xs

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
  ].indexOf(order.status)

  ? "bg-green-600 text-white"

  : "bg-gray-200"
}
      `}
    >

      {step}

    </div>

  ))}

</div>

              <hr className="my-4" />

              {order.items.map(

                (
                  item,
                  index
                )=>(

                  <div
                    key={index}
                    className="mb-3"
                  >

                    <p
                      className="
                        font-semibold
                      "
                    >
                      {item.name}
                    </p>

                    <p>
  ₹{item.price}
  {" × "}
  {item.qty}
  {" = "}
  ₹{item.price * item.qty}
</p>

                  </div>

                )

              )}

              <div
  className="
    mt-6
    flex
    flex-wrap
    gap-3
  "
>

  <Link

    href={`/seller/orders/${order.id}`}

    className="
      bg-blue-600
      text-white
      px-4
      py-2
      rounded-lg
      hover:bg-blue-700
    "

  >

    View Details

  </Link>

</div>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}