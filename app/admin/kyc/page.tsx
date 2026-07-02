"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getDoc } from "firebase/firestore";

export default function AdminKYCPage() {

  const [vendors,setVendors] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    loadVendors();

  },[]);

  const loadVendors =
  async()=>{

    try{

      const snapshot =
        await getDocs(
          collection(
            db,
            "vendors"
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

      setVendors(items);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const updateKYC =
  async(
    id:string,
    status:string
  )=>{

    try{

    await updateDoc(

  doc(
    db,
    "vendors",
    id
  ),

  {
    kycStatus: status,
    status: status,
  }

);

     setVendors(

  vendors.map(
    (vendor)=>

      vendor.id === id

      ? {
          ...vendor,
          kycStatus: status,
          status: status,
        }

      : vendor

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
          from-purple-600
          to-indigo-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">

          <h1 className="
            text-4xl
            font-bold
          ">
            Vendor KYC Verification
          </h1>

          <p>
            Review vendor documents
          </p>

        </div>

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
                    GST
                  </th>

                  <th>
                    PAN
                  </th>

                  <th>
                    Aadhaar
                  </th>

                  <th>
                    KYC Status
                  </th>

                  <th>
                    Action
                  </th>

                </tr>

              </thead>

              <tbody>

                {vendors.map(
                  (vendor)=>(

                  <tr
                    key={vendor.id}
                    className="
                      border-b
                    "
                  >

                    <td className="
                      py-4
                    ">
                      {vendor.businessName}
                    </td>

                    <td>
                      {vendor.gstNumber}
                    </td>

                    <td>
                      {vendor.panNumber}
                    </td>

                    <td>
                      {vendor.aadhaarNumber}
                    </td>

                    <td>
                      {vendor.kycStatus ||
                       "Pending"}
                    </td>

                    <td>

                      <div className="
                        flex
                        gap-2
                      ">

                        <button

                          onClick={()=>

                            updateKYC(

                              vendor.id,

                              "Approved"

                            )

                          }

                          className="
                            bg-green-600
                            text-white
                            px-4
                            py-2
                            rounded-lg
                          "
                        >

                          Approve

                        </button>

                        <button

                          onClick={()=>

                            updateKYC(

                              vendor.id,

                              "Rejected"

                            )

                          }

                          className="
                            bg-red-600
                            text-white
                            px-4
                            py-2
                            rounded-lg
                          "
                        >

                          Reject

                        </button>

                      </div>

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