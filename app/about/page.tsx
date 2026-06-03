 import Link from "next/link";

export default function AboutPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-6xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-6">
          About Yogi-Mart
        </h1>

        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-12">
          Yogi-Mart is a modern multi-vendor marketplace connecting
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

          <h2 className="text-3xl font-bold mb-6">
            Why Shop With Us?
          </h2>

          <div className="grid md:grid-cols-3 gap-6">

            <div>
              <h3 className="font-bold text-xl mb-2">
                Secure Shopping
              </h3>

              <p className="text-gray-600">
                Safe payments and reliable order processing.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-xl mb-2">
                Trusted Sellers
              </h3>

              <p className="text-gray-600">
                Products from verified vendors.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-xl mb-2">
                Fast Delivery
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
    core of Yogi-Mart.
  </p>

</div>

        <div className="bg-green-600 text-white p-10 rounded-2xl mt-10 text-center">

          <h2 className="text-4xl font-bold mb-4">
            Become a Seller
          </h2>

          <p className="mb-6">
            Join Yogi-Mart and start growing your business today.
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
  Register as Seller
</Link>

        </div>

      </div>

    </div>

  );

}