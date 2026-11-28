"use client";

import { supplierDisplayName, type InvoiceOrderLike, type SupplierInvoice } from "@/lib/invoiceTax";

interface InvoiceVendorProps {
  order: InvoiceOrderLike;
  /** The seller's recorded tax identity for THIS document (lib/invoiceTax). */
  supplier?: SupplierInvoice;
}

const GST_STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Registered (Regular)",
  COMPOSITION: "Composition",
  UNREGISTERED: "Not registered under GST",
};

export default function InvoiceVendor({
  order,
  supplier,
}: InvoiceVendorProps) {
  // The seller of this document (the supplier): the name on one of their own
  // order lines, falling back to the order-level name.
  const vendorName = supplierDisplayName(order, supplier?.vendorId || "");
  // What YOMICO's admin GST review recorded at confirmation — a review of the
  // seller's documents, not a government registry check. Not applicable to a
  // seller who is not registered.
  const verificationLabel =
    supplier?.gstStatus === "UNREGISTERED"
      ? "Not applicable"
      : supplier?.gstinVerified === true
      ? "Verified by YOMICO review"
      : supplier?.gstinVerified === false
      ? "Not verified"
      : "Not recorded";
  // Interim (CX-01): an ORDER SUMMARY is not a tax document, so it carries no
  // GST registration status, GSTIN or verification statement. Formal documents
  // (TAX INVOICE / BILL OF SUPPLY) render these rows exactly as before. With no
  // supplier there is no recorded tax identity to show either.
  const showTaxIdentity = !!supplier && supplier.kind !== "ORDER_SUMMARY";

  return (

    <div className="border-2 border-black rounded-lg overflow-hidden">

      {/* Header */}

      <div className="bg-gray-100 border-b-2 border-black p-1">

        <h2 className="text-lg font-bold">
          SOLD BY
        </h2>

      </div>

      <table className="w-full table-fixed border-collapse">

        <tbody>

         <tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    Vendor Name
  </td>
  <td className="border border-black p-1 w-full break-words">
    {vendorName}
  </td>
</tr>

{showTaxIdentity && (
<>
<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    GST status
  </td>
  <td className="border border-black p-1 w-full break-words">
    {(supplier?.gstStatus && GST_STATUS_LABEL[supplier.gstStatus]) || "Not recorded"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    GSTIN
  </td>
  <td className="border border-black p-1 w-full break-words">
    {supplier?.gstin || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    GSTIN verification
  </td>
  <td className="border border-black p-1 w-full break-words">
    {verificationLabel}
  </td>
</tr>
</>
)}

<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    Phone
  </td>
  <td className="border border-black p-1 w-full break-words">
    {order.vendorPhone || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    Email
  </td>
  <td className="border border-black p-1 w-full break-words">
    {order.vendorEmail || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    Address
  </td>
  <td className="border border-black p-1 w-full whitespace-pre-line break-words">
    {order.vendorAddress || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    Vendor ID
  </td>
  <td className="border border-black p-1 w-full break-words">
    {order.vendorId || "-"}
  </td>
         </tr>

        </tbody>

      </table>

    </div>

  );

}