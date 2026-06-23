"use client";

"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function CustomerTicketsPage() {
    const [tickets,setTickets] =
  useState<any[]>([]);

const [loading,setLoading] =
  useState(true);

  useEffect(()=>{

  loadTickets();

},[]);

const loadTickets =
async()=>{

  try{

    const user =

      JSON.parse(

        localStorage.getItem(
          "user"
        ) || "{}"

      );

    const q = query(

      collection(
        db,
        "tickets"
      ),

      where(
        "userEmail",
        "==",
        user.email
      )

    );

    const snapshot =
      await getDocs(q);

    const items:any[] = [];

    snapshot.forEach(
      (docSnap)=>{

        items.push({

          id:docSnap.id,

          ...docSnap.data(),

        });

      }
    );

    setTickets(items);

  }catch(error){

    console.log(error);

  }finally{

    setLoading(false);

  }

};

  return (

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-5xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-blue-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">

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

    {tickets.map(
      (ticket)=>(

        <div

          key={ticket.id}

          className="
            bg-white
            p-6
            rounded-3xl
            shadow
          "
        >

          <h2 className="
            text-xl
            font-bold
          ">
            {ticket.subject}
          </h2>

          <p className="
            text-gray-600
            mt-2
          ">
            {ticket.message}
          </p>

          <div className="
            mt-4
            flex
            flex-wrap
            gap-4
          ">

            <span className="
              bg-blue-100
              px-3
              py-1
              rounded-full
            ">
              {ticket.category}
            </span>

            <span className="
              bg-green-100
              px-3
              py-1
              rounded-full
            ">
              {ticket.status}
            </span>

          </div>

          {ticket.adminReply && (

            <div className="
              mt-4
              bg-gray-100
              p-4
              rounded-xl
            ">

              <strong>
                Admin Reply:
              </strong>

              <p className="
                mt-2
              ">
                {ticket.adminReply}
              </p>

            </div>

          )}

        </div>

      )
    )}

  </div>

)}

          <h1 className="
            text-4xl
            font-bold
          ">
            My Support Tickets
          </h1>

          <p>
            Track support requests and replies
          </p>

        </div>

      </div>

    </div>

  );

}