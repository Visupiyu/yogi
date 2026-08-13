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

import { db } from "@/lib/firebase";

export default function WalletPage(){

  const [transactions,setTransactions] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  const [filter,setFilter] =
    useState("All");

  useEffect(()=>{

    loadTransactions();

  },[]);

  const loadTransactions =
  async()=>{

    try{

      const user = JSON.parse(

        localStorage.getItem(
          "user"
        ) || "{}"

      );

      // walletTransactions doesn't exist anywhere in this app — nothing
      // ever writes to it and there's no Firestore rule for it, so this
      // page was permanently empty. Reward/referral/refund history is
      // actually written to rewardTransactions (same collection the
      // sibling analytics/rewards pages already read from).
      const q = query(

        collection(
          db,
          "rewardTransactions"
        ),

        where(
          "userEmail",
          "==",
          user.email
        ),

        orderBy(
          "createdAt",
          "desc"
        )

      );

      const snapshot =
        await getDocs(q);

      const data:any[]=[];

      snapshot.forEach(doc=>{

        data.push({

          id:doc.id,

          ...doc.data()

        });

      });

      setTransactions(data);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const filtered =

    filter==="All"

      ? transactions

      : transactions.filter(

          (item:any)=>

            item.type===filter

        );

  // rewardTransactions has no signed `amount` — a single `points` field,
  // with "Redeemed" being the only type that reduces the balance.
  const totalEarned =

    transactions

    .filter(

      (t:any)=>

        t.type!=="Redeemed"

    )

    .reduce(

      (sum:number,t:any)=>

        sum+Number(t.points||0),

      0

    );

  const totalSpent =

    transactions

    .filter(

      (t:any)=>

        t.type==="Redeemed"

    )

    .reduce(

      (sum:number,t:any)=>

        sum+Number(t.points||0),

      0

    );

  const balance =

    totalEarned -

    totalSpent;

  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading Wallet...

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
        max-w-7xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-emerald-500
          text-white
          rounded-3xl
          p-8
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            💰 My Wallet
          </h1>

          <p className="mt-2">

            Rewards, refunds and transaction history

          </p>

        </div>

        <div className="
          grid
          md:grid-cols-3
          gap-6
          mb-8
        ">

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p>Wallet Balance</p>

            <h2 className="
              text-3xl
              font-bold
              mt-3
            ">
              ₹{balance}
            </h2>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p>Total Earned</p>

            <h2 className="
              text-3xl
              font-bold
              mt-3
              text-green-600
            ">
              ₹{totalEarned}
            </h2>

          </div>

          <div className="
            bg-white
            rounded-3xl
            p-6
            shadow
          ">

            <p>Total Spent</p>

            <h2 className="
              text-3xl
              font-bold
              mt-3
              text-red-600
            ">
              ₹{totalSpent}
            </h2>

          </div>

        </div>

        <div className="
          flex
          gap-3
          flex-wrap
          mb-8
        ">

          {[
            "All",
            "Earned",
            "Redeemed",
            "Referral Bonus",
            "Refund"
          ].map(type=>(

            <button

              key={type}

              onClick={()=>

                setFilter(type)

              }

              className={`

                px-5
                py-2
                rounded-full

                ${

                  filter===type

                  ? "bg-green-600 text-white"

                  : "bg-white"

                }

              `}

            >

              {type}

            </button>

          ))}

        </div>

        <div className="
          bg-white
          rounded-3xl
          shadow
          overflow-x-auto
        ">

          <table className="
            w-full
          ">

            <thead>

              <tr className="
                border-b
              ">

                <th className="
                  p-4
                  text-left
                ">
                  Type
                </th>

                <th className="
                  text-left
                ">
                  Points
                </th>

                <th className="
                  text-left
                ">
                  Date
                </th>

              </tr>

            </thead>

            <tbody>

              {filtered.map((item:any)=>(

                <tr

                  key={item.id}

                  className="
                    border-b
                  "

                >

                  <td className="
                    p-4
                  ">

                    {item.type}

                  </td>

                  <td className={

                    item.type==="Redeemed"

                    ? "text-red-600 font-bold"

                    : "text-green-600 font-bold"

                  }>

                    {item.type==="Redeemed"?"-":"+"}

                    {Number(item.points||0)}

                  </td>

                  <td>

                    {

                      item.createdAt?.seconds

                      ?

                      new Date(

                        item.createdAt.seconds*

                        1000

                      ).toLocaleDateString()

                      :

                      "-"

                    }

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>

  );

}