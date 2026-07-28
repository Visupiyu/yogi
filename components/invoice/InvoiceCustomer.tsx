"use client";

interface InvoiceCustomerProps {
  order: any;
}

export default function InvoiceCustomer({
  order,
}: InvoiceCustomerProps) {

  return (

    <div className="border-2 border-black rounded-lg overflow-hidden">

      <div className="bg-gray-100 border-b-2 border-black p-1">

        <h2 className="text-base font-bold">
          BILL TO
        </h2>

      </div>

      <table className="w-full border-collapse">

        <tbody>

          <tr>

            <td className="border border-black p-1 font-semibold w-1/6">
              Customer Name
            </td>

            <td className="border border-black p-1">
              {order.customerName || "-"}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              Email
            </td>

            <td className="border border-black p-1">
              {order.userEmail || "-"}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              Phone
            </td>

            <td className="border border-black p-1">
              {order.phone || "-"}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              Delivery Address
            </td>

            <td className="border border-black p-1 whitespace-pre-line">
              {order.address || "-"}
            </td>

          </tr>

          <tr>

            <td className="border border-black p-1 font-semibold">
              Customer ID
            </td>

            <td className="border border-black p-1">
              {order.userId || "-"}
            </td>

          </tr>

        </tbody>

      </table>

    </div>

  );

}