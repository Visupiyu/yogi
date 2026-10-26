"use client";

import Link from "next/link";
import Image from "next/image";

// Simplified single-slide marketplace hero (replaces the previous 4-slide
// carousel). Kept as the "HeroSlider" export/filename so app/page.tsx needs
// no structural change — arrows/dots were removed since there is only one
// slide to navigate between.
export default function HeroSlider() {
  return (
    <div className="relative flex min-h-[240px] w-full items-center overflow-hidden rounded-2xl bg-[#F4FBFA] sm:min-h-[300px] md:h-[340px] lg:h-[380px]">
      {/* The illustration sits in the right of the artwork; on narrow screens
          the crop is shifted so the bag stays at the right edge instead of
          sliding under the headline. */}
      <Image
        src="/yomico-hero-marketplace.svg"
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1280px"
        className="object-cover object-[68%_50%] md:object-center"
      />

      {/* Readability scrim behind the text on small screens only, where the
          text column and the illustration can overlap. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[#F4FBFA] via-[#F4FBFA]/85 to-transparent md:hidden"
      />

      {/* No entrance animation: the headline is the first thing on the page
          and should paint immediately, not wait for hydration to fade in. */}
      <div
        className="relative z-10 flex max-w-[68%] flex-col items-start gap-3 px-5 py-8 sm:max-w-[60%] sm:px-10 md:max-w-xl md:gap-4 lg:px-14"
      >
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 text-balance sm:text-4xl lg:text-5xl">
          <span className="block">Shop Smart. Shop Local.</span>
          <span className="block text-teal-700">Shop YOMICO.</span>
        </h1>
        <p className="text-sm leading-relaxed text-slate-700 sm:text-base md:text-lg">
          Discover products from trusted sellers on YOMICO.
        </p>
        {/* /search with no query lists every visible product — the general
            "browse everything" destination (Featured Products "View All"
            and the bottom nav use it too). /store lists sellers instead. */}
        <Link
          href="/search"
          className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:px-8 sm:py-3 sm:text-base"
        >
          Shop Now
        </Link>
      </div>
    </div>
  );
}
