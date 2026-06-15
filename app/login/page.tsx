"use client";


import { useState } from "react";

import {
  auth
} from "@/lib/firebase";

import {

  createUserWithEmailAndPassword,

  signInWithEmailAndPassword

} from "firebase/auth";

import { useRouter }
from "next/navigation";

export default function LoginPage(){

  const router = useRouter();

  const [email,setEmail] =
    useState("");

  const [password,setPassword] =
    useState("");

  const [loading,setLoading] =
    useState(false);

    const [showPassword,setShowPassword] =
  useState(false);

   const login = async ()=>{

    try{

      setLoading(true);

      await signInWithEmailAndPassword(

        auth,
        email,
        password

      );

      localStorage.setItem(

  "user",

  JSON.stringify({

    email

  })

);

      alert("Login Successful");

      router.push("/");

    }catch(err:any){

      alert(err.message);

    }finally{

      setLoading(false);

    }

  };

  return (

   <div
  className="
    min-h-screen
    bg-gradient-to-br
    from-green-50
    via-white
    to-blue-50
    flex
    items-center
    justify-center
    p-6
  "
>

      <div
  className="
    bg-white
    backdrop-blur-sm
    border
    border-gray-100
    p-10
    rounded-3xl
    shadow-xl
    w-full
    max-w-md
  "
>

        <div className="
  text-center
  mb-5
">

  <img
    src="/logo.png"
    alt="Yogi Mart"
    className="
      w-20
      mx-auto
      mb-3
    "
  />

</div>

<p className="
  text-center
  text-green-600
  font-semibold
  text-sm
  mb-2
">
  Yogi Mart Customer Portal
</p>

<h1
  className="
    text-4xl
    font-bold
    text-center
    mb-3
  "
>
  Customer Login
</h1>

<p className="
  text-center
  text-gray-500
  mb-8
">
  Login to your Yogi Mart account
</p>

        <div className="space-y-5">

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

  type={
    showPassword
      ? "text"
      : "password"
  }

  placeholder="Password"

  value={password}

  onChange={(e)=>
    setPassword(e.target.value)
  }

  className="
    w-full
    p-4
    border
    rounded-2xl
    outline-none
  "
/>

<div className="
  flex
  items-center
  justify-between
  mt-2
">

  <label className="
    flex
    items-center
    gap-2
  ">

    <input
      type="checkbox"
      checked={showPassword}
      onChange={()=>
        setShowPassword(
          !showPassword
        )
      }
    />

    <span className="
      text-sm
      text-gray-600
    ">
      Show Password
    </span>

  </label>

  <a
    href="/forgot-password"
    className="
      text-blue-600
      font-semibold
      text-sm
    "
  >
    Forgot Password?
  </a>

</div>

        </div>

        <div className="space-y-4 mt-8">

          <button

            onClick={login}

            disabled={loading}

            className="
  w-full
  text-white
  py-4
  rounded-2xl
  mt-8
  text-lg
  font-bold
  bg-gradient-to-r
  from-green-600
  to-blue-600
  hover:from-green-500
  hover:to-blue-500
"
            
          >
            Login
          </button>

          <p className="
  text-center
  mt-6
">

  Don't have account?

  <span

    onClick={()=>
      router.push("/signup")
    }

    className="
      text-blue-600
      ml-2
      cursor-pointer
      font-semibold
    "
  >
    Signup
  </span>

</p>

           </div>

      </div>

    </div>

  );

}