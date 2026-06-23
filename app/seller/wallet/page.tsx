"use client";
"use client";

import { useEffect,useState } from "react";

import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function SellerWalletPage() {
    const [walletBalance,setWalletBalance] =
  useState(0);

const [amount,setAmount] =
  useState("");

const [loading,setLoading] =
  useState(true);

const [withdrawals,setWithdrawals] =
  useState<any[]>([]);
  useEffect(()=>{

  loadWallet();
  

},[]);

const loadWallet =
async()=>{

  try{

    const vendor = JSON.parse(

      localStorage.getItem(
        "vendor"
      ) || "{}"

    );

    setWalletBalance(

      Number(
        vendor.pendingPayout || 0
      )

    );

    const q = query(

      collection(
        db,
        "withdrawals"
      ),

      where(
        "vendorEmail",
        "==",
        vendor.email
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

    setWithdrawals(items);

  }catch(error){

    console.log(error);

  }finally{

    setLoading(false);

  }

};

const requestWithdrawal =
async()=>{

  try{

    const vendor = JSON.parse(

      localStorage.getItem(
        "vendor"
      ) || "{}"

    );

    if(

      Number(amount) <= 0

    ){

      alert(
        "Enter amount"
      );

      return;

    }

    if(

      Number(amount) >

      walletBalance

    ){

      alert(
        "Insufficient balance"
      );

      return;

    }

    await addDoc(

      collection(
        db,
        "withdrawals"
      ),

      {

        vendorEmail:
          vendor.email,

        vendorName:
          vendor.businessName,

        amount:
          Number(amount),

        status:
          "Pending",

        createdAt:
          serverTimestamp(),

      }

    );

    alert(
      "Withdrawal Request Submitted"
    );

    setAmount("");

    loadWallet();

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
        max-w-6xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-emerald-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">
            <div className="
  grid
  md:grid-cols-2
  gap-6
">

  <div className="
    bg-white
    p-6
    rounded-3xl
    shadow
  ">

    <p className="
      text-gray-500
    ">
      Available Balance
    </p>

    <h2 className="
      text-4xl
      font-bold
      text-green-600
      mt-3
    ">
      ₹
      {walletBalance.toLocaleString()}
    </h2>

  </div>

  <div className="
    bg-white
    p-6
    rounded-3xl
    shadow
  ">

    <input

      type="number"

      placeholder="
        Withdrawal Amount
      "

      value={amount}

      onChange={(e)=>

        setAmount(
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
        requestWithdrawal
      }

      className="
        bg-green-600
        text-white
        px-6
        py-3
        rounded-xl
      "
    >

      Request Withdrawal

    </button>

  </div>

</div>

          <h1 className="
            text-4xl
            font-bold
          ">
            Seller Wallet
          </h1>

          <p>
            Manage withdrawals and earnings
          </p>

        </div>

      </div>

    </div>

  );

}