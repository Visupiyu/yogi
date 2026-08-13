"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { applyReturnStatusUpdate } from "@/lib/returns";

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

        const refund:any = refunds.find(
          (r:any)=>r.id===id
        );

        // Shared with app/admin/returns so both admin surfaces that touch
        // this same `returns` collection notify the customer and credit
        // reward points identically on "Refunded", instead of only one of
        // the two doing it depending which page an admin happened to use.
        await applyReturnStatusUpdate(db, { ...refund, id }, status);

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

    const updateRefundField = async(
  id:string,
  field:string,
  value:any
)=>{

  try{

    await updateDoc(

      doc(
        db,
        "returns",
        id
      ),

      {
        [field]:value
      }

    );

    setRefunds(

      refunds.map(item=>

        item.id===id

          ? {
              ...item,
              [field]:value
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
                  <th className="text-left">
  Pickup Partner
</th>

<th className="text-left">
  Pickup Date
</th>

<th className="text-left">
  Refund Amount
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
<tr key={item.id} className=" border-b " >
<td className=" py-4 ">
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
value={ item.status }
onChange={(e)=> updateRefundStatus( item.id, e.target.value ) }
className={`p-2 rounded-lg text-white ${ item.status === "Pending" ? "bg-yellow-500"
      : item.status === "Approved" ? "bg-blue-600"
      : item.status === "Rejected" ? "bg-red-600" : "bg-green-600" } `} >
                    
      <option> Pending </option>
      <option> Approved </option>
      <option> Rejected </option>
      <option> Refunded </option>
 </select>
 </td>
  <td>
    <td>

  <input

    value={
      item.pickupPartner || ""
    }

    onChange={(e)=>

      updateRefundField(

        item.id,

        "pickupPartner",

        e.target.value

      )

    }

    placeholder="Partner"

    className="
      border
      p-2
      rounded-lg
      w-36
    "
  />

</td>
<td>

  <input

    type="date"

    value={
      item.pickupDate || ""
    }

    onChange={(e)=>

      updateRefundField(

        item.id,

        "pickupDate",

        e.target.value

      )

    }

    className="
      border
      p-2
      rounded-lg
    "
  />

</td>
<td>

  <input

    type="number"

    value={
      item.refundAmount || 0
    }

    onChange={(e)=>

      updateRefundField(

        item.id,

        "refundAmount",

        Number(
          e.target.value
        )

      )

    }

    className="
      border
      p-2
      rounded-lg
      w-28
    "
  />

</td>

  {item.createdAt?.seconds ? new Date( item.createdAt.seconds * 1000 ).toLocaleDateString() : "-"}
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
