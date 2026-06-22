"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminReturnsPage() {

  const [returns,setReturns] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    loadReturns();

  },[]);

  const loadReturns =
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

        setReturns(items);

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
            "returns",
            id
          ),

          { status }

        );

        setReturns(

          returns.map((item)=>

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
          from-green-600
          to-blue-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            Return Requests
          </h1>

          <p>
            Manage customer returns
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
            p-6
            overflow-x-auto
          ">

            <table className="
              w-full
            ">

              <thead>

                <tr className="
                  border-b
                ">

                  <th className="py-4 text-left">
                    Order ID
                  </th>

                  <th className="text-left">
                    Customer
                  </th>

                  <th className="text-left">
                    Reason
                  </th>

                  <th className="text-left">
                    Status
                  </th>

                </tr>

              </thead>

              <tbody>

                {returns.map((item)=>(

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
                          Refunded
                        </option>

                      </select>

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