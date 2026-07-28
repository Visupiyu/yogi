"use client";

interface InvoicePaymentProps {
  order: any;
}

export default function InvoicePayment({
  order,
}: InvoicePaymentProps) {

  return (

    <div className="mt-1">

      <h2 className="text-base font-bold mb-2">
        Payment Information
      </h2>

      <table className="w-full border-2 border-black border-collapse">

        <tbody>

 <tr>
  <td className="border border-black p-2 font-semibold w-40 whitespace-nowrap">
    Payment Method
  </td>

  <td className="border border-black p-2 w-full">
    {order.paymentMethod || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-40 whitespace-nowrap">
    Payment Status
  </td>

  <td className="border border-black p-2 w-full">
    {order.paymentStatus || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-40 whitespace-nowrap">
    Order Status
  </td>

  <td className="border border-black p-2 w-full">
    {order.status || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-40 whitespace-nowrap">
    Transaction ID
  </td>

  <td className="border border-black p-2 w-full">
    {order.transactionId || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-40 whitespace-nowrap">
    Payment Date
  </td>

  <td className="border border-black p-2 w-full">
    {order.paymentDate
      ? new Date(order.paymentDate).toLocaleDateString("en-IN")
      : "-"}
  </td>
</tr>

        </tbody>

      </table>

    </div>

  );

}