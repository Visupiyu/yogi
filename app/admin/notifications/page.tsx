"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminNotificationsPage() {

    const [notifications,setNotifications] =
  useState<any[]>([]);

const [loading,setLoading] =
  useState(true);
useEffect(()=>{

  loadNotifications();

},[]);

const loadNotifications =
async()=>{

  try{

    const snapshot =
      await getDocs(
        collection(
          db,
          "notifications"
        )
      );

    const items:any[] = [];

    snapshot.forEach(
      (docSnap)=>{

        items.push({

          id:docSnap.id,

          ...docSnap.data(),

        });

      }
    );

    setNotifications(items);

  }catch(error){

    console.log(error);

  }finally{

    setLoading(false);

  }

};

const markAsRead =
async(id:string)=>{

  try{

    await updateDoc(

      doc(
        db,
        "notifications",
        id
      ),

      {
        read:true
      }

    );

    setNotifications(

      notifications.map(
        (item)=>

          item.id === id

            ? {
                ...item,
                read:true
              }

            : item

      )

    );

  }catch(error){

    console.log(error);

  }

};

const deleteNotification =
async(id:string)=>{

  try{

    await deleteDoc(

      doc(
        db,
        "notifications",
        id
      )

    );

    setNotifications(

      notifications.filter(
        (item)=>
          item.id !== id
      )

    );

  }catch(error){

    console.log(error);

  }

};

 return (

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
          from-yellow-500
          to-orange-500
          text-white
          p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            Notifications Center
          </h1>

          <p>
            Marketplace Alerts & Updates
          </p>

        </div>
        {loading ? (

  <div className="
    bg-white
    p-8
    rounded-3xl
  ">
    Loading...
  </div>

) : (

  <div className="
    space-y-4
  ">

    {notifications.map(
      (item)=>(

        <div
          key={item.id}
          className={`
            bg-white
            rounded-3xl
            p-6
            shadow

            ${
              item.read

                ? "opacity-70"

                : ""
            }
          `}
        >

          <h2 className="
            text-xl
            font-bold
          ">
            {item.title}
          </h2>

          <p className="
            mt-2
            text-gray-600
          ">
            {item.message}
          </p>

          <div className="
            flex
            gap-3
            mt-4
          ">

            {!item.read && (

              <button

                onClick={()=>
                  markAsRead(
                    item.id
                  )
                }

                className="
                  bg-green-600
                  text-white
                  px-4
                  py-2
                  rounded-lg
                "
              >
                Mark Read
              </button>

            )}

            <button

              onClick={()=>
                deleteNotification(
                  item.id
                )
              }

              className="
                bg-red-600
                text-white
                px-4
                py-2
                rounded-lg
              "
            >
              Delete
            </button>

          </div>

        </div>

      )
    )}

  </div>

)}

      </div>

    </div>

  );

}