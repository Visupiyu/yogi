 import Link from "next/link";

export default function AboutPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-6xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-6">
         About YOMICO
        </h1>

        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-12">
          YOMICO is a modern multi-vendor marketplace connecting
          customers with trusted sellers across India.
        </p>

        <div className="grid md:grid-cols-2 gap-8">

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-3xl font-bold mb-4">
              Our Mission
            </h2>

            <p className="text-gray-600 leading-8">
              To empower local businesses and provide customers with
              quality products at competitive prices through a trusted
              digital marketplace.
            </p>

          </div>

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-3xl font-bold mb-4">
              Our Vision
            </h2>

            <p className="text-gray-600 leading-8">
              To become one of India's most trusted online marketplaces
              by supporting sellers and delivering exceptional customer
              experiences.
            </p>

          </div>

        </div>

        <div className="bg-white p-8 rounded-2xl shadow mt-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10">

  <div className="bg-white rounded-2xl shadow p-6 text-center">
    <h3 className="text-4xl font-bold text-green-600">10K+</h3>
    <p className="text-gray-600 mt-2">Products</p>
  </div>

  <div className="bg-white rounded-2xl shadow p-6 text-center">
    <h3 className="text-4xl font-bold text-green-600">500+</h3>
    <p className="text-gray-600 mt-2">Trusted Sellers</p>
  </div>

  <div className="bg-white rounded-2xl shadow p-6 text-center">
    <h3 className="text-4xl font-bold text-green-600">50+</h3>
    <p className="text-gray-600 mt-2">Categories</p>
  </div>

  <div className="bg-white rounded-2xl shadow p-6 text-center">
    <h3 className="text-4xl font-bold text-green-600">24/7</h3>
    <p className="text-gray-600 mt-2">Customer Support</p>
  </div>

</div>

          <h2 className="text-3xl font-bold mb-6">
            Why Shop With Us?
          </h2>

          <div className="grid md:grid-cols-3 gap-6">

            <div>
              <h3 className="font-bold text-xl mb-2">
               🔒 Secure Shopping
              </h3>

              <p className="text-gray-600">
                Safe payments and reliable order processing.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-xl mb-2">
                ✅ Verified Sellers
              </h3>

              <p className="text-gray-600">
                Products from verified vendors.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-xl mb-2">
                🚚 Fast Delivery
              </h3>

              <p className="text-gray-600">
                Quick and efficient order fulfillment.
              </p>
            </div>

          </div>

        </div>
        <div className="
  bg-white
  p-8
  rounded-2xl
  shadow
  mt-10
">

  <h2 className="
    text-3xl
    font-bold
    mb-4
  ">
    Our Values
  </h2>

  <p className="
    text-gray-600
    leading-8
  ">
    Transparency,
    customer satisfaction,
    seller growth,
    and secure online
    shopping are at the
    core of YOMICO.
  </p>

</div>
<div className="bg-green-50 border border-green-200 rounded-2xl p-8 mt-10">

  <div className="grid md:grid-cols-5 gap-4 text-center">

    <div>✅ Secure Payments</div>

    <div>✅ Verified Sellers</div>

    <div>✅ Easy Returns</div>

    <div>✅ Fast Delivery</div>

    <div>✅ 24/7 Support</div>

  </div>

</div>

        <div className="bg-green-600 text-white p-10 rounded-2xl mt-10 text-center">

          <div className="bg-white p-8 rounded-2xl shadow mt-10">

  <h2 className="text-3xl font-bold mb-4">
    Our Story
  </h2>

  <p className="text-gray-600 leading-8">
    YOMICO was created with a simple mission—to empower local businesses,
    retailers, and entrepreneurs by providing a trusted online marketplace.
    We believe every seller deserves the opportunity to grow through
    technology while offering customers quality products at competitive prices.
  </p>

</div>

          <h2 className="text-4xl font-bold mb-4">
           Start Selling on YOMICO
          </h2>

          <p className="mb-6">
           Join YOMICO and grow your business by reaching customers across India.
          </p>

          
          <Link
  href="/vendor-register"
  className="
    bg-white
    text-green-600
    px-6
    py-3
    rounded-xl
    font-bold
  "
>
  Register as Seller →
</Link>

        </div>

      </div>

    </div>

  );

}