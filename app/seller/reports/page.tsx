"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";


import { auth } from "@/lib/firebase";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";
import { fetchSellerOrders } from "@/lib/sellerOrders/sellerOrdersClient";
import { onAuthStateChanged } from "firebase/auth";

import * as XLSX from "xlsx";

import jsPDF from "jspdf";

import autoTable from "jspdf-autotable";

export default function SellerReportsPage(){

  const router = useRouter();

  const [orders,setOrders] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      loadOrders(user.uid);

    });

    return () => unsubscribe();

  },[router]);

  const loadOrders =
  async(vendorUid: string)=>{

    try{

      // Orders are Firestore-rules-scoped to vendorIds containing the
      // signed-in seller's auth uid — a full collection scan is denied.
      // Seller-scoped order summaries (app/api/seller/orders): this seller's
      // own lines and item value — sellers no longer read the shared
      // orders/{id} documents.
      const data: any[] = [];
      for (const o of (await fetchSellerOrders()) || []) {
        data.push({
          id: o.orderId,
          customer: o.customerName,
          amount: o.sellerShare.rawSubtotal,
          status: o.orderStatus,
          items: o.items.length,
          date: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "-",
        });
      }
data.sort(
  (a, b) =>
    new Date(b.date).getTime() -
    new Date(a.date).getTime()
);
      setOrders(data);

    }catch(error){

      console.log(error);

    }finally{

      setLoading(false);

    }

  };

  const exportExcel = ()=>{

    const worksheet =

      XLSX.utils.json_to_sheet(
        orders
      );

    const workbook =

      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

      workbook,

      worksheet,

      "Orders"

    );

    XLSX.writeFile(

      workbook,

      "seller-orders.xlsx"

    );

  };

  const exportPDF = ()=>{

    const pdf =
      new jsPDF();

    pdf.setFontSize(18);

    pdf.text(

      "Seller Orders Report",

      14,

      20

    );

    autoTable(

      pdf,

      {

        head:[

          [

            "Order",

            "Customer",

            "Items",

            "Amount",

            "Status",

            "Date"

          ]

        ],

        body:

          orders.map(

            (o:any)=>([

              o.id,

              o.customer,

              o.items,

              "₹"+o.amount,

              fulfilmentStageLabel(o.status),

              o.date

            ])

          )

      }

    );

    pdf.save(

      "seller-orders.pdf"

    );

  };
// Cancelled orders stay visible in the report table (so a seller can
// still see what was cancelled), but shouldn't count toward revenue —
// matches the exclusion Wallet and Admin Analytics both already apply.
const totalRevenue = orders.reduce(
  (sum, order) =>
    sum + (order.status === "Cancelled" ? 0 : Number(order.amount) || 0),
  0
);
  if(loading){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading...

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
          from-indigo-600
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
            Seller Reports
          </h1>

          <p className="mt-2">

            Export your business reports

          </p>

        </div>
<div className="mb-8 rounded-3xl bg-white p-6 shadow">

  <p className="text-gray-500">
    Total Revenue
  </p>

  <h2 className="mt-2 text-4xl font-bold text-green-600">
    ₹{totalRevenue.toLocaleString("en-IN")}
  </h2>

</div>
        <div className="
          flex
          gap-4
          mb-8
        ">

          <button

            onClick={
              exportExcel
            }

            className="
              bg-green-600
              text-white
              px-6
              py-3
              rounded-xl
            "
          >

            Export Excel

          </button>

          <button

            onClick={
              exportPDF
            }

            className="
              bg-red-600
              text-white
              px-6
              py-3
              rounded-xl
            "
          >

            Export PDF

          </button>

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
                  Order
                </th>

                <th className="
                  text-left
                ">
                  Customer
                </th>

                <th className="
                  text-left
                ">
                  Items
                </th>

                <th className="
                  text-left
                ">
                  Amount
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

              {orders.map((order:any)=>(

                <tr

                  key={order.id}

                  className="
                    border-b
                  "
                >

                  <td className="
                    p-4
                  ">
                    {order.id.slice(0,8)}
                  </td>

                  <td>
                    {order.customer}
                  </td>

                  <td>
                    {order.items}
                  </td>

                  <td>
                    ₹{order.amount}
                  </td>

                  <td>
                    {fulfilmentStageLabel(order.status)}
                  </td>

                  <td>
                    {order.date}
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