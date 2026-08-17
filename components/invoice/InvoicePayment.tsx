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

      <table className="w-full table-fixed border-2 border-black border-collapse">

        <tbody>

 <tr>
  <td className="border border-black p-2 font-semibold w-28 sm:w-40">
    Payment Method
  </td>

  <td className="border border-black p-2 w-full break-words">
    {order.paymentMethod || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-28 sm:w-40">
    Payment Status
  </td>

  <td className="border border-black p-2 w-full break-words">
    {order.paymentStatus || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-28 sm:w-40">
    Order Status
  </td>

  <td className="border border-black p-2 w-full break-words">
    {order.status || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-28 sm:w-40">
    Transaction ID
  </td>

  <td className="border border-black p-2 w-full break-words">
    {order.transactionId || "-"}
  </td>
</tr>

<tr>
  <td className="border border-black p-2 font-semibold w-28 sm:w-40">
    Payment Date
  </td>

  <td className="border border-black p-2 w-full break-words">
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