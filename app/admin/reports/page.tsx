"use client";

import { saveAs } from "file-saver";

import * as XLSX from "xlsx";

import jsPDF from "jspdf";

import autoTable from "jspdf-autotable";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export default function AdminReportsPage() {

  const exportExcel =
    async (
      collectionName:string,
      fileName:string
    ) => {

      try {

        const snapshot =
          await getDocs(
            collection(
              db,
              collectionName
            )
          );

        const data:any[] = [];

        snapshot.forEach(
          (docSnap)=>{

            data.push({

              id:docSnap.id,

              ...docSnap.data(),

            });

          }
        );

        const worksheet =
          XLSX.utils.json_to_sheet(
            data
          );

        const workbook =
          XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(

          workbook,

          worksheet,

          "Report"

        );

        const excelBuffer =
          XLSX.write(

            workbook,

            {

              bookType:"xlsx",

              type:"array",

            }

          );

        const fileData =
          new Blob(

            [excelBuffer],

            {

              type:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

            }

          );

        saveAs(

          fileData,

          `${fileName}.xlsx`

        );

      } catch(error){

        console.log(error);

      }

    };

  const exportOrdersPDF =
    async()=>{

      try{

        const snapshot =
          await getDocs(
            collection(
              db,
              "orders"
            )
          );

        const rows:any[] = [];

        snapshot.forEach(
          (docSnap)=>{

            const order:any =
              docSnap.data();

            rows.push([

              order.customerName ||

              "-",

              order.finalTotal ||

              0,

              order.status ||

              "-",

            ]);

          }
        );

        const pdf =
          new jsPDF();

        pdf.setFontSize(18);

        pdf.text(

          "Yogi Mart Orders Report",

          14,

          20

        );

        autoTable(

          pdf,

          {

            startY:30,

            head:[

              [

                "Customer",

                "Amount",

                "Status",

              ],

            ],

            body:rows,

          }

        );

        pdf.save(

          "orders-report.pdf"

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
        max-w-6xl
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
            Reports Center
          </h1>

          <p>
            Download Marketplace Reports
          </p>

        </div>

        <div className="
          grid
          grid-cols-1
          md:grid-cols-2
          gap-6
        ">

          <button

            onClick={()=>

              exportExcel(

                "orders",

                "orders-report"

              )

            }

            className="
              bg-white
              p-6
              rounded-3xl
              shadow
              text-left
              hover:shadow-lg
            "
          >

            <h2 className="
              text-xl
              font-bold
            ">
              Orders Report
            </h2>

            <p>
              Export Orders XLSX
            </p>

          </button>

          <button

            onClick={()=>

              exportExcel(

                "vendors",

                "vendors-report"

              )

            }

            className="
              bg-white
              p-6
              rounded-3xl
              shadow
              text-left
              hover:shadow-lg
            "
          >

            <h2 className="
              text-xl
              font-bold
            ">
              Vendors Report
            </h2>

            <p>
              Export Vendors XLSX
            </p>

          </button>

          <button

            onClick={()=>

              exportExcel(

                "users",

                "customers-report"

              )

            }

            className="
              bg-white
              p-6
              rounded-3xl
              shadow
              text-left
              hover:shadow-lg
            "
          >

            <h2 className="
              text-xl
              font-bold
            ">
              Customers Report
            </h2>

            <p>
              Export Customers XLSX
            </p>

          </button>

          <button

            onClick={()=>

              exportExcel(

                "returns",

                "refunds-report"

              )

            }

            className="
              bg-white
              p-6
              rounded-3xl
              shadow
              text-left
              hover:shadow-lg
            "
          >

            <h2 className="
              text-xl
              font-bold
            ">
              Refunds Report
            </h2>

            <p>
              Export Refunds XLSX
            </p>

          </button>

          <button

            onClick={
              exportOrdersPDF
            }

            className="
              bg-red-600
              text-white
              p-6
              rounded-3xl
              shadow
              text-left
            "
          >

            <h2 className="
              text-xl
              font-bold
            ">
              Orders PDF
            </h2>

            <p>
              Export Orders PDF
            </p>

          </button>

        </div>

      </div>

    </div>

  );

}