"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,addDoc,
   serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Order = {

  id: string;

  customerName: string;

  userEmail?: string;

  userId?: string;

  total: number;

  finalTotal?: number;

  status: string;

  paymentMethod?: string;

  paymentStatus?: string;

  vendorId?: string;

  createdAt: any;

};

export default function AdminOrdersPage(){

  const [orders,setOrders] =
    useState<Order[]>([]);

  const [loading,setLoading] =
    useState(true);
    const [search,setSearch] =
  useState("");

  useEffect(()=>{

    loadOrders();

  },[]);

  const loadOrders =
    async ()=>{

    try{

      const snapshot =
        await getDocs(
          collection(
            db,
            "orders"
          )
        );

      const items:any[] =
        [];

snapshot.forEach((docSnap) => {

  const data = docSnap.data();

  items.push({

    id: docSnap.id,

    customerName: data.customerName || "Customer",

    userId: data.userId || "",

    userEmail: data.userEmail || "",

    vendorId: data.vendorId || "",

    total: data.total || 0,

    finalTotal: data.finalTotal || data.total,

    paymentMethod: data.paymentMethod || "",

    paymentStatus: data.paymentStatus || "",

    status: data.status || "Pending",

    createdAt:
      data.createdAt?.toDate?.()?.toLocaleDateString() || "-",

    courierName: data.courierName || "",

    trackingNumber: data.trackingNumber || "",

    expectedDelivery: data.expectedDelivery || "",

  });

});

setOrders(items);

} catch (error) {

  console.error("Failed to load orders:", error);

} finally {

  setLoading(false);

}
}

  const totalOrders =
  orders.length;

const pendingOrders =
  orders.filter(
    o => o.status === "Pending"
  ).length;

const deliveredOrders =
  orders.filter(
    o => o.status === "Delivered"
  ).length;
  const shippedOrders =
  orders.filter(
    o =>

      o.status ===
      "Shipped"

      ||

      o.status ===
      "Out For Delivery"
  ).length;

const totalRevenue =
  orders.reduce(
    (sum,o)=>
      sum + o.total,
    0
  );

  const updateStatus =
    async (
      orderId:string,
      status:string
    )=>{

    try{

      await updateDoc(

        doc(
          db,
          "orders",
          orderId
        ),

        { status }

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
      `Order ${orderId.slice(0,8)} status changed to ${status}`,

    type:
      "order",

    read:false,

    createdAt:
    serverTimestamp(),

  }

);
const currentOrder = orders.find(
  (order) => order.id === orderId
);

if (currentOrder?.userId) {

  await addDoc(
    collection(db, "notifications"),
    {
      userId: currentOrder.userId,
      role: "customer",
      title: "📦 Order Updated",
      message: `Your order is now ${status}.`,
      type: "order",
      read: false,
      createdAt: serverTimestamp(),
    }
  );

}

      setOrders(

        orders.map(
          (order)=>{

            if(
              order.id ===
              orderId
            ){

              return {
                ...order,
                status
              };

            }

            return order;

          }
        )

      );

    }catch(error){

      console.log(error);

    }

  };

  const updateShipping =
  async (
    orderId:string,
    field:string,
    value:string
  ) => {

    try{

      await updateDoc(

        doc(
          db,
          "orders",
          orderId
        ),

        {
          [field]: value
        }

      );

    }catch(error){

      console.log(error);

    }

  };

  return (

    <div className="min-h-screen bg-gray-100">

      <div className="max-w-7xl mx-auto p-8">

        <div className="
  bg-gradient-to-r
  from-green-600
  to-blue-600
  text-white
  p-8
  rounded-3xl
  mb-8
">

  <h1 className="
    text-4xl
    font-bold
  ">
    Admin Orders
  </h1>

  <p className="opacity-90">
    Manage marketplace orders and delivery status
  </p>

</div>

        <div className="
  grid
  grid-cols-1
  md:grid-cols-4
  gap-6
  mb-8
">

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>📦 Total Orders</h3>
    <p className="text-3xl font-bold">
      {totalOrders}
    </p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>⏳ Pending Orders</h3>
    <p className="text-3xl font-bold text-yellow-600">
      {pendingOrders}
    </p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>✅ Delivered Orders</h3>
    <p className="text-3xl font-bold text-green-600">
      {deliveredOrders}
    </p>
  </div>

  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>💰 Revenue</h3>
    <p className="text-3xl font-bold text-blue-600">
      ₹{totalRevenue}
    </p>
  </div>
  <div className="bg-white p-6 rounded-2xl shadow">
    <h3>🚚 In Transit</h3>
    <p className="text-3xl font-bold text-blue-600">
      {shippedOrders}
    </p>
  </div>

</div>

<input
  type="text"
  placeholder="Search Order ID or Customer..."
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

        {loading ? (

          <div className="
  bg-white
  rounded-3xl
  shadow
  p-10
  text-center
">

  <p className="
    text-lg
    text-gray-500
  ">
    Loading Orders...
  </p>

</div>
        ) : (

          <div className="
            bg-white
            rounded-2xl
            shadow
            p-6
            overflow-x-auto
          ">

            <table className="w-full">

              <thead>

                <tr className="border-b">

                  <th className="text-left py-4">
                    Order ID
                  </th>

                  <th className="text-left py-4">
                    Customer
                  </th>

                  <th className="text-left py-4">
                    Amount
                  </th>

                  <th className="text-left py-4">
                    Status
                  </th>

                  <th className="text-left py-4">
                    Date
                  </th>

                 <th className="text-left py-4">
  Courier
</th>

<th className="text-left py-4">
  Tracking
</th>

<th className="text-left py-4">
  Expected Delivery
</th>

<th className="text-left py-4">
  Invoice
</th>
</tr>
</thead>
<tbody>
{orders.length === 0 && (
  <tr>
    <td
      colSpan={6}
      className="
        text-center
        py-10
        text-gray-500
      "
    >
      No Orders Found
    </td>
  </tr>
)}

               {orders
  .filter((order)=>

    order.id
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

    ||

    order.customerName
      .toLowerCase()
      .includes(
        search.toLowerCase()
      )

  )
  .map(
    (order)=>(
                  <tr
                    key={order.id}
                    className="
                      border-b
                    "
                  >

                    <td className="py-4">
                      {order.id.slice(0,8)}
                    </td>

                    <td>
                      {order.customerName}
                    </td>

                    <td>
                     ₹{
  (order as any).finalTotal ||
  order.total
}
                    </td>

                    <td>

  <div className="mb-2"> </div>

    <span
      className={` px-3 py-1 rounded-full text-sm font-semibold ${
          order.status === "Delivered"
          ? "bg-green-100 text-green-700"

          : order.status === "Cancelled"
          ? "bg-red-100 text-red-700"

          : order.status === "Out For Delivery"
          ? "bg-blue-100 text-blue-700"

          : "bg-yellow-100 text-yellow-700"
        }
      `}
    >

      {order.status}

       </span>

      <div className=" w-full bg-gray-200 h-2 rounded-full mt-2 ">
<div
    className={`h-2 rounded-full bg-green-600 ${
        order.status === "Pending"
          ? "w-[15%]"
        : order.status === "Confirmed"
          ? "w-[30%]"
        : order.status === "Packed"
          ? "w-[50%]"
        : order.status === "Shipped"
          ? "w-[70%]"
        : order.status === "Out For Delivery"
          ? "w-[90%]"
        : order.status === "Delivered"
          ? "w-full"
          : "w-0"
      }
    `}
  />
 </div>

  <select

    value={order.status}

    onChange={(e)=> updateStatus( order.id, e.target.value ) }

    className=" border p-2 rounded-lg " >
<option>Pending</option>
<option>Confirmed</option>
<option>Packed</option>
<option>Shipped</option>
<option>Out For Delivery</option>
<option>Delivered</option>
<option>Cancelled</option>
                      </select>

                    </td>

                    <td>
                      {order.createdAt}
                    </td>
                   <td>

  <input
    type="text"
    defaultValue={
      (order as any).courierName || ""
    }

    onBlur={(e)=>

      updateShipping(

        order.id,

        "courierName",

        e.target.value

      )

    }

    className="
      border
      p-2
      rounded-lg
      w-32
    "
  />

</td>

<td>

  <input
    type="text"
    defaultValue={
      (order as any).trackingNumber || ""
    }

    onBlur={(e)=>

      updateShipping(

        order.id,

        "trackingNumber",

        e.target.value

      )

    }

    className="
      border
      p-2
      rounded-lg
      w-40
    "
  />

</td>

<td>

  <input
    type="date"

    defaultValue={
      (order as any)
        .expectedDelivery || ""
    }

    onBlur={(e)=>

      updateShipping(

        order.id,

        "expectedDelivery",

        e.target.value

      )

    }

    className="
      border
      p-2
      rounded-lg
    "
  />

</td>
<td>
  <a
    href={`/invoice/${order.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="
     bg-gradient-to-r
from-green-600
to-blue-600
      text-white
      px-3
      py-2
      rounded-lg
    "
  >
    Invoice
  </a>
</td>
</tr>
))}
</tbody>
</table>
</div>
)}
</div>
</div> 
);
}