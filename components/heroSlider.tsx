"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

// Simplified single-slide marketplace hero (replaces the previous 4-slide
// carousel). Kept as the "HeroSlider" export/filename so app/page.tsx needs
// no structural change — arrows/dots were removed since there is only one
// slide to navigate between.
// Below sm (phones) the text and the illustration are kept apart: the SVG's
// artwork sits at roughly x 1050-1400 of its 1600-wide canvas, so the image
// is anchored at 73% horizontally to place it wholly in the right ~40% of
// the box, and the text is limited to the left 58%. Every sm+ class is the
// original, so tablet and desktop are unchanged.
export default function HeroSlider() {
  return (
    <div className="relative w-full h-[230px] sm:h-[300px] md:h-[380px] lg:h-[420px] overflow-hidden rounded-2xl bg-slate-50">
      <Image
        src="/yomico-hero-marketplace.svg"
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1152px"
        className="object-cover object-[73%_50%] sm:object-center"
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="absolute inset-0 z-10 flex max-w-[58%] flex-col justify-center gap-2 px-4 sm:max-w-none sm:gap-3 sm:px-10 md:max-w-lg"
      >
        <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-3xl md:text-4xl">
          Shop Smart. Shop Local. Shop YOMICO.
        </h1>
        <p className="text-xs text-slate-600 sm:text-base md:text-lg">
          Discover products from YOMICO sellers.
        </p>
        {/* Products, not the stores directory (/store). */}
        <Link
          href="/search"
          className="mt-2 inline-flex w-fit items-center justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-teal-700 sm:px-6 sm:py-3 sm:text-base"
        >
          Shop Now
        </Link>
      </motion.div>
    </div>
  );
}
