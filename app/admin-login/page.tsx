"use client";

import { useState }
from "react";

import {
  signInWithEmailAndPassword
} from "firebase/auth";

import {
  useRouter
} from "next/navigation";

import {
  auth
} from "@/lib/firebase";

export default function
AdminLoginPage(){

  const router =
    useRouter();

  const [email,setEmail] =
    useState("");

  const [password,
  setPassword] =
    useState("");

  const [loading,
  setLoading] =
    useState(false);

  const handleLogin =
async()=>{

  if(
    !email ||
    !password
  ){

    alert(
      "Fill all fields"
    );

    return;

  }

  try{

    setLoading(true);

    const result =
      await signInWithEmailAndPassword(

        auth,

        email,

        password

      );

    const adminEmails = [

      "adminyogimart@gmail.com"

    ];

    if(

      !adminEmails.includes(
        result.user.email || ""
      )

    ){

      alert(
        "Not Admin Account"
      );

      return;

    }

    router.push("/admin");

  }catch(error:any){

    alert(
      error.message
    );

  }finally{

    setLoading(false);

  }

};

  return (

    <div className="
      min-h-screen
      flex
      items-center
      justify-center
      bg-gray-100
      p-6
    ">

      <div className="
        bg-white
        w-full
        max-w-md
        rounded-3xl
        shadow-xl
        p-10
      ">

        <h1 className="
          text-4xl
          font-bold
          mb-3
          text-center
        ">
          👑 Admin Login
        </h1>

        <p className="
          text-gray-500
          text-center
          mb-10
        ">
          Yogi Mart Admin Panel
        </p>

        <div className="
          space-y-5
        ">

          <input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e)=>
              setEmail(
                e.target.value
              )
            }
            className="
              w-full
              border
              p-4
              rounded-xl
            "
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e)=>
              setPassword(
                e.target.value
              )
            }
            className="
              w-full
              border
              p-4
              rounded-xl
            "
          />

          <button

            onClick={handleLogin}

            disabled={loading}

            className="
              w-full
              bg-black
              text-white
              p-4
              rounded-xl
              text-lg
              font-bold
            "
          >

            {

              loading

              ?

              "Logging in..."

              :

              "Login"

            }

          </button>

        </div>

      </div>

    </div>

  );

}