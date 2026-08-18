"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export default function SupportPage() {

    const router = useRouter();

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

  // Nothing here checked auth at all — a signed-out visitor got
  // userEmail: "", which firestore.rules rejects (create requires
  // userEmail == the signer's own token email), and the resulting
  // exception was swallowed by the catch below with no alert and no
  // redirect. Matches the same login-gate pattern already used for
  // askQuestion/submitReview on the product page.
  const currentUser = auth.currentUser;

  if (!currentUser) {
    alert("Please login first.");
    router.push("/login");
    return;
  }

  // The admin notification below uses the subject as its message, and
  // firestore.rules requires a non-empty notification message — a blank
  // subject saved the ticket but then threw on the notification write,
  // silently skipping the success alert and the form reset.
  if (!subject.trim()) {
    alert("Please enter a subject.");
    return;
  }

  try{

    setLoading(true);

    await addDoc(

      collection(
        db,
        "tickets"
      ),

      {

        customerName:
          currentUser.displayName ||
          "Customer",

        userId:
          currentUser.uid,

        userEmail:
          currentUser.email ||
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

    // notifications requires `role` (and userId for non-admin roles) or
    // the write is rejected by Firestore rules — this was missing both,
    // so it threw here and silently skipped the success alert and
    // clearing the form below, even though the ticket itself had already
    // saved successfully.
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

        role:
          "admin",

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