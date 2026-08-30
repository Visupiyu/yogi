"use client";

interface InvoiceInfoProps {
  order: any;
}

export default function InvoiceInfo({
  order,
}: InvoiceInfoProps) {

  return (

    <div className="mt-1">

      <h2 className="text-base font-bold mb-2">
        Invoice Information
      </h2>

      <div className="overflow-x-auto">
      <table className="w-full border-2 border-black border-collapse">

        <tbody>

          <tr>

            <td className="border border-black p-1 font-semibold w-1/6">
              Invoice No
            </td>

            <td className="border border-black p-1">
              {order.invoiceNumber || order.id}
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
              Invoice Date
            </td>

            <td className="border border-black p-1">

              {order.createdAt
                ? order.createdAt
                    .toDate()
                    .toLocaleDateString("en-IN")
                : "-"}

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