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

import { db }
from "@/lib/firebase";

export default function RefundsPage(){

  const [refunds,
  setRefunds] =
  useState<any[]>([]);

  const [loading,
  setLoading] =
  useState(true);

  useEffect(()=>{

    loadRefunds();

  },[]);

  const loadRefunds =
  async()=>{

    try{

      const user =
        JSON.parse(

          localStorage.getItem(
            "user"
          ) || "{}"

        );

      const q = query(

        collection(
          db,
          "returns"
        ),

        where(
          "userEmail",
          "==",
          user.email
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

      setRefunds(data);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-6xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-red-500
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
            My Refunds
          </h1>

          <p>
            Track return and refund requests
          </p>

        </div>

        <div className="
          bg-white
          rounded-3xl
          shadow
          p-6
        ">

          {loading ? (

            <p>
              Loading...
            </p>

          ) : refunds.length === 0 ? (

            <p>
              No refund requests found
            </p>

          ) : (

            <div className="
              space-y-4
            ">

              {refunds.map((item)=>(

                <div
                  key={item.id}
                  className="
                    border
                    rounded-2xl
                    p-5
                  "
                >

                  <h3 className="
                    font-bold
                  ">
                    Order:
                    {" "}
                    {item.orderId}
                  </h3>

                  <p>
                    Reason:
                    {" "}
                    {item.reason}
                  </p>

                  <p>

                    Status:
                    {" "}

                    <span
                      className={

                        item.status ===
                        "Pending"

                        ? "text-yellow-600"

                        : item.status ===
                          "Approved"

                        ? "text-blue-600"

                        : item.status ===
                          "Rejected"

                        ? "text-red-600"

                        : "text-green-600"

                      }
                    >

                      {item.status}

                    </span>

                  </p>

                  <div className="
  mt-4
  flex
  items-center
  gap-3
  text-sm
">

  <span
    className="
      px-3
      py-1
      rounded-full
      bg-green-600
      text-white
    "
  >
    Requested
  </span>

  <span>→</span>

  <span
    className={`
      px-3
      py-1
      rounded-full

      ${
        item.status !== "Pending"
          ? "bg-blue-600 text-white"
          : "bg-gray-200"
      }
    `}
  >
    Review
  </span>

  <span>→</span>

  <span
    className={`
      px-3
      py-1
      rounded-full

      ${
        item.status === "Approved" ||
        item.status === "Refunded"
          ? "bg-yellow-500 text-white"
          : "bg-gray-200"
      }
    `}
  >
    Approved
  </span>

  <span>→</span>

  <span
    className={`
      px-3
      py-1
      rounded-full

      ${
        item.status === "Refunded"
          ? "bg-green-600 text-white"
          : "bg-gray-200"
      }
    `}
  >
    Refunded
  </span>

</div>

                </div>

              ))}

            </div>

          )}

        </div>

      </div>

    </div>

  );

}