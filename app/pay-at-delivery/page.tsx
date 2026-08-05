"use client";

import Link from "next/link";

export default function PayAtDeliveryPage() {
  return (
    <section className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl text-white p-10 shadow-lg">
          <h1 className="text-4xl font-bold">
            📱 Pay on Delivery (UPI)
          </h1>

          <p className="mt-4 text-lg text-green-50">
            Pay digitally when your order arrives at your doorstep.
          </p>
        </div>

        {/* Information */}
        <div className="bg-white rounded-3xl shadow-lg p-8 mt-8">

          <h2 className="text-2xl font-bold mb-6">
            How it works
          </h2>

          <div className="space-y-5">

            <div className="flex gap-4">
              <div className="text-3xl">🛒</div>
              <div>
                <h3 className="font-semibold text-lg">
                  1. Place Your Order
                </h3>
                <p className="text-gray-600">
                  Choose <strong>Pay on Delivery (UPI)</strong> during checkout.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="text-3xl">📦</div>
              <div>
                <h3 className="font-semibold text-lg">
                  2. Seller Ships Your Order
                </h3>
                <p className="text-gray-600">
                  Your order is packed and sent to the delivery partner.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="text-3xl">📱</div>
              <div>
                <h3 className="font-semibold text-lg">
                  3. Scan & Pay
                </h3>
                <p className="text-gray-600">
                  When the delivery partner arrives, simply scan the UPI QR code
                  using Google Pay, PhonePe, Paytm, BHIM, or any UPI app.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="text-3xl">✅</div>
              <div>
                <h3 className="font-semibold text-lg">
                  4. Receive Your Order
                </h3>
                <p className="text-gray-600">
                  Once payment is confirmed, your order is marked as delivered.
                </p>
              </div>
            </div>

          </div>

        </div>

        {/* Benefits */}
        <div className="grid md:grid-cols-3 gap-6 mt-8">

          <div className="bg-white rounded-2xl p-6 shadow">
            <div className="text-4xl mb-3">💳</div>
            <h3 className="font-bold text-lg">
              No Cash Needed
            </h3>
            <p className="text-gray-600 mt-2">
              Pay instantly using any UPI application.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow">
            <div className="text-4xl mb-3">🔒</div>
            <h3 className="font-bold text-lg">
              Secure Payment
            </h3>
            <p className="text-gray-600 mt-2">
              Complete payment only after your order reaches you.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow">
            <div className="text-4xl mb-3">⚡</div>
            <h3 className="font-bold text-lg">
              Fast & Easy
            </h3>
            <p className="text-gray-600 mt-2">
              Just scan, pay and receive your order.
            </p>
          </div>

        </div>

        {/* Coming Soon */}
        <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-6 mt-8">

          <h2 className="text-xl font-bold text-yellow-700">
            🚧 Feature Under Development
          </h2>

          <p className="text-yellow-700 mt-3">
            This payment method is currently being integrated into the YOMICO
            marketplace. It will soon be available during checkout.
          </p>

        </div>

        {/* Back Button */}
        <div className="text-center mt-10">

          <Link
            href="/"
            className="inline-block bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-semibold transition"
          >
            Back to Home
          </Link>

        </div>

      </div>
    </section>
  );
}