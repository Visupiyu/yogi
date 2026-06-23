"use client";

"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminSupportPage() {
    const [tickets,setTickets] =
  useState<any[]>([]);

const [loading,setLoading] =
  useState(true);
  const [reply,setReply] =
  useState("");

  useEffect(()=>{

  loadTickets();

},[]);

const loadTickets =
async()=>{

  try{

    const snapshot =
      await getDocs(
        collection(
          db,
          "tickets"
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

    setTickets(items);

  }catch(error){

    console.log(error);

  }finally{

    setLoading(false);

  }

};

const updateStatus =
async(
  id:string,
  status:string
)=>{

  try{

    await updateDoc(

      doc(
        db,
        "tickets",
        id
      ),

      {
        status
      }

    );

    setTickets(

      tickets.map(
        (ticket)=>

          ticket.id === id

            ? {
                ...ticket,
                status
              }

            : ticket

      )

    );

  }catch(error){

    console.log(error);

  }

};

const updateReply =
async(
  id:string
)=>{

  try{

    await updateDoc(

      doc(
        db,
        "tickets",
        id
      ),

      {
        adminReply:
          reply
      }

    );

    setTickets(

      tickets.map(
        (ticket)=>

          ticket.id === id

            ? {
                ...ticket,
                adminReply:
                  reply
              }

            : ticket

      )

    );

    setReply("");

    alert(
      "Reply Saved"
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
          from-red-600
          to-orange-500
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
    bg-white
    rounded-3xl
    shadow
    overflow-x-auto
    p-6
  ">

    <table className="
      w-full
    ">

      <thead>

        <tr className="
          border-b
        ">

          <th className="
            text-left
            py-4
          ">
            Customer
          </th>

          <th>
            Subject
          </th>

          <th>
            Category
          </th>

          <th>
            Status
          </th>
          <th>
  Admin Reply
</th>

        </tr>

      </thead>

      <tbody>

        {tickets.map(
          (ticket)=>(

          <tr
            key={ticket.id}
            className="
              border-b
            "
          >

            <td className="
              py-4
            ">
              {ticket.customerName}
            </td>

            <td>
              {ticket.subject}
            </td>

            <td>
              {ticket.category}
            </td>

            <td>

              <select

                value={
                  ticket.status
                }

                onChange={(e)=>

                  updateStatus(

                    ticket.id,

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
                  Open
                </option>

                <option>
                  In Progress
                </option>

                <option>
                  Resolved
                </option>

                <option>
                  Closed
                </option>

              </select>

            </td>
            <td>

  <textarea

    placeholder="
      Reply to customer
    "

    value={reply}

    onChange={(e)=>

      setReply(
        e.target.value
      )

    }

    className="
      border
      p-2
      rounded-lg
      w-full
      min-w-[220px]
    "

  />

  <button

    onClick={()=>

      updateReply(
        ticket.id
      )

    }

    className="
      mt-2
      bg-blue-600
      text-white
      px-4
      py-2
      rounded-lg
    "
  >

    Save Reply

  </button>

</td>

          </tr>

        ))}

      </tbody>

    </table>

  </div>

)}

          <h1 className="
            text-4xl
            font-bold
          ">
            Support Tickets
          </h1>

          <p>
            Manage customer support requests
          </p>

        </div>

      </div>

    </div>

  );

}