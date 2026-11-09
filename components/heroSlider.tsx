"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export default function HeroSlider() {
  return (
    <div className="relative w-full aspect-[2/1] min-h-[220px] max-h-[420px] overflow-hidden rounded-2xl bg-[#fff8e9]">
      <Image
        src="/gujarati-new-year-2083.png"
        alt="Nutan Varshabhinandan! Sal Mubarak 2083"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1152px"
        className="object-contain"
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="absolute inset-0 z-10 pointer-events-none"
      >
        <Link
          href="/store"
          aria-label="Shop Now"
          className="absolute left-[56%] top-[68%] h-[15%] w-[19%] pointer-events-auto rounded-full"
        />
      </motion.div>
    </div>
  );
}