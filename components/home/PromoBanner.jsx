"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export default function PromoBanner({

  badge = "⚡ LIMITED TIME OFFER",

  title = "Electronics Mega Sale",

  subtitle =
    "Up to 70% OFF on Smartphones, Laptops, Accessories & More.",

  image = "/banners/electronics-banner.png",

  button1 = "Shop Collection",

  button2 = "View Offers",

  link1 = "/category/Electronics",

  link2 = "/offers",

}) {

  return (
    <section className="max-w-7xl mx-auto px-4 py-8">

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
px-8
py-8
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
          px-4
          py-2
          rounded-full
          text-sm
          font-bold
          shadow-lg
          "
        >
          {badge}
        </span>

        <h2
          className="
          mt-5
          text-4xl md:text-5xl xl:text-6xl
          font-extrabold
          text-white
          leading-tight
          "
        >
          {title}
        </h2>

        <p
          className="
          mt-5
          text-white/90
          text-lg
          max-w-xl
          "
        >
          {subtitle}
        </p>

        <div className="mt-8 flex flex-wrap gap-4">

          <Link
            href={link1}
            className="
            px-7
            py-3
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
            px-7
            py-3
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
      <div className="mt-8 flex flex-wrap gap-5 text-white text-sm font-medium">

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
    className="relative w-full h-[280px] lg:h-[320px]"
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