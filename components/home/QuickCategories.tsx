"use client";

import Link from "next/link";

// "Home" and "Sports" were never real categories in the catalog — those
// tiles always led to a permanently empty page. Replaced with real
// top-level categories (Mobiles, Books) that actually have products.
const categories = [
  { name: "Grocery", icon: "🥦" },
  { name: "Electronics", icon: "📱" },
  { name: "Fashion", icon: "👗" },
  { name: "Beauty", icon: "💄" },
  { name: "Furniture", icon: "🪑" },
  { name: "Mobiles", icon: "📱" },
  { name: "Kids Fashion", icon: "🧸" },
  { name: "Books", icon: "📚" },
];

export default function QuickCategories() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">

      <div className="flex items-center justify-between mb-6">

        <h2 className="text-2xl font-bold">
          Shop by Category
        </h2>

        <Link
          href="/store"
          className="text-blue-600 font-semibold hover:text-orange-500 transition"
        >
          View All →
        </Link>

      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-5">

        {categories.map((category) => (

          <Link
            key={category.name}
            href={`/category/${encodeURIComponent(category.name)}`}
            className="
              bg-white
              rounded-3xl
              border
              border-gray-100
              shadow-md
              hover:shadow-xl
              hover:-translate-y-2
              transition-all
              duration-300
              p-5
              flex
              flex-col
              items-center
              justify-center
              text-center
            "
          >

            <div className="text-5xl mb-4">
              {category.icon}
            </div>

            <p className="font-semibold text-gray-700">
              {category.name}
            </p>

          </Link>

        ))}

      </div>

    </section>
  );
}