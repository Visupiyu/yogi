"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

export default function PromoBanner({

  // Generic wording only: there is no sale start/end or promotion logic
  // behind this banner, so it must not promise a % off or a time limit.
  badge = "⚡ ELECTRONICS",

  // No electronics discount data exists either, so no "deals" wording.
  title = "Shop Electronics",

  subtitle =
    "Browse electronics from sellers on YOMICO.",

  image = "/banners/electronics-banner.png",

  button1 = "Shop Collection",

  button2 = "Browse Stores",

  link1 = "/category/Electronics",

  // No dedicated offers/deals page exists anywhere in the app — /offers
  // 404'd — so the second button is labelled for what /store actually is:
  // the directory of approved seller stores.
  link2 = "/store",

}) {

  // prefers-reduced-motion: the image stays still. framer-motion drives this
  // animation from JavaScript, so a CSS motion-reduce: class cannot stop it;
  // its own hook reads the same media query. Unchanged for everyone else.
  const reduceMotion = useReducedMotion();

  return (
    <section className="max-w-7xl mx-auto px-2 py-4">

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
md:grid-cols-2
md:gap-6
items-center
px-5
py-6
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
          px-3
          py-1.5
          sm:px-4
          sm:py-2
          rounded-full
          text-xs
          sm:text-sm
          font-bold
          shadow-lg
          "
        >
          {badge}
        </span>

        <h2
          className="
          mt-4
          sm:mt-5
          text-3xl sm:text-4xl lg:text-5xl
          font-extrabold
          text-balance
          text-white
          leading-tight
          "
        >
          {title}
        </h2>

        <p
          className="
          mt-3
          sm:mt-4
          text-white/90
          text-base
          sm:text-lg
          max-w-xl
          "
        >
          {subtitle}
        </p>

        <div className="mt-6 sm:mt-8 flex flex-wrap gap-3 sm:gap-4">

          <Link
            href={link1}
            className="
            inline-flex
            min-h-11
            items-center
            px-5
            sm:px-7
            py-2.5
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
            inline-flex
            min-h-11
            items-center
            px-5
            sm:px-7
            py-2.5
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
</div>

      {/* RIGHT */}

<div className="relative mt-6 md:mt-0 flex justify-center items-center">

  {/* Glow */}

  <div
    className="
    absolute
    w-48
    h-48
    sm:w-72
    sm:h-72
    rounded-full
    bg-white/20
    blur-3xl
    "
  />

  <motion.div
    animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
    transition={reduceMotion ? undefined : {
      repeat: Infinity,
      duration: 3,
    }}
    className="relative w-full h-[170px] sm:h-[220px] md:h-[260px] lg:h-[300px]"
  >

    <Image
      src={image}
      alt={title}
      fill
      sizes="(max-width:768px) 100vw, 50vw"
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