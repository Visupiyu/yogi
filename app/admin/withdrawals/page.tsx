"use client";

import { useEffect,useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminWithdrawalsPage() {
    const [withdrawals,setWithdrawals] =
  useState<any[]>([]);

const [loading,setLoading] =
  useState(true);

  useEffect(()=>{

  loadWithdrawals();

},[]);

const loadWithdrawals =
async()=>{

  try{

    const snapshot =
      await getDocs(
        collection(
          db,
          "withdrawals"
        )
      );

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

const updateStatus =
async(
  id:string,
  status:string
)=>{

  try{

    await updateDoc(

      doc(
        db,
        "withdrawals",
        id
      ),

      {
        status
      }

    );

    setWithdrawals(

      withdrawals.map(
        (item)=>

          item.id === id

            ? {
                ...item,
                status
              }

            : item

      )

    );

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
        max-w-7xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-purple-600
          to-indigo-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">

            {loading ? (

  <div className="
    bg-white
    p-8
    rounded-3xl
  ">
    Loading...
  </div>

) : (

  <div className="
    bg-white
    rounded-3xl
    shadow
    overflow-x-auto
    p-6
  ">

    <table className="
      w-full
    ">

      <thead>

        <tr className="
          border-b
        ">

          <th className="
            text-left
            py-4
          ">
            Vendor
          </th>

          <th>
            Amount
          </th>

          <th>
            Status
          </th>

        </tr>

      </thead>

      <tbody>

        {withdrawals.map(
          (item)=>(

          <tr
            key={item.id}
            className="
              border-b
            "
          >

            <td className="
              py-4
            ">
              {item.vendorName}
            </td>

            <td>
              ₹{item.amount}
            </td>

            <td>

              <select

                value={
                  item.status
                }

                onChange={(e)=>

                  updateStatus(

                    item.id,

                    e.target.value

                  )

                }

                className="
                  border
                  p-2
                  rounded-lg
                "
              >

                <option>
                  Pending
                </option>

                <option>
                  Approved
                </option>

                <option>
                  Rejected
                </option>

                <option>
                  Paid
                </option>

              </select>

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  </div>

)}

          <h1 className="
            text-4xl
            font-bold
          ">
            Withdrawal Requests
          </h1>

          <p>
            Manage vendor withdrawals
          </p>

        </div>

      </div>

    </div>

  );

}