"use client";

export default function SellerStorePage() {

  return (

    <div className="min-h-screen bg-gray-100 p-8">

      <div className="max-w-6xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl p-8 text-white mb-8">

          <h1 className="text-4xl font-bold">

            🏪 My Store

          </h1>

          <p className="mt-2 opacity-90">

            Manage your store information and preview your storefront.

          </p>

        </div>

        <div className="bg-white rounded-3xl shadow p-8">

          <div className="grid md:grid-cols-3 gap-8">

            <div className="text-center">

              <img
                src="/store-placeholder.png"
                alt="Store Logo"
                className="w-40 h-40 rounded-full mx-auto border object-cover"
              />

              <button
                className="
                mt-4
                bg-green-600
                text-white
                px-6
                py-2
                rounded-xl
              "
              >

                Change Logo

              </button>

            </div>

            <div className="md:col-span-2 space-y-4">

              <div>

                <label className="font-semibold">

                  Store Name

                </label>

                <input
                  className="w-full border rounded-xl p-3 mt-1"
                  placeholder="Store Name"
                />

              </div>

              <div>

                <label className="font-semibold">

                  Store Description

                </label>

                <textarea
                  rows={5}
                  className="w-full border rounded-xl p-3 mt-1"
                  placeholder="Describe your store..."
                />

              </div>

              <div className="grid md:grid-cols-2 gap-4">

                <div>

                  <label className="font-semibold">

                    City

                  </label>

                  <input
                    className="w-full border rounded-xl p-3 mt-1"
                  />

                </div>

                <div>

                  <label className="font-semibold">

                    State

                  </label>

                  <input
                    className="w-full border rounded-xl p-3 mt-1"
                  />

                </div>

              </div>

              <button
                className="
                bg-blue-600
                hover:bg-blue-700
                text-white
                px-8
                py-3
                rounded-xl
              "
              >

                Save Store Information

              </button>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}