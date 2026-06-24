"use client";

import { useState } from "react";

import { useRouter }
from "next/navigation";

import {
  createUserWithEmailAndPassword

} from "firebase/auth";

import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  addDoc
} from "firebase/firestore";

import {
  auth,
  db
} from "@/lib/firebase";

export default function SignupPage() {

  const router = useRouter();

  const [name,setName] =
    useState("");

  const [email,setEmail] =
    useState("");

  const [password,setPassword] =
    useState("");
    const [
  referralCode,
  setReferralCode
] = useState("");

  const [loading,setLoading] =
    useState(false);

  const signup = async ()=>{

    if(!name || !email || !password){

      alert("Please fill all fields");

      return;

    }

    try{

      setLoading(true);

      const result =
  await createUserWithEmailAndPassword(

    auth,
    email,
    password

  );

  const myReferralCode =

  "YOGI" +

  Math.floor(
    100000 +
    Math.random() * 900000
  );

await setDoc(

  doc(
    db,
    "users",
    result.user.uid
  ),

  {
  uid: result.user.uid,

  name,

  email,

  role:"customer",

  rewardPoints: 0,

  referralCode:
    myReferralCode,

  referredBy:
    referralCode || "",

  totalReferrals: 0,

  createdAt:
    new Date()
}

);

if(referralCode){

  try{

    const q = query(

      collection(
        db,
        "users"
      ),

      where(
        "referralCode",
        "==",
        referralCode
      )

    );

    const snapshot =
      await getDocs(q);

    if(!snapshot.empty){

      const referrer =
        snapshot.docs[0];

      const referrerData =
        referrer.data();

      await updateDoc(

        doc(
          db,
          "users",
          referrer.id
        ),

        {

          rewardPoints:

            Number(
              referrerData.rewardPoints || 0
            ) + 100,

          totalReferrals:

            Number(
              referrerData.totalReferrals || 0
            ) + 1

        }

      );

      await updateDoc(

        doc(
          db,
          "users",
          result.user.uid
        ),

        {

          rewardPoints: 50

        }

      );

      await addDoc(

        collection(
          db,
          "rewardTransactions"
        ),

        {

          userId:
            referrer.id,

          points:100,

          type:
            "Referral Bonus",

          createdAt:
            new Date()

        }

      );

    }

  }catch(error){

    console.log(error);

  }

}

localStorage.setItem(

  "user",

  JSON.stringify({

    uid: result.user.uid,

    name,

    email,

    role:"customer"

  })

);

     alert(
  "Signup Successful"
);

      router.push("/login");

    }catch(error:any){

      alert(error.message);

    }finally{

      setLoading(false);

    }

  };

  return (

    <div
      className="
        min-h-screen
        bg-gray-100
        flex
        items-center
        justify-center
        p-6
      "
    >

      <div
        className="
          bg-white
          p-10
          rounded-2xl
          shadow-lg
          w-full
          max-w-md
        "
      >

        <h1
          className="
            text-4xl
            font-bold
            text-center
            mb-8
          "
        >
          Signup
        </h1>

        <div className="space-y-5">

          <input

            type="text"

            placeholder="Full Name"

            value={name}

            onChange={(e)=>
              setName(e.target.value)
            }

            className="
              w-full
              p-4
              border
              rounded-xl
              outline-none
            "
          />

          <input

            type="email"

            placeholder="Email"

            value={email}

            onChange={(e)=>
              setEmail(e.target.value)
            }

            className="
              w-full
              p-4
              border
              rounded-xl
              outline-none
            "
          />

          <input

            type="password"

            placeholder="Password"

            value={password}

            onChange={(e)=>
              setPassword(e.target.value)
            }

            className="
              w-full
              p-4
              border
              rounded-xl
              outline-none
            "
          />
          <input

  type="text"

  placeholder="
  Referral Code (Optional)
  "

  value={referralCode}

  onChange={(e)=>
    setReferralCode(
      e.target.value
    )
  }

  className="
    w-full
    p-4
    border
    rounded-xl
    outline-none
  "
/>

        </div>

        <button

          onClick={signup}

          disabled={loading}

          className="
            w-full
            bg-green-600
            text-white
            py-4
            rounded-xl
            mt-8
            text-lg
            font-semibold
          "
        >

          {loading
            ? "Creating..."
            : "Signup"}

        </button>

        <p className="
  text-center
  mt-6
">

  Already have account?

  <span

    onClick={()=>
      router.push("/login")
    }

    className="
      text-blue-600
      cursor-pointer
      ml-2
      font-semibold
    "
  >
    Login
  </span>

</p>

      </div>

    </div>

  );

}