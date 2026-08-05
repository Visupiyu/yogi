"use client";

interface DeliveryQRProps {
  orderId: string;
  customerName: string;
  amount: number;
}

export default function DeliveryQR({
  orderId,
  customerName,
  amount,
}: DeliveryQRProps) {
  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md mx-auto">

      <div className="text-center">

        <div className="text-5xl mb-3">
          📱
        </div>

        <h2 className="text-2xl font-bold">
          Pay on Delivery
        </h2>

        <p className="text-gray-500 mt-2">
          Scan the QR code using any UPI App
        </p>

      </div>

      {/* Order Details */}

      <div className="mt-8 space-y-3 border rounded-2xl p-5">

        <div className="flex justify-between">
          <span className="text-gray-500">
            Order ID
          </span>

          <span className="font-semibold">
            {orderId}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500">
            Customer
          </span>

          <span className="font-semibold">
            {customerName}
          </span>
        </div>

        <div className="flex justify-between text-lg">
          <span className="font-semibold">
            Amount
          </span>

          <span className="font-bold text-green-600">
            ₹{amount.toLocaleString("en-IN")}
          </span>
        </div>

      </div>

      {/* QR Placeholder */}

      <div className="mt-8 flex justify-center">

        <div className="w-64 h-64 border-4 border-dashed rounded-2xl flex items-center justify-center bg-gray-50">

          <div className="text-center">

            <div className="text-7xl">
              🔳
            </div>

            <p className="text-sm text-gray-500 mt-3">
              Dynamic UPI QR
            </p>

            <p className="text-xs text-gray-400">
              (Coming in Phase 2)
            </p>

          </div>

        </div>

      </div>

      {/* Supported Apps */}

      <div className="grid grid-cols-2 gap-3 mt-8">

        <div className="bg-blue-50 rounded-xl p-3 text-center font-medium">
          Google Pay
        </div>

        <div className="bg-purple-50 rounded-xl p-3 text-center font-medium">
          PhonePe
        </div>

        <div className="bg-sky-50 rounded-xl p-3 text-center font-medium">
          Paytm
        </div>

        <div className="bg-green-50 rounded-xl p-3 text-center font-medium">
          BHIM UPI
        </div>

      </div>

      {/* Instructions */}

      <div className="mt-8 bg-green-50 rounded-2xl p-5">

        <h3 className="font-bold text-green-700 mb-3">
          Instructions
        </h3>

        <ul className="space-y-2 text-sm text-green-700">

          <li>• Scan the QR code using any UPI app.</li>

          <li>• Verify the payment amount before paying.</li>

          <li>• Show the payment success screen to the delivery partner.</li>

          <li>• Your order will be marked as Delivered after payment confirmation.</li>

        </ul>

      </div>

      {/* Phase 2 */}

      <button
        disabled
        className="w-full mt-8 bg-gray-300 text-gray-600 py-4 rounded-2xl font-bold cursor-not-allowed"
      >
        Payment Confirmation (Coming Soon)
      </button>

    </div>
  );
}