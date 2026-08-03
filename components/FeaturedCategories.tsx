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
    <section className="max-w-7xl mx-auto px-2 py-3">
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={`/category/${encodeURIComponent(category.name)}`}
          >
            
   <div className="relative bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition duration-300 group cursor-pointer">

  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-bold text-gray-800 shadow-lg z-10">
    Popular
  </div>

  <div className="overflow-hidden rounded-t-3xl">
                <img
                  src={category.image}
                  alt={category.name}
                  onError={(e) => {
                    e.currentTarget.src = "/no-image.png";
                  }}
                  className="w-full h-24 object-cover group-hover:scale-110 group-hover:rotate-1 transition duration-500"
                />
              </div>
              <div className="p-2 text-center">
                <h3 className="font-semibold text-sm">{category.name}</h3>
               
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
