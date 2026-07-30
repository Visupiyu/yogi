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
    <section className="py-6 px-2">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="max-w-7xl mx-auto"
      >
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white p-6 md:p-8 shadow-xl">

  <div className="absolute inset-0 opacity-10">
    <div className="w-full h-full bg-[radial-gradient(circle_at_top_right,white_2px,transparent_2px)] bg-[length:30px_30px]" />
  </div>

  <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="absolute top-3 right-3 bg-yellow-400 text-black px-2 py-1 rounded-full text-xs font-bold shadow-lg rotate-6">
  SAVE 70%
</div>
            {/* LEFT */}
            <div className="text-center lg:text-left">
              <span className="inline-block bg-white text-red-600 px-4 py-1 rounded-full text-sm font-bold shadow-lg mb-4">
  🔥 BIGGEST SALE OF THE SEASON
</span>
             <h2 className="text-3xl sm:text-4xl md:text-6xl font-extrabold leading-tight">
                ⚡ Flash Sale
                <br />
                MEGA SALE
              </h2>
              <p className="mt-4 text-lg text-white/95 max-w-md">
                Grab your favourite products before the offer ends.
              </p>
              <div className="mt-3 text-sm sm:text-base">

                <Link
  href="/search"
  className={`inline-flex items-center justify-center bg-white text-red-600 hover:bg-gray-100 ${primaryButton}`}
>
  Shop Now →
</Link>
                <Link
  href="/search"
  className="bg-transparent border-2 border-white px-8 py-4 rounded-2xl font-bold hover:bg-white hover:text-red-600 transition"
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
                  className="bg-white/15 backdrop-blur-md rounded-2xl p-2 min-w-[70px] sm:min-w-[100px] h-[80px] sm:h-[110px] flex flex-col justify-center text-center border border-white/20"
                >
                  <h3 className="text-2xl sm:text-4xl font-bold">
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
