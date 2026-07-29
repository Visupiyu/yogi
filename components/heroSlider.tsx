"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

const slides = [
  {
    title: "Mega Grocery Sale",
    subtitle: "Up to 70% OFF on Daily Essentials",
    offer: "🔥 LIMITED TIME OFFER",
    image: "/banners/grocery.jpg",
    button: "Shop Now",
    category: "Grocery",
  },
  {
    title: "Latest Electronics",
    subtitle: "Mobiles • Laptops • Smart Gadgets",
    offer: "⚡ BEST PRICE GUARANTEE",
    image: "/banners/electronics.jpg",
    button: "Explore",
    category: "Electronics",
  },
  {
    title: "Fashion Festival",
    subtitle: "Men • Women • Kids Collection",
    offer: "👗 NEW ARRIVALS",
    image: "/banners/fashion.jpg",
    button: "Shop Fashion",
    category: "Women Fashion",
  },
  {
    title: "YOMICO Shopping Days",
    subtitle: "Thousands of Deals Every Day",
    offer: "🎉 FREE SHIPPING ABOVE ₹499",
    image: "/banners/mega-sale.jpg",
    button: "View Deals",
    category: "Mobiles",
  },
];

export default function HeroSlider() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
    }, 4000);
    return () => clearInterval(interval);
  }, []);
  const previousSlide = () => {
  setCurrent((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
};

const nextSlide = () => {
  setCurrent((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
};

  return (
    <div className="relative w-full h-[220px] md:h-[420px] overflow-hidden rounded-2xl mb-6">
      {slides.map((slide, index) => {
        const active = current === index;
        return (
          <div
            key={index}
            className={`absolute inset-0 transition-all duration-700 ${
              active
                ? "opacity-100 scale-100 z-10 pointer-events-auto"
                : "opacity-0 scale-105 z-0 pointer-events-none"
            }`}
          >
             <button
      onClick={previousSlide}
      className="hidden md:flex absolute left-5 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/20 backdrop-blur-md hover:bg-white/40 items-center justify-center transition"
    >
      <ChevronLeft className="w-7 h-7 text-white" />
    </button>

    <button
      onClick={nextSlide}
      className="hidden md:flex absolute right-5 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/20 backdrop-blur-md hover:bg-white/40 items-center justify-center transition"
    >
      <ChevronRight className="w-7 h-7 text-white" />
    </button>

            <motion.img
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 8 }}
              src={slide.image}
              alt={slide.title}
              className="w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7 }}
              className="absolute inset-0 flex flex-col justify-center px-10 md:px-20 text-white max-w-xl z-10"
            >
              <span className="inline-block bg-yellow-400 text-black px-4 py-1 rounded-full text-xs md:text-sm font-bold mb-4 shadow-lg">
  {slide.offer}
</span>
              <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">
                {slide.title}
              </h1>
              <span className="inline-block bg-yellow-400 text-black px-4 py-1 rounded-full text-sm font-bold mb-4">
  {slide.offer}
</span>

              <p className="text-lg md:text-xl text-gray-100 mb-8 max-w-lg">
                {slide.subtitle}
              </p>

              <div className="flex flex-wrap gap-4">

  <motion.div
    animate={{ y: [0, -6, 0] }}
    transition={{ repeat: Infinity, duration: 2 }}
  >
    <Link
      href={`/category/${encodeURIComponent(slide.category)}`}
      className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 px-8 py-4 rounded-2xl text-lg font-semibold shadow-xl hover:shadow-2xl transition"
    >
      {slide.button}
    </Link>
  </motion.div>

  

  <Link
    href="/vendor-register"
    className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 rounded-2xl text-lg font-semibold shadow-xl transition"
  >
    Become a Seller
  </Link>

</div>
            </motion.div>
    
          </div>
        );
      })}

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-4 z-20">
     {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrent(index)}
           className={`transition-all duration-300 rounded-full ${
  current === index
    ? "w-10 h-3 bg-white"
    : "w-3 h-3 bg-white/50"
}`}
          />
        ))}
      </div>
    </div>
  );
}
