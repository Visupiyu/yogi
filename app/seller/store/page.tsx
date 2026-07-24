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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">

  <div className="bg-white rounded-3xl shadow p-6 text-center border">
    <div className="text-4xl mb-3">📦</div>
    <h2 className="text-3xl font-bold text-green-600">0</h2>
    <p className="text-gray-500 mt-2">Products</p>
  </div>

  <div className="bg-white rounded-3xl shadow p-6 text-center border">
    <div className="text-4xl mb-3">🛒</div>
    <h2 className="text-3xl font-bold text-blue-600">0</h2>
    <p className="text-gray-500 mt-2">Orders</p>
  </div>

  <div className="bg-white rounded-3xl shadow p-6 text-center border">
    <div className="text-4xl mb-3">⭐</div>
    <h2 className="text-3xl font-bold text-yellow-500">0.0</h2>
    <p className="text-gray-500 mt-2">Average Rating</p>
  </div>

  <div className="bg-white rounded-3xl shadow p-6 text-center border">
    <div className="text-4xl mb-3">👀</div>
    <h2 className="text-3xl font-bold text-purple-600">0</h2>
    <p className="text-gray-500 mt-2">Store Views</p>
  </div>

</div>

        <div className="bg-white rounded-3xl shadow p-8">

          <div className="grid md:grid-cols-3 gap-8">

            <div>

  <div className="relative mb-6">

    <div className="h-48 rounded-3xl bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 flex items-center justify-center">

      <span className="text-white text-2xl font-bold">
        Store Cover Banner
      </span>

    </div>

    <img
      src="/store-placeholder.png"
      alt="Store Logo"
      className="w-36 h-36 rounded-full border-4 border-white object-cover absolute -bottom-14 left-1/2 -translate-x-1/2 bg-white"
    />

  </div>

  <div className="pt-16 text-center">

    <button
      className="
        bg-green-600
        hover:bg-green-700
        text-white
        px-6
        py-3
        rounded-xl
        font-semibold
      "
    >
      Change Logo
    </button>

  </div>

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
              <div>

  <label className="font-semibold">
    Phone Number
  </label>

  <input
    type="tel"
    className="w-full border rounded-xl p-3 mt-1"
    placeholder="+91 9876543210"
  />

</div>

<div>

  <label className="font-semibold">
    Email Address
  </label>

  <input
    type="email"
    className="w-full border rounded-xl p-3 mt-1"
    placeholder="store@yomico.in"
  />

</div>

<div>

  <label className="font-semibold">
    Complete Address
  </label>

  <textarea
    rows={3}
    className="w-full border rounded-xl p-3 mt-1"
    placeholder="Street, Area, Landmark"
  />

</div>

<div>

  <label className="font-semibold">
    PIN Code
  </label>

  <input
    className="w-full border rounded-xl p-3 mt-1"
    placeholder="600001"
  />

</div>
<div className="border-t pt-6">

  <h2 className="text-xl font-bold mb-4">
    🌐 Social Media
  </h2>

  <div className="grid md:grid-cols-2 gap-4">

    <input
      className="border rounded-xl p-3"
      placeholder="Facebook URL"
    />

    <input
      className="border rounded-xl p-3"
      placeholder="Instagram URL"
    />

    <input
      className="border rounded-xl p-3"
      placeholder="YouTube URL"
    />

    <input
      className="border rounded-xl p-3"
      placeholder="Website (Optional)"
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
              <div className="mt-10 border-t pt-8">

  <h2 className="text-2xl font-bold mb-6">
    👀 Store Preview
  </h2>

  <div className="bg-gradient-to-br from-white to-gray-50 border rounded-3xl shadow-lg p-6">

    <div className="flex items-center gap-5">

      <img
        src="/store-placeholder.png"
        alt="Store"
        className="w-20 h-20 rounded-full border object-cover"
      />

      <div>

        <h3 className="text-2xl font-bold">
          Your Store Name
        </h3>

        <p className="text-gray-500">
          📍 City, State
        </p>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-yellow-500">
            ⭐⭐⭐⭐⭐
          </span>
          <span className="text-sm text-gray-500">
            (0 Reviews)
          </span>
        </div>

      </div>

    </div>

    <div className="grid grid-cols-3 gap-4 mt-8 text-center">

      <div>
        <p className="text-2xl font-bold text-green-600">
          0
        </p>
        <p className="text-gray-500">
          Products
        </p>
      </div>

      <div>
        <p className="text-2xl font-bold text-blue-600">
          0
        </p>
        <p className="text-gray-500">
          Orders
        </p>
      </div>

      <div>
        <p className="text-2xl font-bold text-purple-600">
          0
        </p>
        <p className="text-gray-500">
          Followers
        </p>
      </div>

    </div>

    <button
      className="mt-8 w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold"
    >
      Visit Store
    </button>

  </div>

</div>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}