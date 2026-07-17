"use client";

import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminReportsPage() {
  // Flatten Firestore timestamps so Excel shows a readable date, not {seconds,...}
  const flatten = (obj: any) => {
    const out: any = {};
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (val && typeof val === "object" && typeof val.seconds === "number") {
        out[key] = new Date(val.seconds * 1000).toLocaleString();
      } else if (val && typeof val === "object") {
        out[key] = JSON.stringify(val);
      } else {
        out[key] = val;
      }
    });
    return out;
  };

  const exportExcel = async (collectionName: string, fileName: string) => {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      const data: any[] = [];
      snapshot.forEach((docSnap) => {
        data.push(flatten({ id: docSnap.id, ...docSnap.data() }));
      });

      if (data.length === 0) {
        alert(`No data found in "${collectionName}".`);
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

      const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });
      const fileData = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(fileData, `${fileName}.xlsx`);
    } catch (error) {
      console.error(error);
      alert("Export failed. Check the console for details.");
    }
  };

  const exportOrdersPDF = async () => {
    try {
      const snapshot = await getDocs(collection(db, "orders"));
      const rows: any[] = [];
      snapshot.forEach((docSnap) => {
        const order: any = docSnap.data();
        rows.push([
          order.customerName || "-",
          `₹${Number(order.finalTotal || order.total || 0).toLocaleString(
            "en-IN"
          )}`,
          order.status || "-",
        ]);
      });

      if (rows.length === 0) {
        alert("No orders to export.");
        return;
      }

      const pdf = new jsPDF();
      pdf.setFontSize(18);
      pdf.text("Yogi Mart Orders Report", 14, 20);
      autoTable(pdf, {
        startY: 30,
        head: [["Customer", "Amount", "Status"]],
        body: rows,
      });
      pdf.save("orders-report.pdf");
    } catch (error) {
      console.error(error);
      alert("PDF export failed. Check the console for details.");
    }
  };

  const cards = [
    { title: "Orders Report", desc: "Export all orders as Excel", onClick: () => exportExcel("orders", "orders-report") },
    { title: "Vendors Report", desc: "Export all vendors as Excel", onClick: () => exportExcel("vendors", "vendors-report") },
    { title: "Customers Report", desc: "Export all customers as Excel", onClick: () => exportExcel("users", "customers-report") },
    { title: "Refunds Report", desc: "Export all refunds/returns as Excel", onClick: () => exportExcel("returns", "refunds-report") },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-8 rounded-3xl mb-8">
          <h1 className="text-4xl font-bold">📄 Reports Center</h1>
          <p className="opacity-90">Download marketplace reports</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((card) => (
            <button
              key={card.title}
              onClick={card.onClick}
              className="bg-white p-6 rounded-3xl shadow text-left hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div className="text-3xl mb-2">📊</div>
              <h2 className="text-xl font-bold">{card.title}</h2>
              <p className="text-gray-500 text-sm mt-1">{card.desc}</p>
            </button>
          ))}

          <button
            onClick={exportOrdersPDF}
            className="bg-gradient-to-r from-red-600 to-orange-500 text-white p-6 rounded-3xl shadow text-left hover:shadow-lg hover:-translate-y-0.5 transition"
          >
            <div className="text-3xl mb-2">📕</div>
            <h2 className="text-xl font-bold">Orders PDF</h2>
            <p className="opacity-90 text-sm mt-1">Export orders as a PDF document</p>
          </button>
        </div>
      </div>
    </div>
  );
}
