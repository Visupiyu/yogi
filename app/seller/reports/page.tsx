"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import * as XLSX from "xlsx";

import jsPDF from "jspdf";

import autoTable from "jspdf-autotable";

export default function SellerReportsPage(){

  const [orders,setOrders] =
    useState<any[]>([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    loadOrders();

  },[]);

  const loadOrders =
  async()=>{

    try{

      const vendor = JSON.parse(

        localStorage.getItem(
          "vendor"
        ) || "{}"

      );

      const snapshot =
        await getDocs(

          collection(
            db,
            "orders"
          )

        );

      const data:any[]=[];

      snapshot.forEach(doc=>{

        const order:any =
          doc.data();

        const items =

          order.items?.filter(

            (item:any)=>

              item.vendorId ===
              vendor.uid

          ) || [];

        if(items.length){

          data.push({

            id:doc.id,

            customer:
              order.customerName,

            amount:
              items.reduce(

                (sum:number,item:any)=>

                  sum +

                  item.price *

                  item.qty,

                0

              ),

            status:
              order.status,

            items:
              items.length,

            date:

              order.createdAt?.seconds

                ? new Date(

                    order.createdAt.seconds *

                    1000

                  ).toLocaleDateString()

                : "-"

          });

        }

      });

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

              o.status,

              o.date

            ])

          )

      }

    );

    pdf.save(

      "seller-orders.pdf"

    );

  };

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
                    {order.status}
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