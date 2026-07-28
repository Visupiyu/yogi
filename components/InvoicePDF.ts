"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function generateInvoicePDF(order: any) {
  const pdf = new jsPDF();

  // Header
  pdf.setFontSize(22);
  pdf.setTextColor(0, 128, 0);
  pdf.text("YOMICO", 14, 20);

  pdf.setFontSize(12);
  pdf.setTextColor(100);
  pdf.text("Marketplace Invoice", 14, 28);

  pdf.setDrawColor(180);
  pdf.line(14, 32, 196, 32);

  // Invoice Details
  pdf.setFontSize(11);
  pdf.setTextColor(0);

  pdf.text(`Invoice #: ${order.id?.slice(0, 8)}`, 14, 42);
  pdf.text(`Order ID: ${order.id}`, 14, 49);

  pdf.text(
    `Date: ${
      order.createdAt?.toDate
        ? order.createdAt.toDate().toLocaleDateString()
        : new Date().toLocaleDateString()
    }`,
    14,
    56
  );

  // Customer
  pdf.setFontSize(14);
  pdf.text("Customer Details", 14, 70);

  pdf.setFontSize(11);

  pdf.text(`Name: ${order.customerName || ""}`, 14, 78);
  pdf.text(`Email: ${order.userEmail || ""}`, 14, 85);
  pdf.text(`Phone: ${order.phone || ""}`, 14, 92);

  const address = order.address || "";
  const addressLines = pdf.splitTextToSize(address, 170);

  pdf.text(addressLines, 14, 100);

  // Products Table
  const rows =
    order.items?.map((item: any) => [
      item.name,
      item.qty,
      `₹${item.price}`,
      `₹${item.qty * item.price}`,
    ]) || [];

  autoTable(pdf, {
    startY: 125,
    head: [["Product", "Qty", "Price", "Total"]],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: [22, 163, 74],
    },
  });

  const finalY =
    (pdf as any).lastAutoTable.finalY + 12;

  // Totals
  pdf.setFontSize(12);

  pdf.text(
    `Subtotal : ₹${order.total || 0}`,
    140,
    finalY
  );

  pdf.text(
    `Shipping : ₹${order.shippingCharge || 0}`,
    140,
    finalY + 8
  );

  pdf.setFontSize(14);

  pdf.text(
    `Grand Total : ₹${
      order.finalTotal ||
      order.total ||
      0
    }`,
    140,
    finalY + 20
  );

  pdf.setFontSize(11);

  pdf.text(
    `Payment Method : ${order.paymentMethod || "-"}`,
    14,
    finalY + 40
  );

  pdf.text(
    `Payment Status : ${order.paymentStatus || "-"}`,
    14,
    finalY + 48
  );

  pdf.text(
    `Order Status : ${order.status || "-"}`,
    14,
    finalY + 56
  );

  // Footer
  pdf.setDrawColor(180);
  pdf.line(14, finalY + 68, 196, finalY + 68);

  pdf.setFontSize(12);
  pdf.setTextColor(80);

  pdf.text(
    "Thank you for shopping with YOMICO.",
    14,
    finalY + 78
  );

  pdf.text(
    "This is a computer-generated invoice.",
    14,
    finalY + 86
  );

  pdf.save(`Invoice-${order.id}.pdf`);
}