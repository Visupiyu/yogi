"use client";

import {
  useEffect,
  useState
} from "react";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "firebase/firestore";

import { db }
from "@/lib/firebase";

export default function RewardsPage(){

  const [points,setPoints] =
    useState(0);

  const [transactions,
  setTransactions] =
    useState<any[]>([]);

  useEffect(()=>{

    const user =
      JSON.parse(

        localStorage.getItem(
          "user"
        ) || "{}"

      );

    setPoints(
      user.rewardPoints || 0
    );

    loadTransactions(
      user.email
    );

  },[]);

  const loadTransactions =
  async(email:string)=>{

    try{

      const q = query(

        collection(
          db,
          "rewardTransactions"
        ),

        where(
          "userEmail",
          "==",
          email
        ),

        orderBy(
          "createdAt",
          "desc"
        )

      );

      const snapshot =
        await getDocs(q);

      const data:any[] = [];

      snapshot.forEach((doc)=>{

        data.push({

          id:doc.id,

          ...doc.data()

        });

      });

      setTransactions(data);

    }catch(error){

      console.log(error);

    }

  };

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-5xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-yellow-500
          to-orange-500
          text-white
          p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            🏆 Rewards Dashboard
          </h1>

          <h2 className="
            text-5xl
            font-bold
            mt-4
          ">
            {points}
            Points
          </h2>

          <p className="
            mt-3
          ">

            {points >= 500
              ? "🥇 Gold Member"
              : points >= 200
              ? "🥈 Silver Member"
              : "🥉 Bronze Member"}

          </p>

        </div>

        <div className="
          bg-white
          rounded-3xl
          p-8
          shadow
        ">

          <h2 className="
            text-2xl
            font-bold
            mb-6
          ">
            Reward History
          </h2>

          <div className="
            space-y-4
          ">

            {transactions.map(
              (item)=>(

                <div
                  key={item.id}
                  className="
                    flex
                    justify-between
                    border-b
                    pb-3
                  "
                >

                  <span>

                    {item.type}

                  </span>

                  <span
                    className={
                      item.type ===
                      "Earned"

                      ? "text-green-600"

                      : "text-red-600"
                    }
                  >

                    {item.type ===
                    "Earned"

                      ? "+"

                      : "-"}

                    {item.points}

                  </span>

                </div>

              )
            )}

          </div>

        </div>

      </div>

    </div>

  );

}