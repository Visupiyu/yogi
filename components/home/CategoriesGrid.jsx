"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// Names must match the exact category strings stored on products,
// so the /category/[name] pages resolve correctly.
const categories = [
  {
    name: "Men Fashion",
    image:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200",
  },
  {
    name: "Women Fashion",
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1200",
  },
  {
    name: "Electronics",
    image:
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=1200",
  },
  {
    name: "Mobiles",
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1200",
  },
  {
    name: "Beauty",
    image:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200",
  },
  {
    name: "Grocery",
    image:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200",
  },
  {
    name: "Appliances",
    image:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=1200",
  },
  {
    name: "Furniture",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200",
  },
];

export default function CategoriesGrid() {
  return (
    <section className="py-8 md:py-12 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6 md:mb-10">

  <span className="inline-block bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-semibold mb-3">
    🛍️ SHOP BY CATEGORY
  </span>

  <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
    Explore Our Categories
  </h2>

  <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
    Discover thousands of products across every category—from fashion and electronics to groceries and home essentials.
  </p>

</div>

       <motion.div
  initial={{ opacity: 0, y: 30 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
  viewport={{ once: true }}
  className="flex flex-nowrap overflow-x-auto w-full gap-5 pb-3 scrollbar-hide"
>
          {categories.map((category) => (
            <Link
              key={category.name}
              href={`/category/${encodeURIComponent(category.name)}`}
              className="flex-shrink-0 block"
            >
              <div className="group relative min-w-[170px] md:min-w-[220px] h-40 md:h-52 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-2 transition duration-300">
                <img
                  src={category.image}
                  alt={category.name}
                  onError={(e) => {
                    e.currentTarget.src = "/no-image.png";
                  }}
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <h3 className="absolute bottom-3 left-3 right-3 text-white font-bold text-lg md:text-xl drop-shadow">
                  {category.name}
                </h3>
              </div>
              <p className="absolute bottom-2 left-3 text-white/90 text-sm font-medium">
  Explore →
</p>
            </Link>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
