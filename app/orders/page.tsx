"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

import { db }
from "@/lib/firebase";
import {
  useRouter
} from "next/navigation";

export default function OrdersPage(){

  const router =
  useRouter();

 const [orders,setOrders] =
  useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    const user =
  localStorage.getItem(
    "user"
  );

if(!user){

  alert(
    "Please login first"
  );

  router.push("/login");

  return;

}

    const fetchOrders =
async()=>{

  try{

    const userData =

      JSON.parse(

        localStorage.getItem(
          "user"
        ) || "{}"

      );

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

    const items:any[] = [];

    snapshot.forEach((doc)=>{

      const order:any =
        doc.data();

      if(

        order.userEmail ===
        userData.email

      ){

        items.push({

          id:doc.id,

          ...order,

        });

      }

    });

    setOrders(items);

  }catch(error){

    console.log(error);

  }

  setLoading(false);

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

            {orders.map((order:any,index:number)=>(

              <div
                key={index}
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
                      Order #{index + 1}
                    </h2>

                    <p className="
                      text-gray-500
                      mt-1
                    ">
                      {order.customerName}
                    </p>

                  </div>

                  <div className="
                    text-right
                  ">

                    <p className="
                      text-xl
                      font-bold
                    ">
                      ₹{order.total}
                    </p>

                    <a
  href={`/invoice/${order.id}`}
  target="_blank"
  className="
    bg-blue-600
    text-white
    px-4
    py-2
    rounded-lg
  "
>
  Download Invoice
</a>

                    <span className={`
  px-4
  py-2
  rounded-full
  text-sm
  font-semibold

  ${
    order.status ===
    "Delivered"

    ? "bg-green-100 text-green-700"

    : order.status ===
      "Shipped"

    ? "bg-blue-100 text-blue-700"

    : order.status ===
      "Out For Delivery"

    ? "bg-orange-100 text-orange-700"

    : "bg-yellow-100 text-yellow-700"
  }
`}>

  {order.status}

</span>

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