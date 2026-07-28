"use client";

interface InvoiceProps {
  order: any;
  type: "customer" | "seller" | "admin";
}

export default function Invoice({
  order,
  type,
}: InvoiceProps) {

  const grandTotal =
    Number(order.finalTotal || order.total || 0);

  const shipping =
    Number(order.shippingCharge || 0);

  const discount =
    Number(order.discount || 0);

  const taxableAmount =
    grandTotal / 1.18;

  const gst =
    grandTotal - taxableAmount;

  const subtotal =
    taxableAmount;

  return (

    <div
      className="
        max-w-5xl
        mx-auto
        bg-white
        p-8
        rounded-2xl
        shadow
        print:shadow-none
        print:max-w-full
        print:p-4
      "
    >

      {/* Header */}

      <div className="flex justify-between border-b pb-6">

        <div>

          <img
            src="/logo.png"
            alt="YOMICO"
            className="h-16 mb-3"
          />

          <h1 className="text-4xl font-bold text-green-700">
            YOMICO
          </h1>

          <p className="text-gray-600">
            India's Multi Vendor Marketplace
          </p>

          <p className="text-gray-600">
            Vadodara, Gujarat
          </p>

          <p className="text-gray-600">
            GSTIN : 24ABCDE1234F1Z5
          </p>

          <p className="text-gray-600">
            support@yomico.in
          </p>

          <p className="text-gray-600">
            www.yomico.in
          </p>

        </div>

        <div className="text-right">

          <h2 className="text-3xl font-bold">
            TAX INVOICE
          </h2>

          <table className="mt-5 border border-gray-300">

            <tbody>

              <tr>

                <td className="border p-2 font-semibold">
                  Invoice No
                </td>

                <td className="border p-2">
                  {order.id}
                </td>

              </tr>

              <tr>

                <td className="border p-2 font-semibold">
                  Order ID
                </td>

                <td className="border p-2">
                  {order.id}
                </td>

              </tr>

              <tr>

                <td className="border p-2 font-semibold">
                  Date
                </td>

                <td className="border p-2">

                  {order.createdAt
                    ? order.createdAt
                        .toDate()
                        .toLocaleDateString("en-IN")
                    : "-"}

                </td>

              </tr>

            </tbody>

          </table>

        </div>

      </div>

      {/* Customer & Seller Details */}

      <div className="grid grid-cols-2 gap-6 mt-8">

        <div className="border rounded-xl p-5">

          <h3 className="font-bold text-lg mb-4">
            BILL TO
          </h3>

          <table className="w-full">

            <tbody>

              <tr>

                <td className="py-2 font-semibold">
                  Name
                </td>

                <td>
                  {order.customerName}
                </td>

              </tr>

              <tr>

                <td className="py-2 font-semibold">
                  Email
                </td>

                <td>
                  {order.userEmail}
                </td>

              </tr>

              <tr>

                <td className="py-2 font-semibold">
                  Phone
                </td>

                <td>
                  {order.phone}
                </td>

              </tr>

              <tr>

                <td className="py-2 font-semibold">
                  Address
                </td>

                <td>
                  {order.address}
                </td>

              </tr>

            </tbody>

          </table>

        </div>

        <div className="border rounded-xl p-5">

          <h3 className="font-bold text-lg mb-4">
            SOLD BY
          </h3>

          <table className="w-full">

            <tbody>

              <tr>

                <td className="py-2 font-semibold">
                  Seller
                </td>

                <td>
                  {order.vendorName || "YOMICO Seller"}
                </td>

              </tr>

              <tr>

                <td className="py-2 font-semibold">
                  GST No
                </td>

                <td>
                  {order.vendorGST || "-"}
                </td>

              </tr>

              <tr>

                <td className="py-2 font-semibold">
                  Phone
                </td>

                <td>
                  {order.vendorPhone || "-"}
                </td>

              </tr>

              <tr>

                <td className="py-2 font-semibold">
                  Address
                </td>

                <td>
                  {order.vendorAddress || "-"}
                </td>

              </tr>

            </tbody>

          </table>

        </div>

      </div>
            {/* Product Details */}

      <div className="mt-8">

        <h3 className="text-xl font-bold mb-4">
          Product Details
        </h3>

        <table className="w-full border border-gray-300">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-3">
                #
              </th>

              <th className="border p-3 text-left">
                Product
              </th>

              <th className="border p-3">
                Qty
              </th>

              <th className="border p-3">
                Unit Price
              </th>

              <th className="border p-3">
                Amount
              </th>

            </tr>

          </thead>

          <tbody>

            {order.items?.map(
              (
                item: any,
                index: number
              ) => (

                <tr key={index}>

                  <td className="border p-3 text-center">
                    {index + 1}
                  </td>

                  <td className="border p-3">
                    {item.name}
                  </td>

                  <td className="border p-3 text-center">
                    {item.qty}
                  </td>

                  <td className="border p-3 text-right">
                    ₹{Number(
                      item.price
                    ).toLocaleString("en-IN")}
                  </td>

                  <td className="border p-3 text-right font-semibold">
                    ₹{Number(
                      item.price * item.qty
                    ).toLocaleString("en-IN")}
                  </td>

                </tr>

              )

            )}

          </tbody>

        </table>

      </div>

      {/* Order Summary */}

      <div className="mt-8 flex justify-end">

        <table className="w-96 border border-gray-300">

          <tbody>

            <tr>

              <td className="border p-3 font-semibold">
                Subtotal
              </td>

              <td className="border p-3 text-right">
                ₹{subtotal.toFixed(2)}
              </td>

            </tr>

            <tr>

              <td className="border p-3 font-semibold">
                GST (18%)
              </td>

              <td className="border p-3 text-right">
                ₹{gst.toFixed(2)}
              </td>

            </tr>

            <tr>

              <td className="border p-3 font-semibold">
                Shipping
              </td>

              <td className="border p-3 text-right">
                ₹{shipping.toLocaleString("en-IN")}
              </td>

            </tr>

            <tr>

              <td className="border p-3 font-semibold">
                Discount
              </td>

              <td className="border p-3 text-right text-red-600">
                - ₹{discount.toLocaleString("en-IN")}
              </td>

            </tr>

            <tr className="bg-green-50">

              <td className="border p-3 text-lg font-bold">
                Grand Total
              </td>

              <td className="border p-3 text-right text-xl font-bold text-green-700">
                ₹{grandTotal.toLocaleString("en-IN")}
              </td>

            </tr>

          </tbody>

        </table>

      </div>
            {/* Payment Details */}

      <div className="mt-8">

        <h3 className="text-xl font-bold mb-4">
          Payment Details
        </h3>

        <table className="w-full border border-gray-300">

          <tbody>

            <tr>

              <td className="border p-3 font-semibold w-1/3">
                Payment Method
              </td>

              <td className="border p-3">
                {order.paymentMethod || "-"}
              </td>

            </tr>

            <tr>

              <td className="border p-3 font-semibold">
                Payment Status
              </td>

              <td className="border p-3">

                <span
                  className={`font-semibold ${
                    order.paymentStatus === "Paid"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {order.paymentStatus || "-"}
                </span>

              </td>

            </tr>

            <tr>

              <td className="border p-3 font-semibold">
                Order Status
              </td>

              <td className="border p-3">
                {order.status || "-"}
              </td>

            </tr>

          </tbody>

        </table>

      </div>

      {/* Seller/Admin Financial Details */}

      {type !== "customer" && (

        <div className="mt-8">

          <h3 className="text-xl font-bold mb-4">
            Financial Details
          </h3>

          <table className="w-full border border-gray-300">

            <tbody>

              <tr>

                <td className="border p-3 font-semibold">
                  Commission
                </td>

                <td className="border p-3 text-right text-red-600 font-semibold">
                  ₹{Number(
                    order.commission || 0
                  ).toLocaleString("en-IN")}
                </td>

              </tr>

              <tr>

                <td className="border p-3 font-semibold">
                  Seller Earnings
                </td>

                <td className="border p-3 text-right text-green-700 font-semibold">
                  ₹{Number(
                    order.sellerEarning || 0
                  ).toLocaleString("en-IN")}
                </td>

              </tr>

              {type === "admin" && (

                <tr>

                  <td className="border p-3 font-semibold">
                    Platform Revenue
                  </td>

                  <td className="border p-3 text-right font-semibold">
                    ₹{Number(
                      order.commission || 0
                    ).toLocaleString("en-IN")}
                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      )}

      {/* Terms & Conditions */}

      <div className="mt-8 border rounded-xl p-6">

        <h3 className="text-lg font-bold mb-3">
          Terms & Conditions
        </h3>

        <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">

          <li>
            This is a computer-generated tax invoice.
          </li>

          <li>
            Goods once sold are subject to the return policy.
          </li>

          <li>
            Warranty, if applicable, is provided by the seller or manufacturer.
          </li>

          <li>
            Please retain this invoice for future warranty and support purposes.
          </li>

        </ul>

      </div>
            {/* Signature Section */}

      <div className="grid grid-cols-2 gap-10 mt-12">

        <div>

          <h3 className="font-bold mb-2">
            Customer Signature
          </h3>

          <div className="border-b border-gray-400 h-20"></div>

        </div>

        <div className="text-right">

          <h3 className="font-bold mb-2">
            Authorized Signatory
          </h3>

          <div className="border-b border-gray-400 h-20"></div>

          <p className="mt-3 font-semibold">
            For YOMICO
          </p>

        </div>

      </div>

      {/* Footer */}

      <hr className="my-10" />

      <div className="text-center text-sm text-gray-600">

        <p className="font-semibold text-gray-800">
          Thank you for shopping with YOMICO.
        </p>

        <p className="mt-2">
          This is a computer-generated tax invoice and does not require a physical signature.
        </p>

        <p className="mt-2">
          For support contact:
          <span className="font-semibold">
            {" "}support@yomico.in
          </span>
        </p>

        <p className="mt-1">
          Website: www.yomico.in
        </p>

      </div>

      {/* Print Buttons */}

      <div className="flex gap-4 justify-center mt-10 print:hidden">

        <button
          onClick={() => window.print()}
          className="
            bg-black
            hover:bg-gray-800
            text-white
            px-6
            py-3
            rounded-xl
          "
        >
          🖨️ Print Invoice
        </button>

        <button
          onClick={() => window.history.back()}
          className="
            bg-gray-200
            hover:bg-gray-300
            px-6
            py-3
            rounded-xl
          "
        >
          ← Back
        </button>

      </div>

    </div>

  );

}