"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  collection,
  getDocs,
  orderBy,
  query
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export default function CustomerOrdersPage(){

  const [orders,setOrders] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  const [search,setSearch] =
    useState("");

  useEffect(()=>{

    loadOrders();

  },[]);

  const loadOrders = async()=>{

    try{

      const user = auth.currentUser;

      if(!user){

        setLoading(false);

        return;

      }

      const snapshot = await getDocs(

        query(

          collection(
            db,
            "orders"
          ),

          orderBy(
            "createdAt",
            "desc"
          )

        )

      );

      const list:any[]=[];

      snapshot.forEach(docSnap=>{

        const data:any={

          id:docSnap.id,

          ...docSnap.data()

        };

        if(

          data.userEmail===

          user.email

        ){

          list.push(data);

        }

      });

      setOrders(list);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const filtered =

    orders.filter(

      (order:any)=>

        order.id

        .toLowerCase()

        .includes(

          search.toLowerCase()

        )

        ||

        (order.customerName || "")

        .toLowerCase()

        .includes(

          search.toLowerCase()

        )

    );

  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading Orders...

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

            My Orders

          </h1>

          <p className="mt-2">

            Track all your purchases

          </p>

        </div>

        <div className="
          bg-white
          rounded-2xl
          shadow
          p-5
          mb-6
        ">

          <p className="
            text-lg
            font-semibold
          ">

            Total Orders : {orders.length}

          </p>

        </div>

        <input

          type="text"

          placeholder="Search Order..."

          value={search}

          onChange={(e)=>

            setSearch(

              e.target.value

            )

          }

          className="
            w-full
            border
            rounded-2xl
            p-4
            mb-8
          "

        />
                {

          filtered.length===0

          ?

          <div className="
            bg-white
            rounded-3xl
            shadow
            p-10
            text-center
          ">

            No orders found.

          </div>

          :

          <div className="
            space-y-6
          ">

            {

              filtered.map(

                (order:any)=>(

                  <div

                    key={order.id}

                    className="
                      bg-white
                      rounded-3xl
                      shadow
                      p-6
                    "

                  >

                    <div className="
                      flex
                      flex-col
                      lg:flex-row
                      lg:justify-between
                      lg:items-center
                      gap-6
                    ">

                      <div className="
                        flex-1
                      ">

                        <h2 className="
                          text-xl
                          font-bold
                        ">

                          Order #

                          {order.id.slice(0,8)}

                        </h2>

                        <p className="
                          text-gray-500
                          mt-2
                        ">

                          {

                            order.createdAt?.toDate

                            ?

                            order.createdAt

                            .toDate()

                            .toLocaleDateString()

                            :

                            "-"

                          }

                        </p>

                        <p className="
                          mt-2
                        ">

                          Customer

                          :

                          {" "}

                          {order.customerName}

                        </p>

                        <p>

                          Payment

                          :

                          {" "}

                          {order.paymentMethod}

                        </p>

                      </div>

                      <div className="
                        text-center
                      ">

                        <div className={`

                          inline-block

                          px-4

                          py-2

                          rounded-full

                          text-sm

                          font-semibold

                          ${

                            order.status==="Delivered"

                            ?

                            "bg-green-100 text-green-700"

                            :

                            order.status==="Cancelled"

                            ?

                            "bg-red-100 text-red-700"

                            :

                            order.status==="Out For Delivery"

                            ?

                            "bg-blue-100 text-blue-700"

                            :

                            "bg-yellow-100 text-yellow-700"

                          }

                        `}>

                          {order.status}

                        </div>

                        <p className="
                          mt-3
                          font-bold
                          text-xl
                        ">

                          ₹

                          {

                            order.finalTotal ||

                            order.total ||

                            0

                          }

                        </p>

                      </div>

                    </div>

                    <hr className="
                      my-6
                    "/>

                    <div className="
                      space-y-4
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
                              "

                            >

                              <img

                                src={

                                  item.image ||

                                  "/placeholder.png"

                                }

                                alt=""

                                className="
                                  w-20
                                  h-20
                                  rounded-xl
                                  object-cover
                                "

                              />

                              <div className="
                                flex-1
                              ">

                                <h3 className="
                                  font-semibold
                                ">

                                  {item.name}

                                </h3>

                                <p>

                                  Qty :

                                  {item.qty}

                                </p>

                              </div>

                              <div className="
                                font-bold
                              ">

                                ₹

                                {item.price}

                              </div>

                            </div>

                          )

                        )

                      }

                    </div>

                    <hr className="
                      my-6
                    "/>

                    <div className="
                      flex
                      flex-wrap
                      gap-3
                    ">

                    <Link

                        href={`/profile/orders/${order.id}`}

                        className="
                          bg-blue-600
                          text-white
                          px-5
                          py-3
                          rounded-xl
                          font-semibold
                        "

                      >

                        👁 View Details

                      </Link>

                      <Link

                        href={`/profile/orders/${order.id}`}

                        className="
                          bg-green-600
                          text-white
                          px-5
                          py-3
                          rounded-xl
                          font-semibold
                        "

                      >

                        🚚 Track Order

                      </Link>

                      <Link

                        href="/chat"

                        className="
                          bg-indigo-600
                          text-white
                          px-5
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

                        <button

                          className="
                            bg-orange-500
                            text-white
                            px-5
                            py-3
                            rounded-xl
                            font-semibold
                          "

                        >

                          🔄 Return Request

                        </button>

                      }

                      {

                        order.status==="Delivered"

                        &&

                        <button

                          className="
                            bg-yellow-500
                            text-white
                            px-5
                            py-3
                            rounded-xl
                            font-semibold
                          "

                        >

                          ⭐ Write Review

                          

                        </button>
         

                      }

                    </div>

                  </div>

                    )

              )

            }

          </div>

        }

      </div>

      </div>

  );

}