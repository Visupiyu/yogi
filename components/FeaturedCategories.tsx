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
    <section className="max-w-7xl mx-auto px-2 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl md:text-3xl font-bold">Featured Categories</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={`/category/${encodeURIComponent(category.name)}`}
          >
            <div className="bg-white rounded-3xl overflow-hidden shadow-md hover:shadow-xl transition duration-300 group cursor-pointer">
              <div className="overflow-hidden">
                <img
                  src={category.image}
                  alt={category.name}
                  onError={(e) => {
                    e.currentTarget.src = "/no-image.png";
                  }}
                  className="w-full h-40 object-cover group-hover:scale-110 transition duration-500"
                />
              </div>
              <div className="p-4 text-center">
                <h3 className="font-bold text-lg">{category.name}</h3>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
