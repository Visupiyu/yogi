"use client";

import {useEffect,useState,
} from "react";
import {
  collection,
  getDocs,
  query,
  where,
  } from "firebase/firestore";
import { db }
from "@/lib/firebase";
import {useRouter
} from "next/navigation";

export default function OrdersPage(){
  const router =useRouter();
 const [orders,setOrders] =useState<any[]>([]);
  const [loading,setLoading] =useState(true);
  useEffect(()=>{const user =localStorage.getItem("user");
if(!user){alert("Please login first");
  router.push("/login");
  return;
}
   const fetchOrders = async () => {
  try {
    const userData = JSON.parse(localStorage.getItem("user") || "{}");

    const q = query(
      collection(db, "orders"),
      where("userEmail", "==", userData.email)
    );

    const snapshot = await getDocs(q);
    const items: any[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });

    const unique = Array.from(new Map(items.map((o) => [o.id, o])).values());

unique.sort(
  (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
);

setOrders(unique);

    // Newest first (no composite index needed)
    items.sort(
      (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    );

    setOrders(items);
  } catch (error) {
    console.error("Failed to load orders:", error);
  } finally {
    setLoading(false);
  }
};
    fetchOrders();

  },[]);

  const getStep = (
  status:string = ""
) => {

  switch(status){

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

  if(loading){

    return(

      <div className="
        py-20
        text-center
      ">
        Loading orders...
      </div>

    );

  }

  return(

    <section className="
      py-10
      px-4
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <h1 className="
          text-4xl
          font-bold
          mb-10
        ">
          My Orders
        </h1>

        {orders.length === 0 ? (

          <div className="
            bg-white
            rounded-3xl
            shadow-md
            p-10
            text-center
          ">

            <p className="
              text-gray-500
              text-lg
            ">
              No orders found
            </p>

          </div>

        ) : (

          <div className="
            space-y-8
          ">

            {orders.map((order: any) => (
  <div
    key={order.id}
                className="
                  bg-white
                  rounded-3xl
                  shadow-md
                  p-8
                "
              >

                {/* TOP */}

                <div className="
                  flex
                  flex-col
                  md:flex-row
                  md:items-center
                  md:justify-between
                  gap-4
                  border-b
                  pb-5
                  mb-6
                ">

                  <div>

                    <h2 className="
                      text-2xl
                      font-bold
                    ">
                      Order ID: {order.id.slice(0,8)}
                    </h2>

                    <p className="
                      text-gray-500
                      mt-1
                    ">
                      {order.customerName}
                    </p>
                    <p className="
  text-sm
  text-gray-400
">
  {order.createdAt?.seconds
    ? new Date(
        order.createdAt.seconds * 1000
      ).toLocaleDateString()
    : "Date unavailable"}
</p>

  </div>

 <div
  className="
    w-full
    md:w-72
    flex
    flex-col
    gap-3
  "
>
<div>

  <p className="
    text-xl
    font-bold
  ">
    ₹{
      order.finalTotal ||
      order.total
    }
  </p>

  <p className="
    text-sm
    text-gray-500
  ">
    {
      order.items?.length || 0
    } Items
  </p>
  <p className="
  text-sm
  font-semibold
  mt-2
">
  Payment:
  <div className="flex justify-center my-4">
   <span
    className="
      px-4
      py-2
      rounded-full
      bg-yellow-100
      text-yellow-700
      font-semibold
    "
  >
    Pending
     </span>
</div>

</p>
<p className="
  text-sm
  text-gray-500
">
  Method:
  {" "}
  {order.paymentMethod || "COD"}
</p>

</div>

 <a
  href={`/invoice/${order.id}`}
  target="_blank"
  rel="noopener noreferrer"
  className="
w-full
h-12
bg-blue-600
hover:bg-blue-700
rounded-xl
font-semibold
text-white
flex
items-center
justify-center
"
>
  Download Invoice
</a>
{order.chatId ? (

  <a
    href={`/chat/${order.chatId}`}
    className="
      bg-green-600
      text-white
      px-4
      py-2
      rounded-lg
      mt-2
      inline-block
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
bg-gray-300
text-gray-600
rounded-xl
font-semibold
flex
items-center
justify-center
cursor-not-allowed
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
bg-purple-600
hover:bg-purple-700
rounded-xl
font-semibold
text-white
flex
items-center
justify-center
"
>
  📍 Track Order
</a>

 <div
  className="
    border
    rounded-xl
    p-4
    text-center
  "
>

  <span
    className={`
      inline-block
      px-4
      py-2
      rounded-full
      text-sm
      font-semibold

      ${
        order.status === "Delivered"

          ? "bg-green-100 text-green-700"

          : order.status === "Shipped"

          ? "bg-blue-100 text-blue-700"

          : order.status === "Out For Delivery"

          ? "bg-orange-100 text-orange-700"

          : "bg-yellow-100 text-yellow-700"
      }
    `}
  >

    {order.status}

  </span>

  <p className="text-xs text-gray-500 mt-2">

    Tracking Updated

  </p> 

{order.expectedDelivery && (

  <p className="
    text-sm
    text-green-600
  ">
    📅 Expected Delivery:
    {" "}
    {order.expectedDelivery}
  </p>

)}

{order.courierName && (

  <p className="
    text-sm
    text-blue-600
  ">
    🚚 Delivery Partner:
    {" "}
    {order.courierName}
  </p>

)}

{order.trackingNumber && (

  <p className="
  text-sm
  text-purple-600
">
  📦 Tracking:
  {" "}
  {order.trackingNumber}

  <button
    onClick={() => {

  if (order.trackingNumber) {

    navigator.clipboard.writeText(
      order.trackingNumber
    );

    alert("Tracking number copied!");

  }

}}
    className="
      ml-2
      text-blue-600
    "
  >
    Copy
  </button>
</p>

)}
</div>

{order.status === "Pending" && (

   <button
    className="
w-full
h-12
bg-red-600
hover:bg-red-700
rounded-xl
font-semibold
text-white
flex
items-center
justify-center
"
  >
    Cancel Order
  </button>

)}

{order.status === "Delivered" && (

  

  <div className="
    bg-green-100
    text-green-700
    px-4
    py-2
    rounded-xl
    text-sm
    font-semibold
  ">

    🎉 Order Delivered Successfully

    <a
  href={`/returns?orderId=${order.id}`}
  className="
    mt-3
    bg-orange-500
    text-white
    px-4
    py-2
    rounded-lg
    text-sm
    inline-block
  "
>
  Request Return
</a>



  </div>

)}

                  </div>

                </div>
                 <div className="
  mt-8
">

  <div className="
    flex
    justify-between
    items-center
    gap-2
  ">

    {[  
  "📝 Placed",
  "✅ Confirmed",
  "📦 Packed",
  "🚚 Shipped",
  "🏍️ Out For Delivery",
  "🎉 Delivered"
    ].map(

      (
        step,
        index
      )=>(

      <div
     key={order.id}
        className="
          flex-1
          text-center
        "
      >

        <div className={`
          w-10
          h-10
          mx-auto
          rounded-full
          flex
          items-center
          justify-center
          text-white
          font-bold
          ${
           getStep( 
              order.status
            ) >= index + 1

            ? "bg-green-600"

            : "bg-gray-300"
          }
        `}>

          {index + 1}

        </div>

        <p className="
          text-xs
          mt-2
          leading-5
        ">
          {step}
        </p>

      </div>

    ))}

  </div>

</div>
                

                {/* ITEMS */}

                <div className="
                  space-y-5
                ">

                  {order.items?.map(
                    (item:any,i:number)=>(

                    <div
                      key={i}
                      className="
                        flex
                        items-center
                        gap-4
                      "
                    >

                      <img
                        src={
                          item.image ||
                          "/no-image.png"
                        }
                        alt=""
                        className="
                          w-20
                          h-20
                          rounded-2xl
                          object-cover
                        "
                      />

                      <div className="
                        flex-1
                      ">

                        <h3 className="
                          font-bold
                        ">
                          {item.name}
                        </h3>

                        <p className="
                          text-gray-500
                          text-sm
                        ">
                          Qty:
                          {" "}
                          {item.qty}
                        </p>

                      </div>

                      <p className="
                        font-bold
                      ">
                        ₹
                        {item.price *
                         item.qty}
                      </p>

                    </div>

                  ))}

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </section>

  );

}