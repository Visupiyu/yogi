"use client";

import {
  useEffect,
  useState
} from "react";

export default function ReferralsPage(){

  const [user,setUser] =
    useState<any>(null);

  useEffect(()=>{

    const savedUser =
      localStorage.getItem(
        "user"
      );

    if(savedUser){

      setUser(
        JSON.parse(
          savedUser
        )
      );

    }

  },[]);

  const copyCode = ()=>{

    navigator.clipboard.writeText(

      user?.referralCode || ""

    );

    alert(
      "Referral code copied"
    );

  };

  if(!user){

    return(

      <div className="
        min-h-screen
        flex
        items-center
        justify-center
      ">
        Loading...
      </div>

    );

  }

  return(

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
          from-purple-600
          to-pink-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            🎁 Referral Dashboard
          </h1>

          <p className="
            mt-2
          ">
            Invite friends and earn rewards
          </p>

        </div>

        <div className="
          grid
          md:grid-cols-3
          gap-6
        ">

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
            ">
              My Referral Code
            </p>

            <h2 className="
              text-3xl
              font-bold
              mt-3
            ">
              {
                user.referralCode
              }
            </h2>

            <button

              onClick={
                copyCode
              }

              className="
                mt-4
                bg-blue-600
                text-white
                px-4
                py-2
                rounded-xl
              "
            >

              Copy Code

            </button>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
            ">
              Total Referrals
            </p>

            <h2 className="
              text-4xl
              font-bold
              mt-3
            ">
              {
                user.totalReferrals || 0
              }
            </h2>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p className="
              text-gray-500
            ">
              Referral Earnings
            </p>

            <h2 className="
              text-4xl
              font-bold
              mt-3
            ">
              🏆 {
                (user.totalReferrals || 0)
                * 100
              }
            </h2>

          </div>

        </div>

        <div className="
          bg-white
          rounded-3xl
          p-8
          shadow
          mt-8
        ">

          <h2 className="
            text-2xl
            font-bold
            mb-4
          ">
            How It Works
          </h2>

          <div className="
            space-y-3
            text-gray-600
          ">

            <p>
              1️⃣ Share your referral code
            </p>

            <p>
              2️⃣ Friend signs up
            </p>

            <p>
              3️⃣ Friend gets 50 points
            </p>

            <p>
              4️⃣ You get 100 points
            </p>

          </div>

        </div>

      </div>

    </div>

  );

}