"use client";

interface InvoiceVendorProps {
  order: any;
}

export default function InvoiceVendor({
  order,
}: InvoiceVendorProps) {

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
    {order.vendorName || "YOMICO Seller"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-28 sm:w-40">
    GSTIN
  </td>
  <td className="border border-black p-1 w-full break-words">
    {order.vendorGST || "-"}
  </td>
</tr>

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