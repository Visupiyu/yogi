"use client";

import { useEffect, useState } from "react";

import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function ReturnsPage() {

  const [orderId,setOrderId] =
  useState("");

useEffect(()=>{

  const params =
    new URLSearchParams(
      window.location.search
    );

  setOrderId(
    params.get("orderId") || ""
  );

},[]);

  const [reason,setReason] =
    useState("");

    const [refundMethod,setRefundMethod] =
  useState("Original Payment");

const [comments,setComments] =
  useState("");

  const [loading,setLoading] =
    useState(false);

  const submitReturn =
    async()=>{

      if(!reason){

        alert(
          "Please select a reason"
        );

        return;

      }

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
            "returns"
          ),

          {

  orderId,

  customerName:
    user.name || "Customer",

  userEmail:
    user.email || "",

  reason,

  comments,

  refundMethod,

  status:"Pending",

  pickupDate:"",

  pickupPartner:"",

  pickupPhone:"",

  refundAmount:0,

  refundTransactionId:"",

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
      "Refund Request",

    message:
      `${user.name || "Customer"} requested a refund`,

    type:
      "refund",

    read:false,

    createdAt:
      serverTimestamp(),

  }

);      

        alert(
          "Return request submitted successfully"
        );

        setReason("");

      }catch(error){

        console.log(error);

        alert(
          "Failed to submit request"
        );

      }finally{

        setLoading(false);

      }

    };

    

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-2xl
        mx-auto
        bg-white
        rounded-3xl
        shadow-md
        p-8
      ">

        <h1 className="
          text-3xl
          font-bold
          mb-6
        ">
          Return Request
        </h1>

        <div className="
          mb-6
        ">

          <label className="
            block
            mb-2
            font-semibold
          ">
            Order ID
          </label>

          <input
            value={orderId}
            readOnly
            className="
              w-full
              border
              p-3
              rounded-xl
              bg-gray-100
            "
          />

        </div>

        <div className="
          mb-6
        ">

          <label className="
            block
            mb-2
            font-semibold
          ">
            Select Reason
          </label>

          <select

            value={reason}

            onChange={(e)=>
              setReason(
                e.target.value
              )
            }
            className="
              w-full
              border
              p-3
              rounded-xl
            "
          >
            <div className="
  mb-6
">

  <label className="
    block
    mb-2
    font-semibold
  ">
    Refund Method
  </label>

  <select

    value={refundMethod}

    onChange={(e)=>
      setRefundMethod(
        e.target.value
      )
    }

    className="
      w-full
      border
      p-3
      rounded-xl
    "
  >
    <div className="
  mb-6
">

  <label className="
    block
    mb-2
    font-semibold
  ">
    Additional Comments
  </label>

  <textarea

    value={comments}

    onChange={(e)=>
      setComments(
        e.target.value
      )
    }

    rows={4}

    placeholder="
    Describe the issue..."

    className="
      w-full
      border
      p-3
      rounded-xl
    "
  />

</div>

    <option>
      Original Payment
    </option>

    <option>
      Wallet
    </option>

    <option>
      Bank Transfer
    </option>

  </select>

</div>

            <option value="">
              Choose Reason
            </option>

            <option>
              Damaged Product
            </option>

            <option>
              Wrong Item Received
            </option>

            <option>
              Quality Issue
            </option>

            <option>
              Product Not As Expected
            </option>

            <option>
              Other
            </option>

          </select>

        </div>

        <button

          onClick={
            submitReturn
          }

          disabled={loading}

          className="
            w-full
            bg-gradient-to-r
            from-green-600
            to-blue-600
            text-white
            py-3
            rounded-xl
            font-semibold
          "
        >

          {loading
            ? "Submitting..."
            : "Submit Return Request"}

        </button>

      </div>

    </div>

  );

}