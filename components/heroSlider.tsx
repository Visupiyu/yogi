"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

const slides = [
  {
    title: "Shop Smarter. Live Better.",
subtitle:  "Groceries • Electronics • Fashion • Home Essentials from trusted local sellers.",
    offer: "🔥 LIMITED TIME OFFER",
    image: "/banners/grocery.jpg",
    button: "Shop Now",
    category: "Grocery",
  },
  {
    title: "Discover Amazing Deals",
subtitle:
  "Save more on every purchase with trusted sellers across India.",
    offer: "⚡ BEST PRICE GUARANTEE",
    image: "/banners/electronics.jpg",
    button: "Explore",
    category: "Electronics",
  },
  {
   title: "Everything You Need",
subtitle:
  "One marketplace for groceries, electronics, fashion, home and much more.",
    offer: "👗 NEW ARRIVALS",
    image: "/banners/fashion.jpg",
    button: "Shop Fashion",
    category: "Women",
  },
  {
    title: "Support Local Businesses",
subtitle:
  "Buy directly from verified sellers and help local businesses grow.",
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
    <div className="relative w-full h-[260px] sm:h-[340px] md:h-[420px] lg:h-[480px] overflow-hidden rounded-2xl mb-6">
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
      className="hidden md:flex absolute left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md hover:bg-white/40 items-center justify-center transition"
    >
      <ChevronLeft className="w-7 h-7 text-white" />
    </button>

    <button
      onClick={nextSlide}
      className="hidden md:flex absolute right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md hover:bg-white/40 items-center justify-center transition"
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

         <div
  className="
    absolute
    inset-0
    bg-gradient-to-r
    from-blue-900/85
    via-blue-700/65
    to-orange-500/40
  "
/>

           <motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
transition={{ duration: 0.7 }}
className="
absolute
left-6
top-1/2
-translate-y-1/2
z-10
max-w-lg
rounded-3xl
bg-black/20
backdrop-blur-md
border
border-white/20
p-6
md:p-8
text-white
"
>
              <span className="inline-block bg-yellow-400 text-black px-3 py-1 rounded-full text-[11px] md:text-xs font-bold mb-4 shadow-lg">
  {slide.offer}
</span>
<h1 className="
text-2xl
sm:text-3xl
md:text-4xl
lg:text-5xl
leading-tight
tracking-tight
drop-shadow-xl
">
{slide.title}
 </h1>
 <p className="
mt-4
text-xs
sm:text-sm
md:text-lg
lg:text-xl
text-gray-100
max-w-xl
leading-relaxed
drop-shadow
">
                {slide.subtitle}
              </p>

              <div
 className="
mt-5
flex
items-center
gap-3
flex-wrap
"
>

  <motion.div
    animate={{ y: [0, -6, 0] }}
    transition={{ repeat: Infinity, duration: 2 }}
  >
    <Link
      href={`/category/${encodeURIComponent(slide.category)}`}
     className="
inline-flex
items-center
justify-center
bg-gradient-to-r
from-blue-700
to-orange-500
hover:from-blue-600
hover:to-orange-400
px-4
py-2
rounded-xl
text-sm
font-semibold
shadow-xl
transition-all
duration-300
hover:scale-105
"
    >
      {slide.button}
    </Link>
  </motion.div>

  

  <Link
    href="/vendor-register"
   className="
inline-flex
items-center
justify-center
bg-white/15
backdrop-blur-md
border
border-white/40
text-white
hover:bg-white/25
px-4
py-2
rounded-xl
text-sm
font-semibold
shadow-xl
transition-all
duration-300
hover:scale-105
"
  >
    Become a Seller
  </Link>

</div>
<div
  className="
mt-6
flex
flex-wrap
gap-4
text-xs
sm:text-sm
font-medium
text-white
"
>
  <div className="flex items-center gap-2">
    🔒 <span>100% Secure Payments</span>
  </div>

  <div className="flex items-center gap-2">
    🚚 <span>Fast Delivery</span>
  </div>

  <div className="flex items-center gap-2">
    ✅ <span>Verified Sellers</span>
  </div>
</div>
 </motion.div>
    
          </div>
        );
      })}

      <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 flex gap-4 z-20">
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
