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

   const login = async ()=>{

    try{

      setLoading(true);

      await signInWithEmailAndPassword(

        auth,
        email,
        password

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

    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">

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
            mb-8
            text-center
          "
        >
          Login 
        </h1>

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

        </div>

        <div className="space-y-4 mt-8">

          <button

            onClick={login}

            disabled={loading}

            className="
              w-full
              bg-blue-600
              text-white
              py-4
              rounded-xl
              text-lg
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