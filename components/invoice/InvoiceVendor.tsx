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

      <table className="w-full border-collapse">

        <tbody>

         <tr>
  <td className="border border-black p-1 font-semibold w-40 whitespace-nowrap">
    Vendor Name
  </td>
  <td className="border border-black p-1 w-full">
    {order.vendorName || "YOMICO Seller"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-40 whitespace-nowrap">
    GSTIN
  </td>
  <td className="border border-black p-1 w-full">
    {order.vendorGST || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-40 whitespace-nowrap">
    Phone
  </td>
  <td className="border border-black p-1 w-full">
    {order.vendorPhone || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-40 whitespace-nowrap">
    Email
  </td>
  <td className="border border-black p-1 w-full">
    {order.vendorEmail || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-40 whitespace-nowrap">
    Address
  </td>
  <td className="border border-black p-1 w-full whitespace-pre-line break-words">
    {order.vendorAddress || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-1 font-semibold w-40 whitespace-nowrap">
    Vendor ID
  </td>
  <td className="border border-black p-1 w-full">
    {order.vendorId || "-"}
  </td>
         </tr>

        </tbody>

      </table>

    </div>

  );

}