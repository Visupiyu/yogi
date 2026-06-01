"use client";

import Link from "next/link";

const stores = [

  {
    id: "store1",
    name: "Fresh Grocery Store",
    description:
      "Daily grocery and household essentials."
  },

  {
    id: "store2",
    name: "Fashion Hub",
    description:
      "Latest fashion trends for men and women."
  },

  {
    id: "store3",
    name: "Electro World",
    description:
      "Electronics, gadgets and accessories."
  }

];

export default function StoresPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-7xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-4">
          All Stores
        </h1>

        <p className="text-center text-gray-600 mb-12">
          Explore stores and discover products from trusted vendors.
        </p>

        <div className="
          grid
          grid-cols-1
          md:grid-cols-2
          lg:grid-cols-3
          gap-8
        ">

          {stores.map((store)=>(

            <div
              key={store.id}
              className="
                bg-white
                p-8
                rounded-2xl
                shadow
                hover:shadow-xl
                transition
              "
            >

              <h2 className="
                text-2xl
                font-bold
                mb-3
              ">
                {store.name}
              </h2>

              <p className="
                text-gray-600
                mb-6
              ">
                {store.description}
              </p>

              <Link
                href={`/store/${store.id}`}
                className="
                  inline-block
                  bg-green-600
                  hover:bg-green-700
                  text-white
                  px-5
                  py-3
                  rounded-xl
                  font-semibold
                "
              >
                Visit Store
              </Link>

            </div>

          ))}

        </div>

      </div>

    </div>

  );

}