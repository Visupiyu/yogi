"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminPayoutsPage(){

  const [vendors,setVendors] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    loadPayouts();

  },[]);

  const loadPayouts =
    async()=>{

      try{

        const vendorSnapshot =
          await getDocs(
            collection(
              db,
              "vendors"
            )
          );

        const orderSnapshot =
          await getDocs(
            collection(
              db,
              "orders"
            )
          );

        const vendorData:any[] =
          [];

        vendorSnapshot.forEach(
          (vendorDoc)=>{

            const vendor:any =
              vendorDoc.data();

            let sales = 0;
            let commission = 0;
            let earnings = 0;

            orderSnapshot.forEach(
              (orderDoc)=>{

                const order:any =
                  orderDoc.data();

                const vendorItems =
                  order.items?.filter(
                    (item:any)=>

                      item.vendorId ===
                      vendorDoc.id

                  ) || [];

                if(
                  vendorItems.length
                ){

                  sales +=
                    order.finalTotal || 0;

                  commission +=
                    order.commission || 0;

                  earnings +=
                    order.sellerEarning || 0;

                }

              }
            );

            vendorData.push({

              id:
                vendorDoc.id,

              shopName:
                vendor.shopName ||
                "Vendor",

              sales,

              commission,

              earnings,

              paidPayout:0,

              pendingPayout:
                earnings,

            });

          }
        );

        setVendors(
          vendorData
        );

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
            Admin Payout Management
          </h1>

          <p>
            Manage seller settlements
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
                    text-left
                    py-4
                  ">
                    Seller
                  </th>

                  <th>
                    Sales
                  </th>

                  <th>
                    Commission
                  </th>

                  <th>
                    Earnings
                  </th>

                  <th>
                    Pending
                  </th>

                  <th>
                    Paid
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
                      {vendor.shopName}
                    </td>

                    <td>
                      ₹{vendor.sales}
                    </td>

                    <td>
                      ₹{vendor.commission}
                    </td>

                    <td>
                      ₹{vendor.earnings}
                    </td>

                    <td className="
                      text-orange-600
                      font-bold
                    ">
                      ₹{
                        vendor.pendingPayout
                      }
                    </td>

                    <td className="
                      text-green-600
                      font-bold
                    ">
                      ₹{
                        vendor.paidPayout
                      }
                    </td>

                    <td>

                      <button
                        className="
                          bg-green-600
                          text-white
                          px-4
                          py-2
                          rounded-lg
                        "
                      >
                        Mark Paid
                      </button>

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