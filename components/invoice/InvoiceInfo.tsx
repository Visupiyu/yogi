"use client";

import { documentLabels, type SupplierInvoice } from "@/lib/invoiceTax";

interface InvoiceInfoProps {
  order: any;
  /** The document this block heads — its labels follow the document kind. */
  supplier: SupplierInvoice;
}

// A Firestore Timestamp, a Timestamp-like {toDate()}, an ISO string or a Date.
function toDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || value instanceof Date) {
    const d = new Date(value as string);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export default function InvoiceInfo({
  order,
  supplier,
}: InvoiceInfoProps) {
  const labels = documentLabels(supplier.kind);
  // A tax invoice / bill of supply is issued at confirmation (when its number
  // is minted); an order summary is dated by the order.
  const issued = supplier.kind === "ORDER_SUMMARY" ? null : toDateValue(order.confirmedAt);
  const documentDate = issued || toDateValue(order.createdAt);
  const documentNumber =
    supplier.kind === "ORDER_SUMMARY"
      ? order.orderNumber || order.id
      : order.invoiceNumber || order.orderNumber || order.id;

  return (

    <div className="mt-1">

      <h2 className="text-base font-bold mb-2">
        {labels.section}
      </h2>

      <div className="overflow-x-auto">
      <table className="w-full border-2 border-black border-collapse">

        <tbody>

          <tr>

            <td className="border border-black p-1 font-semibold w-1/6">
              {labels.number}
            </td>

            <td className="border border-black p-1">
              {documentNumber}
            </td>

            <td className="border border-black p-1 font-semibold w-1/6">
              Order No
            </td>

            <td className="border border-black p-1">
              {order.orderNumber || order.id}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              {labels.date}
            </td>

            <td className="border border-black p-1">

              {documentDate ? documentDate.toLocaleDateString("en-IN") : "-"}

            </td>

            <td className="border border-black p-1 font-semibold">
              Payment Method
            </td>

            <td className="border border-black p-1">
              {order.paymentMethod || "-"}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              Payment Status
            </td>

            <td className="border border-black p-1">

              <span
                className={
                  order.paymentStatus === "Paid"
                    ? "font-bold text-green-700"
                    : "font-bold text-red-600"
                }
              >
                {order.paymentStatus || "-"}
              </span>

            </td>

            <td className="border border-black p-1 font-semibold">
              Order Status
            </td>

            <td className="border border-black p-1">
              {order.status || "-"}
            </td>

          </tr>

        </tbody>

      </table>
      </div>

    </div>

  );

}