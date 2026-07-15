"use client";

import Link from "next/link";

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
    <section className="py-8 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold">Shop by Category</h2>
        </div>

        <div className="flex flex-nowrap overflow-x-auto w-full gap-4 pb-2 scrollbar-hide">
          {categories.map((category) => (
            <Link
              key={category.name}
              href={`/category/${encodeURIComponent(category.name)}`}
              className="flex-shrink-0 block"
            >
              <div className="group relative min-w-[150px] md:min-w-[190px] h-32 md:h-40 rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition duration-300">
                <img
                  src={category.image}
                  alt={category.name}
                  onError={(e) => {
                    e.currentTarget.src = "/no-image.png";
                  }}
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <h3 className="absolute bottom-3 left-3 right-3 text-white font-bold text-base md:text-lg drop-shadow">
                  {category.name}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
