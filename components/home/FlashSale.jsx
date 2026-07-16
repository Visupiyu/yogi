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

  return (
    <section className="py-6 px-2">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="max-w-7xl mx-auto"
      >
        <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white p-6 md:p-8 shadow-xl">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* LEFT */}
            <div className="text-center lg:text-left">
              <p className="uppercase tracking-widest text-sm mb-2">
                🔥 Limited Time Offer
              </p>
              <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
                ⚡ Flash Sale
                <br />
                Up To 70% OFF
              </h2>
              <p className="mt-3 text-base text-white/90">
                Grab your favourite products before the offer ends.
              </p>
              <Link href="/search">
                <button className="mt-5 bg-white text-red-500 px-8 py-3 rounded-xl font-bold hover:scale-105 transition">
                  Shop Now
                </button>
              </Link>
            </div>

            {/* TIMER */}
            <div className="flex gap-3">
              {units.map((u) => (
                <div
                  key={u.label}
                  className="bg-white/20 backdrop-blur-md rounded-2xl p-2 min-w-[90px] h-[100px] flex flex-col justify-center text-center border border-white/20"
                >
                  <h3 className="text-3xl font-bold">
                    {String(u.value).padStart(2, "0")}
                  </h3>
                  <p className="mt-2 text-sm">{u.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
