"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  addDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminRefundsPage() {

  const [refunds,setRefunds] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    loadRefunds();

  },[]);

  const loadRefunds =
    async()=>{

      try{

        const snapshot =
          await getDocs(
            collection(
              db,
              "returns"
            )
          );

        const items:any[] = [];

        snapshot.forEach((docSnap)=>{

          items.push({

            id:docSnap.id,

            ...docSnap.data(),

          });

        });

        setRefunds(items);

      }catch(error){

        console.log(error);

      }finally{

        setLoading(false);

      }

    };

  const updateRefundStatus =
    async(
      id:string,
      status:string
    )=>{

      try{

        await updateDoc(

          doc(
            db,
            "returns",
            id
          ),

          {
            status
          }

        );

        await addDoc(

  collection(
    db,
    "notifications"
  ),

  {

    title:
      "Refund Status Updated",

    message:

      `Refund ${id} marked as ${status}`,

    type:
      "refund",

    read:false,

    createdAt:
      new Date(),

  }

);

        setRefunds(

          refunds.map((item)=>

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
          from-red-600
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
            Refund Management
          </h1>

          <p>
            Approve and manage refunds
          </p>

        </div>

        {loading ? (

          <div className="
            bg-white
            p-10
            rounded-3xl
            text-center
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
                    py-4
                    text-left
                  ">
                    Order ID
                  </th>

                  <th className="
                    text-left
                  ">
                    Customer
                  </th>

                  <th className="
                    text-left
                  ">
                    Reason
                  </th>

                  <th className="
                    text-left
                  ">
                    Status
                  </th>

             <th className="
  text-left
">
  Date
</th>


           </tr>

              </thead>
              

              <tbody>

                

                {refunds.map((item)=>(

                  <tr
                    key={item.id}
                    className="
                      border-b
                    "
                  >

                    <td className="
                      py-4
                    ">
                      {item.orderId}
                    </td>

                    <td>
                      {item.customerName}
                    </td>

                    <td>
                      {item.reason}
                    </td>

                    <td>

                      <select

  value={
    item.status
  }

  onChange={(e)=>

    updateRefundStatus(

      item.id,

      e.target.value

    )

  }

  className={`

    p-2
    rounded-lg
    text-white

    ${

      item.status ===
      "Pending"

      ? "bg-yellow-500"

      : item.status ===
        "Approved"

      ? "bg-blue-600"

      : item.status ===
        "Rejected"

      ? "bg-red-600"

      : "bg-green-600"

    }

  `}
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
                          Refunded
                        </option>

                      </select>

                    </td>
                    <td>

  {item.createdAt?.seconds

    ? new Date(

        item.createdAt.seconds *
        1000

      ).toLocaleDateString()

    : "-"}

</td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>

  );

}
