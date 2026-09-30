"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/firebase";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";
import { fetchSellerReport } from "@/lib/sellerAnalytics/sellerAnalyticsClient";
import type { SellerReport } from "@/lib/sellerAnalytics/sellerAnalytics";
import { onAuthStateChanged } from "firebase/auth";

import * as XLSX from "xlsx";

import jsPDF from "jspdf";

import autoTable from "jspdf-autotable";

// The report is built on the server (app/api/seller/reports): this seller's
// own orders in the chosen IST date range, one allow-listed row each (order
// number, customer name, own lines/units/item value, own stage, payment
// method, date) and totals over EVERY order in range. Both exports are made
// from exactly those rows, so a download can never carry more than the
// screen shows, and the totals cannot drift from it.

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "-";

function exportRows(report: SellerReport) {
  return report.rows.map((row) => ({
    Order: row.orderRef,
    Customer: row.customerName,
    Lines: row.lines,
    Units: row.units,
    "Amount (₹)": row.amount,
    Status: fulfilmentStageLabel(row.stage),
    Payment: row.paymentMethod || "-",
    Date: formatDate(row.createdAt),
  }));
}

function fileSuffix(report: SellerReport) {
  const { from, to } = report.range;
  if (!from && !to) return "all";
  return `${from || "start"}_to_${to || "today"}`;
}

export default function SellerReportsPage(){

  const router = useRouter();

  const [report,setReport] =
    useState<SellerReport | null>(null);

  const [loading,setLoading] =
    useState(true);

  const [error,setError] =
    useState<string | null>(null);

  const [from,setFrom] =
    useState("");

  const [to,setTo] =
    useState("");

  const loadReport = useCallback(async (range: { from?: string; to?: string }) => {
    setLoading(true);
    const result = await fetchSellerReport(range);
    setReport(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(()=>{

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      if (!user) {
        router.push("/vendor-login");
        return;
      }

      loadReport({});

    });

    return () => unsubscribe();

  },[router, loadReport]);

  const applyRange = () => {
    loadReport({ from: from || undefined, to: to || undefined });
  };

  const clearRange = () => {
    setFrom("");
    setTo("");
    loadReport({});
  };

  const exportExcel = ()=>{

    if (!report) return;

    const worksheet =

      XLSX.utils.json_to_sheet(
        exportRows(report)
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

      `seller-orders-${fileSuffix(report)}.xlsx`

    );

  };

  const exportPDF = ()=>{

    if (!report) return;

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

            "Units",

            "Amount",

            "Status",

            "Date"

          ]

        ],

        body:

          report.rows.map(

            (row)=>([

              row.orderRef,

              row.customerName,

              row.units,

              "Rs. "+row.amount.toLocaleString("en-IN"),

              fulfilmentStageLabel(row.stage),

              formatDate(row.createdAt)

            ])

          )

      }

    );

    pdf.save(

      `seller-orders-${fileSuffix(report)}.pdf`

    );

  };

  if(loading && !report){

    return(

      <div className="
        p-10
        text-center
      ">

        Loading...

      </div>

    );

  }

  const rows = report?.rows || [];

  return(

    <div className="
      min-h-screen
      bg-gray-100
      p-4 md:p-6
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
          p-5 md:p-8
          mb-8
        ">

          <h1 className="
            text-3xl md:text-4xl
            font-bold
          ">

            Seller Reports

          </h1>

          <p className="mt-2">

            Export your business reports

          </p>

        </div>

        <div className="mb-8 flex flex-wrap items-end gap-4 rounded-3xl bg-white p-6 shadow">

          <label className="flex flex-col text-sm text-gray-600">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border px-3 py-2 text-gray-900"
            />
          </label>

          <label className="flex flex-col text-sm text-gray-600">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border px-3 py-2 text-gray-900"
            />
          </label>

          <button
            onClick={applyRange}
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-white disabled:opacity-50"
          >
            Apply
          </button>

          <button
            onClick={clearRange}
            disabled={loading}
            className="rounded-xl border px-5 py-2 disabled:opacity-50"
          >
            All time
          </button>

        </div>

        {error && (

          <div className="mb-8 rounded-2xl bg-red-50 p-4 text-red-700">
            {error}
          </div>

        )}

<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
  <div className="rounded-3xl bg-white p-6 shadow">
    <p className="text-gray-500">
      Booked Sales
    </p>
    <h2 className="break-words mt-2 text-3xl md:text-4xl font-bold text-green-600">
      ₹{(report?.totals.bookedSales ?? 0).toLocaleString("en-IN")}
    </h2>
    <p className="mt-1 text-xs text-gray-500">
      Your item value on orders that are not cancelled. Settled earnings are in your wallet.
    </p>
  </div>
  <div className="rounded-3xl bg-white p-6 shadow">
    <p className="text-gray-500">
      Orders
    </p>
    <h2 className="break-words mt-2 text-3xl md:text-4xl font-bold">
      {report?.totals.orders ?? 0}
    </h2>
    <p className="mt-1 text-xs text-gray-500">
      {report?.totals.cancelled ?? 0} cancelled (listed, not counted)
    </p>
  </div>
  <div className="rounded-3xl bg-white p-6 shadow">
    <p className="text-gray-500">
      Units
    </p>
    <h2 className="break-words mt-2 text-3xl md:text-4xl font-bold">
      {report?.totals.units ?? 0}
    </h2>
  </div>
</div>

        {report?.truncated && (

          <div className="mb-8 rounded-2xl bg-yellow-50 p-4 text-yellow-800">
            Showing the newest {rows.length} orders. Totals cover every order in the range — narrow the dates to see the rest.
          </div>

        )}

        <div className="
          flex
          flex-wrap
          gap-4
          mb-8
        ">

          <button

            onClick={
              exportExcel
            }

            disabled={!report || rows.length === 0}

            className="
              bg-green-600
              text-white
              px-6
              py-3
              rounded-xl
              disabled:opacity-50
            "

          >

            Export Excel

          </button>

          <button

            onClick={
              exportPDF
            }

            disabled={!report || rows.length === 0}

            className="
              bg-red-600
              text-white
              px-6
              py-3
              rounded-xl
              disabled:opacity-50
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

                  Units

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

              {rows.length === 0 ? (

                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No orders in this period.
                  </td>
                </tr>

              ) : rows.map((row, index)=>(

                <tr
                  key={`${row.orderRef}-${index}`}
                  className="
                    border-b
                  "
                >

                  <td className="
                    p-4
                  ">

                    {row.orderRef}

                  </td>

                  <td>

                    {row.customerName}

                  </td>

                  <td>

                    {row.units}

                  </td>

                  <td>

                    ₹{row.amount.toLocaleString("en-IN")}

                  </td>

                  <td>

                    {fulfilmentStageLabel(row.stage)}

                  </td>

                  <td>

                    {formatDate(row.createdAt)}

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
