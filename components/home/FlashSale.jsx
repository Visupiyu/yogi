"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function FlashSale() {
  const [targetTime] = useState(
    new Date().getTime() + 1000 * 60 * 60 * 24
  );

  const calculateTimeLeft = () => {
    const now = new Date().getTime();
    const difference = Math.max(0, targetTime - now);
    return {
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const units = [
  { label: "Hours", value: timeLeft.hours },
  { label: "Minutes", value: timeLeft.minutes },
  { label: "Seconds", value: timeLeft.seconds },
];

const primaryButton =
  "inline-flex items-center justify-center px-5 py-2 sm:px-8 sm:py-4 rounded-2xl text-sm sm:text-lg font-semibold shadow-xl transition-all hover:scale-105";

return (
    <section className="py-3 px-2">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="max-w-7xl mx-auto"
      >
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white p-4 md:p-5 shadow-xl">

  <div className="absolute inset-0 opacity-10">
    <div className="w-full h-full bg-[radial-gradient(circle_at_top_right,white_2px,transparent_2px)] bg-[length:30px_30px]" />
  </div>

  <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="absolute top-3 right-3 bg-yellow-400 text-black px-3 py-1 text-xs mb-2 rounded-full text-xs font-bold shadow-lg rotate-6">
  BIGGEST SALE OF THE SEASON
</div>
            {/* LEFT */}
            <div className="text-center lg:text-left">
              <span className="inline-block bg-white text-red-600 px-4 py-1 rounded-full text-sm font-bold shadow-lg mb-4">
  🔥 BIGGEST SALE OF THE SEASON
</span>
             <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight">
                ⚡ Flash Sale
                <br />
                MEGA SALE
              </h2>
              <p className="mt-4 text-lg text-white/95 max-w-md">
               Limited-time deals. Shop now.
              </p>
              <div className="mt-4 inline-flex items-center bg-white/20 px-4 py-2 rounded-full backdrop-blur-md text-sm font-semibold">
⏳ Hurry! Deals end soon.
</div>
              <div className="mt-5 flex flex-wrap gap-4 items-center">

                <Link
  href="/search"
  className="
inline-flex
items-center
justify-center
bg-white
text-red-600
hover:bg-gray-100
px-6
py-3
rounded-2xl
font-semibold
shadow-lg
transition-all
hover:scale-105"
>
  Shop Now →
</Link>
                <Link
  href="/search"
  className="
inline-flex
items-center
justify-center
border-2
border-white
px-6
py-3
rounded-2xl
font-semibold
hover:bg-white
hover:text-red-600
transition-all
"
>
  View All Deals
</Link>
                <p className="hidden sm:block mt-4 text-sm font-semibold text-white">
  🚚 Free Shipping • Secure Payment • Easy Returns
</p>
            </div>
             </div>


            {/* TIMER */}
            <div className="flex gap-3">
              {units.map((u) => (
                <div
                  key={u.label}
                  className="bg-white/15 backdrop-blur-md rounded-2xl p-2 min-w-[50px] sm:min-w-[90px] h-[60px] sm:h-[95px] flex flex-col justify-center text-center border border-white/20"
                >
                  <h3 className="text-xl sm:text-3xl font-bold">
                    {String(u.value).padStart(2, "0")}
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm">{u.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
