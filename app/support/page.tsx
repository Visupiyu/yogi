"use client";
import { useState } from "react";

import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function SupportPage() {

    const [subject,setSubject] =
  useState("");

const [category,setCategory] =
  useState("Order Issue");

const [message,setMessage] =
  useState("");

const [loading,setLoading] =
  useState(false);

  const createTicket =
async()=>{

  try{

    setLoading(true);

    const user =

      JSON.parse(

        localStorage.getItem(
          "user"
        ) || "{}"

      );

    await addDoc(

      collection(
        db,
        "tickets"
      ),

      {

        customerName:
          user.name ||
          "Customer",

        userEmail:
          user.email ||
          "",

        subject,

        category,

        message,

        status:
          "Open",

        adminReply:
          "",

        createdAt:
          serverTimestamp(),

      }

    );

    await addDoc(

      collection(
        db,
        "notifications"
      ),

      {

        title:
          "New Support Ticket",

        message:
          `${subject}`,

        type:
          "support",

        read:false,

        createdAt:
          serverTimestamp(),

      }

    );

    alert(
      "Ticket Created Successfully"
    );

    setSubject("");

    setMessage("");

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
        max-w-4xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-blue-600
          to-indigo-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">
            <div className="
  bg-white
  rounded-3xl
  shadow
  p-8
">

  <input
    type="text"
    placeholder="Subject"
    value={subject}
    onChange={(e)=>
      setSubject(
        e.target.value
      )
    }
    className="
      w-full
      border
      p-4
      rounded-xl
      mb-4
    "
  />

  <select
    value={category}
    onChange={(e)=>
      setCategory(
        e.target.value
      )
    }
    className="
      w-full
      border
      p-4
      rounded-xl
      mb-4
    "
  >

    <option>
      Order Issue
    </option>

    <option>
      Refund Issue
    </option>

    <option>
      Product Issue
    </option>

    <option>
      Payment Issue
    </option>

    <option>
      Other
    </option>

  </select>

  <textarea
    rows={6}
    placeholder="Describe your issue"
    value={message}
    onChange={(e)=>
      setMessage(
        e.target.value
      )
    }
    className="
      w-full
      border
      p-4
      rounded-xl
      mb-4
    "
  />

  <button

    onClick={
      createTicket
    }

    disabled={loading}

    className="
      bg-blue-600
      text-white
      px-8
      py-4
      rounded-xl
    "
  >

    {loading
      ? "Submitting..."
      : "Submit Ticket"}

  </button>

</div>

          <h1 className="
            text-4xl
            font-bold
          ">
            Support Center
          </h1>

          <p>
            Raise a support ticket
          </p>

        </div>

      </div>

    </div>

  );

}