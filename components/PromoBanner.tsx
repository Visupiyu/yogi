"use client";

import Link from "next/link";
import { ArrowRight, Gift } from "lucide-react";

export default function PromoBanner() {
  return (
    <section className="py-8 px-4">
      <div className="max-w-7xl mx-auto">

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 shadow-2xl">

          {/* Decorative circles */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-white/10" />

          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 p-8 md:p-12">

            {/* Left */}
            <div>

              <span className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-white font-semibold mb-4">
                <Gift size={18} />
                GRAND OPENING OFFER
              </span>

              <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
                Up to 70% OFF
              </h2>

              <p className="mt-4 text-white/90 text-lg max-w-xl">
                Shop Fashion, Electronics, Grocery, Beauty,
                Furniture and thousands of products at amazing prices.
              </p>

            </div>

            {/* Right */}
            <Link
              href="/offers"
              className="inline-flex items-center gap-2 bg-white text-red-600 px-8 py-4 rounded-2xl font-bold hover:scale-105 transition-all duration-300 shadow-lg"
            >
              Shop Now
              <ArrowRight size={20} />
            </Link>

          </div>

        </div>

      </div>
    </section>
  );
}