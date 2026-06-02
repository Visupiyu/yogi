"use client";

import Link from "next/link";

import {
  useEffect,
  useState
} from "react";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

export default function
ProfilePage(){

  const [user,setUser] =
  useState<any>(null);

  const [recentOrders,
setRecentOrders] =
useState<any[]>([]);

useEffect(()=>{

  if(typeof window !== "undefined"){

    const savedUser =
      localStorage.getItem("user");

    if(savedUser){

      setUser(
        JSON.parse(savedUser)
      );

      const userData =
  JSON.parse(savedUser);

const loadOrders =
async()=>{

  try{

    const q = query(

      collection(
        db,
        "orders"
      ),

      where(
        "userEmail",
        "==",
        userData.email
      ),

      orderBy(
        "createdAt",
        "desc"
      )

    );

    const snapshot =
      await getDocs(q);

    const data:any[] = [];

    snapshot.forEach((doc)=>{

      data.push({

        id:doc.id,

        ...doc.data()

      });

    });

    setRecentOrders(
      data.slice(0,3)
    );

  }catch(error){

    console.log(error);

  }

};

loadOrders();

    }else{

      window.location.href =
        "/login";

    }

  }

},[]);


 return (

    <section className="
      min-h-screen
      bg-gray-100
      py-10
      px-4
      pb-28
    ">

      <div className="
        max-w-6xl
        mx-auto
      ">

        {/* HEADER */}

        <div className="
          bg-gradient-to-r
          from-green-500
          to-green-700
          text-white
          rounded-3xl
          p-10
          mb-10
          shadow-lg
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            My Account
          </h1>

          <p className="
            mt-3
            text-lg
            opacity-90
          ">
            Welcome

{" "}

{user?.email || "Customer"}

          </p>

        </div>

        <div className="
  flex
  justify-end
  mb-8
">

  <button

    onClick={()=>{

      localStorage.removeItem(
        "user"
      );

      window.location.href =
        "/login";

    }}

    className="
      bg-red-500
      hover:bg-red-600
      text-white
      px-6
      py-3
      rounded-2xl
      font-semibold
    "
  >

    Logout

  </button>

</div>

        {/* QUICK ACTIONS */}

        <div className="
          grid
          grid-cols-1
          sm:grid-cols-2
          lg:grid-cols-4
          gap-6
        ">

          {/* ORDERS */}

          <Link href="/orders">

            <div className="
              bg-white
              rounded-3xl
              shadow-md
              p-8
              hover:shadow-xl
              transition
              duration-300
              cursor-pointer
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-3
              ">
                My Orders
              </h2>

              <p className="
                text-gray-500
                leading-7
              ">
                Track and manage
                your orders
              </p>

            </div>

          </Link>

          {/* WISHLIST */}

          <Link href="/wishlist">

            <div className="
              bg-white
              rounded-3xl
              shadow-md
              p-8
              hover:shadow-xl
              transition
              duration-300
              cursor-pointer
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-3
              ">
                Wishlist
              </h2>

              <p className="
                text-gray-500
                leading-7
              ">
                View saved
                favorite products
              </p>

            </div>

          </Link>

          <Link href="/orders">

  <div className="
    bg-white
    rounded-3xl
    shadow-md
    p-8
    hover:shadow-xl
    transition
    duration-300
    cursor-pointer
  ">

    <h2 className="
      text-2xl
      font-bold
      mb-3
    ">

      Recent Orders

    </h2>

    <p className="
      text-gray-500
      leading-7
    ">

      View latest purchases
      and delivery updates

    </p>

  </div>

</Link>

          {/* CART */}

          <Link href="/cart">

            <div className="
              bg-white
              rounded-3xl
              shadow-md
              p-8
              hover:shadow-xl
              transition
              duration-300
              cursor-pointer
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-3
              ">
                Cart
              </h2>

              <p className="
                text-gray-500
                leading-7
              ">
                Review your
                shopping cart
              </p>

            </div>

          </Link>

          {/* SETTINGS */}

          <Link href="/settings">

            <div className="
              bg-white
              rounded-3xl
              shadow-md
              p-8
              hover:shadow-xl
              transition
              duration-300
              cursor-pointer
            ">

              <h2 className="
                text-2xl
                font-bold
                mb-3
              ">
                Settings
              </h2>

              <p className="
                text-gray-500
                leading-7
              ">
                Manage account
                preferences
              </p>

            </div>

          </Link>

        </div>

        {/* ACCOUNT INFO */}

        <div className="
          bg-white
          rounded-3xl
          shadow-md
          p-10
          mt-10
        ">

          <h2 className="
            text-3xl
            font-bold
            mb-6
          ">
            Account Information
          </h2>

          <div className="
            grid
            grid-cols-1
            md:grid-cols-2
            gap-6
          ">

            <div>

              <p className="
                text-gray-500
                mb-2
              ">
                Account Type
              </p>

              <h3 className="
                text-xl
                font-semibold
              ">
                Customer Account
              </h3>

            </div>

            <div>

              <p className="
                text-gray-500
                mb-2
              ">
                Marketplace
              </p>

              <h3 className="
                text-xl
                font-semibold
              ">
                Yogi Mart
              </h3>

              <div className="
  bg-white
  rounded-3xl
  shadow-md
  p-10
  mt-10
">

  <h2 className="
    text-3xl
    font-bold
    mb-6
  ">

    Saved Address

  </h2>

  <p className="
    text-gray-500
    leading-8
  ">

    Add your delivery
    addresses during
    checkout for faster
    shopping experience.

  </p>

</div>

            </div>

          </div>

        </div>

        <div className="
  bg-white
  rounded-3xl
  shadow-md
  p-10
  mt-10
">

  <h2 className="
    text-3xl
    font-bold
    mb-6
  ">
    Recent Orders
  </h2>

  {
    recentOrders.length === 0 ?

    (

      <p className="
        text-gray-500
      ">
        No orders found
      </p>

    )

    :

    recentOrders.map(
      (order:any)=>(
        <div
          key={order.id}
          className="
            border-b
            py-4
          "
        >

          <p className="
            font-semibold
          ">
            Order ID:
            {" "}
            {order.id}
          </p>

          <p>
            Status:
            {" "}
            {order.status}
          </p>

          <p>
            Total:
            {" "}
            ₹{order.finalTotal}
          </p>

        </div>
      )
    )
  }

</div>

      </div>

    </section>


  );

}