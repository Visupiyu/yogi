"use client";

interface ShippingLabelProps {
  order: any;
}

export default function ShippingLabel({
  order,
}: ShippingLabelProps) {
  if (!order) return null;

  return (
    <div
      id="shipping-label"
      className="max-w-2xl mx-auto bg-white text-black border-4 border-black p-8"
    >
      {/* Header */}

      <div className="text-center border-b-2 border-black pb-4">
        <h1 className="text-4xl font-bold">
          YOMICO
        </h1>

        <p className="text-lg font-semibold">
          SHIPPING LABEL
        </p>
      </div>

      {/* Order */}

      <div className="mt-6 grid grid-cols-2 gap-6">

        <div>

          <p>
            <strong>Order ID</strong>
          </p>

          <p>{order.id}</p>

        </div>

        <div>

          <p>
            <strong>Date</strong>
          </p>

          <p>
            {order.createdAt?.toDate
              ? order.createdAt
                  .toDate()
                  .toLocaleDateString()
              : new Date().toLocaleDateString()}
          </p>

        </div>

      </div>

      {/* Customer */}

      <div className="mt-8 border rounded-xl p-5">

        <h2 className="text-xl font-bold mb-4">
          Ship To
        </h2>

        <p className="font-bold text-lg">
          {order.customerName}
        </p>

        <p>{order.phone}</p>

        <p>{order.userEmail}</p>

        <div className="mt-3 whitespace-pre-wrap">
          {order.address}
        </div>

      </div>

      {/* Courier */}

      <div className="mt-8 grid grid-cols-2 gap-6">

        <div>

          <p className="font-semibold">
            Courier Partner
          </p>

          <p>
            {order.courierPartner || "-"}
          </p>

        </div>

        <div>

          <p className="font-semibold">
            Tracking Number
          </p>

          <p className="font-mono text-lg">
            {order.trackingNumber || "-"}
          </p>

        </div>

      </div>

      {/* Payment */}

      <div className="mt-8 border rounded-xl p-5">

        <div className="flex justify-between">

          <span>
            Payment Method
          </span>

          <strong>
            {order.paymentMethod}
          </strong>

        </div>

        <div className="flex justify-between mt-3">

          <span>
            Payment Status
          </span>

          <strong>
            {order.paymentStatus}
          </strong>

        </div>

        <div className="flex justify-between mt-3">

          <span>
            Order Status
          </span>

          <strong>
            {order.status}
          </strong>

        </div>

      </div>

      {/* Products */}

      <div className="mt-8">

        <h2 className="font-bold text-xl mb-4">
          Package Contents
        </h2>

        <table className="w-full border">

          <thead>

            <tr className="bg-gray-100">

              <th className="border p-2 text-left">
                Product
              </th>

              <th className="border p-2">
                Qty
              </th>

            </tr>

          </thead>

          <tbody>

            {order.items?.map(
              (item: any, index: number) => (

                <tr key={index}>

                  <td className="border p-2">
                    {item.name}
                  </td>

                  <td className="border p-2 text-center">
                    {item.qty}
                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>

      </div>

      {/* Footer */}

      <div className="mt-10 border-t pt-6 text-center">

        <p className="text-lg font-bold">
          Handle With Care
        </p>

        <p className="text-gray-600">
          Thank you for selling with YOMICO
        </p>

      </div>

    </div>
  );
}