"use client";

import Link from "next/link";

const categories = [
  { name: "Men Fashion", image: "/man-fashion.jpg" },
  { name: "Women Fashion", image: "/woman-fashion.jpg" },
  { name: "Electronics", image: "/Electronics.jpg" },
  { name: "Grocery", image: "/Grocery.jpg" },
  { name: "Kids Fashion", image: "/Kids-fashion.jpg" },
  { name: "Beauty", image: "/beauty.jpg" },
];

export default function FeaturedCategories() {
  return (
    <section className="max-w-7xl mx-auto px-2 py-6">
      <div className="text-center mb-10">

  <span className="inline-block bg-green-100 text-green-700 px-4 py-1 rounded-full text-sm font-semibold mb-3">
    SHOP BY CATEGORY
  </span>

  <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
    Explore Top Categories
  </h2>
</div>


      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={`/category/${encodeURIComponent(category.name)}`}
          >
            
   <div className="relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition duration-300 group cursor-pointer">

  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-gray-800 shadow-lg z-10">
    Popular
  </div>

  <div className="overflow-hidden rounded-t-3xl">
                <img
                  src={category.image}
                  alt={category.name}
                  onError={(e) => {
                    e.currentTarget.src = "/no-image.png";
                  }}
                  className="w-full h-36 object-cover group-hover:scale-110 group-hover:rotate-1 transition duration-500"
                />
              </div>
              <div className="p-4 text-center">
                <h3 className="font-bold text-base">{category.name}</h3>
                <p className="text-green-600 font-semibold mt-2">
  Explore →
</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
