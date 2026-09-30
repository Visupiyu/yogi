"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export default function PromoBanner({

  // Neutral defaults: there is no time-limited sale, no "mega sale" and no
  // verified "up to 70% off" behind this banner (the largest discounts come
  // from MRPs still awaiting data review), so it just points at the category.
  badge = "⚡ ELECTRONICS",

  title = "Shop Electronics",

  subtitle =
    "Browse electronics from sellers on YOMICO.",

  // Neutral artwork: the previous /banners/electronics-banner.png (kept, not
  // deleted) has "UP TO 70% OFF", "FREE SHIPPING" and "1 YEAR WARRANTY"
  // printed into the image, none of which YOMICO offers.
  image = "/banners/electronics-neutral.svg",

  button1 = "Shop Collection",

  button2 = "View Offers",

  link1 = "/category/Electronics",

  // No dedicated offers/deals page exists anywhere in the app — /offers
  // 404'd. /store is the same general "browse everything" destination
  // already used for "View All" elsewhere on the homepage.
  // The real 40%+ discount filter (same as the Best Deals block) — /store is
  // the stores directory, not offers.
  link2 = "/search?minDiscount=40",

}) {

  // Below sm the banner is compacted: smaller badge, title and spacing, the
  // two buttons side by side instead of stacked, the empty spacer hidden and a
  // 110px image (the artwork is kept, just smaller). Every sm+ class is the
  // original, so tablet and desktop are unchanged.
  return (
    <section className="max-w-7xl mx-auto px-2 py-4 sm:px-4 sm:py-8">

  <div
    className="
    relative
    overflow-hidden
    rounded-3xl
    bg-gradient-to-r
    from-blue-900
    via-blue-700
    to-orange-500
    shadow-2xl
    "
  >

    {/* Background Pattern */}

    <div className="absolute inset-0 opacity-10">

      <div className="w-full h-full bg-[radial-gradient(circle_at_top_right,white_2px,transparent_2px)] bg-[length:28px_28px]" />

    </div>

    <div
      
 className="
relative
grid
grid-cols-1
lg:grid-cols-2
items-center
px-5
py-4
sm:px-8
sm:py-8
lg:px-12
lg:py-10
"
>

      {/* LEFT */}
<div className="max-w-xl">
      <div>

        <span
          className="
          inline-block
          bg-yellow-400
          text-black
          px-3 sm:px-4
          py-1 sm:py-2
          rounded-full
          text-xs sm:text-sm
          font-bold
          shadow-lg
          "
        >
          {badge}
        </span>

        <h2
          className="
          mt-2 sm:mt-5
          text-2xl sm:text-4xl md:text-5xl xl:text-6xl
          font-extrabold
          text-white
          leading-tight
          "
        >
          {title}
        </h2>

        <p
          className="
          mt-1 sm:mt-5
          text-white/90
          text-sm sm:text-lg
          max-w-xl
          "
        >
          {subtitle}
        </p>

        <div className="mt-4 sm:mt-8 flex flex-wrap gap-2 sm:gap-4">

          <Link
            href={link1}
            className="
            px-4 sm:px-7
            py-2.5 sm:py-3
            text-sm sm:text-base
            rounded-2xl
            bg-white
            text-blue-700
            font-bold
            hover:scale-105
            transition
            "
          >
            {button1}
          </Link>

          <Link
            href={link2}
            className="
            px-4 sm:px-7
            py-2.5 sm:py-3
            text-sm sm:text-base
            rounded-2xl
            border-2
            border-white
            text-white
            font-bold
            hover:bg-white
            hover:text-blue-700
            transition
            "
          >
            {button2}
          </Link>

        </div>

      </div>
      <div className="hidden sm:flex mt-8 flex-wrap gap-5 text-white text-sm font-medium">

  </div>
</div>

      {/* RIGHT */}

<div className="relative flex justify-center items-center">

  {/* Glow */}

  <div
    className="
    absolute
    w-72
    h-72
    rounded-full
    bg-white/20
    blur-3xl
    "
  />

  <motion.div
    animate={{ y: [0, -10, 0] }}
    transition={{
      repeat: Infinity,
      duration: 3,
    }}
    className="relative w-full h-[110px] mt-3 sm:mt-0 sm:h-[280px] lg:h-[320px]"
  >

    <Image
      src={image}
      alt={title}
      fill
      sizes="(max-width:1024px) 100vw, 50vw"
      className="object-contain object-center"
      priority
    />

  </motion.div>

</div>

    </div>

  </div>

</section>

  );
}