"use client";

import {
  useEffect,
  useState
} from "react";

import {
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";

export default function WalletAnalyticsPage(){

  const [transactions,setTransactions] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    loadData();

  },[]);

  const loadData = async()=>{

    try{

      const user = JSON.parse(

        localStorage.getItem("user") || "{}"

      );

      const q = query(

        collection(
          db,
          "rewardTransactions"
        ),

        where(
          "userEmail",
          "==",
          user.email
        )

      );

      const snapshot =
        await getDocs(q);

      const data:any[]=[];

      snapshot.forEach(doc=>{

        data.push(doc.data());

      });

      setTransactions(data);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const reward =

    transactions

      .filter((t)=>t.type==="Earned")

      .reduce((s,t)=>s+t.points,0);

  const redeemed =

    transactions

      .filter((t)=>t.type==="Redeemed")

      .reduce((s,t)=>s+t.points,0);

  const referral =

    transactions

      .filter((t)=>t.type==="Referral")

      .reduce((s,t)=>s+t.points,0);

  const refund =

    transactions

      .filter((t)=>t.type==="Refund")

      .reduce((s,t)=>s+t.points,0);

  const pieData=[

    {
      name:"Rewards",
      value:reward
    },

    {
      name:"Redeemed",
      value:redeemed
    },

    {
      name:"Referral",
      value:referral
    },

    {
      name:"Refund",
      value:refund
    }

  ];

  const COLORS=[
    "#16a34a",
    "#dc2626",
    "#2563eb",
    "#f59e0b"
  ];

  const barData=[

    {
      name:"Reward",
      Points:reward
    },

    {
      name:"Redeemed",
      Points:redeemed
    },

    {
      name:"Referral",
      Points:referral
    },

    {
      name:"Refund",
      Points:refund
    }

  ];

  if(loading){

    return(

      <div className="p-10 text-center">

        Loading Analytics...

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
          to-blue-600
          text-white
          rounded-3xl
          p-8
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            💰 Wallet Analytics
          </h1>

        </div>

        <div className="
          grid
          md:grid-cols-4
          gap-6
          mb-8
        ">

          <div className="bg-white p-6 rounded-3xl shadow">
            <p>Rewards</p>
            <h2 className="text-3xl font-bold mt-3">
              {reward}
            </h2>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow">
            <p>Redeemed</p>
            <h2 className="text-3xl font-bold mt-3">
              {redeemed}
            </h2>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow">
            <p>Referral</p>
            <h2 className="text-3xl font-bold mt-3">
              {referral}
            </h2>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow">
            <p>Refund</p>
            <h2 className="text-3xl font-bold mt-3">
              {refund}
            </h2>
          </div>

        </div>

        <div className="
          grid
          lg:grid-cols-2
          gap-8
        ">

          <div className="
            bg-white
            rounded-3xl
            shadow
            p-6
            h-[400px]
          ">

            <ResponsiveContainer>

              <PieChart>

                <Pie
                  data={pieData}
                  dataKey="value"
                  outerRadius={120}
                  label
                >

                  {pieData.map((entry,index)=>(

                    <Cell
                      key={index}
                      fill={COLORS[index]}
                    />

                  ))}

                </Pie>

                <Tooltip/>

              </PieChart>

            </ResponsiveContainer>

          </div>

          <div className="
            bg-white
            rounded-3xl
            shadow
            p-6
            h-[400px]
          ">

            <ResponsiveContainer>

              <BarChart
                data={barData}
              >

                <CartesianGrid strokeDasharray="3 3"/>

                <XAxis dataKey="name"/>

                <YAxis/>

                <Tooltip/>

                <Bar dataKey="Points"/>

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>

      </div>

    </div>

  );

}