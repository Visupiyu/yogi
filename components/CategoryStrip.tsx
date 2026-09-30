"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Baby,
  Laptop,
  ShoppingBag,
  ShoppingBasket,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

// `name` is shown to the user; `categoryName` is the real catalog node
// name used to resolve products (Men/Women are sub-categories of Fashion
// in the catalog, not their own top-level category — "Men Fashion" and
// "Women Fashion" don't exist as real category names, so linking to them
// directly always shows zero products).
//
// Icons are bundled lucide-react components. They replaced ten images
// hot-linked from a third-party icon CDN, so the strip no longer depends on
// an external host being reachable.
const categories: { name: string; categoryName: string; Icon: LucideIcon; bg: string; fg: string }[] = [
  { name: "Grocery", categoryName: "Grocery", Icon: ShoppingBasket, bg: "bg-green-100", fg: "text-green-700" },
  { name: "Men Fashion", categoryName: "Men", Icon: Shirt, bg: "bg-blue-100", fg: "text-blue-700" },
  { name: "Women Fashion", categoryName: "Women", Icon: ShoppingBag, bg: "bg-pink-100", fg: "text-pink-700" },
  { name: "Kids Fashion", categoryName: "Kids Fashion", Icon: Baby, bg: "bg-orange-100", fg: "text-orange-700" },
  { name: "Beauty", categoryName: "Beauty", Icon: Sparkles, bg: "bg-purple-100", fg: "text-purple-700" },
  { name: "Electronics", categoryName: "Electronics", Icon: Laptop, bg: "bg-cyan-100", fg: "text-cyan-700" },
  { name: "Furniture", categoryName: "Furniture", Icon: Sofa, bg: "bg-yellow-100", fg: "text-yellow-700" },
  { name: "Mobiles", categoryName: "Mobiles", Icon: Smartphone, bg: "bg-red-100", fg: "text-red-700" },
  { name: "Appliances", categoryName: "Appliances", Icon: WashingMachine, bg: "bg-gray-100", fg: "text-gray-700" },
  { name: "Books", categoryName: "Books", Icon: BookOpen, bg: "bg-indigo-100", fg: "text-indigo-700" },
];

// Left-aligned on mobile: a centred row wider than the screen can't be
// scrolled back to its first items (the overflow spills off the left edge).
// Centred from md up, where all ten fit.
export default function CategoryStrip() {
  return (
    <section className="bg-gradient-to-r from-green-50 via-white to-blue-50 border-b border-gray-200">
      <div className="flex items-center justify-start md:justify-center gap-4 px-4 py-4 overflow-x-auto scrollbar-hide">
        {categories.map((cat) => (
          <motion.div
            key={cat.name}
            whileHover={{ y: -4, scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
          >
            <Link
              href={`/category/${encodeURIComponent(cat.categoryName)}`}
              className="flex flex-col items-center min-w-[55px] shrink-0 group"
            >
              <div
                className={`w-10 h-10 md:w-12 md:h-12 rounded-full ${cat.bg} flex items-center justify-center shadow-sm group-hover:shadow-lg transition overflow-hidden`}
              >
                <cat.Icon
                  aria-hidden="true"
                  strokeWidth={2}
                  className={`w-5 h-5 md:w-7 md:h-7 ${cat.fg}`}
                />
              </div>
              <p className="mt-1 text-xs font-semibold text-gray-700 group-hover:text-green-600 transition text-center">
                {cat.name}
              </p>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
