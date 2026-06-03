"use client";

import { useEffect, useState } from "react";

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

      <h1
        className="
          text-3xl
          font-bold
          mb-6
        "
      >
        Seller Orders
      </h1>

      {orders.length === 0 ? (

        <p>
          No Orders Found
        </p>

      ) : (

        <div className="space-y-5">

          {orders.map((order)=>(

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

            </div>

          ))}

        </div>

      )}

    </div>

  );

}