"use client";

import {
  Truck,
  ShieldCheck,
  RotateCcw,
  BadgeCheck,
  Headphones,
} from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    title: "🚚 FREE DELIVERY",
    subtitle: "Above ₹499",
    icon: Truck,
    bg: "bg-gradient-to-r from-green-500 to-emerald-700",
  },
  {
    title: "💳 SECURE PAYMENT",
    subtitle: "100% Protected",
    icon: ShieldCheck,
    bg: "bg-gradient-to-r from-blue-500 to-indigo-700",
  },
  {
    title: "↩ EASY RETURNS",
    subtitle: "14 Day Returns",
    icon: RotateCcw,
    bg: "bg-gradient-to-r from-orange-500 to-red-600",
  },
  {
    title: "⭐ PREMIUM QUALITY",
    subtitle: "Top Brands",
    icon: BadgeCheck,
    bg: "bg-gradient-to-r from-purple-500 to-pink-600",
  },
  {
    title: "🎧 24/7 SUPPORT",
    subtitle: "Always Here",
    icon: Headphones,
    bg: "bg-gradient-to-r from-cyan-500 to-blue-700",
  },
];

export default function FeatureStrip() {
  return (
    <section className="bg-white py-12 border-b">
      <div className="text-center mb-8">

  <span className="inline-block bg-green-100 text-green-700 px-4 py-1 rounded-full text-sm font-semibold mb-3">
    ⭐ WHY SHOP WITH US
  </span>

  <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
    Shop with Confidence
  </h2>

  <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
    Enjoy secure shopping, fast delivery, hassle-free returns, and dedicated customer support with every order.
  </p>

</div>
      <motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
  viewport={{ once: true }}
  className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {features.map((item) => {
          const Icon = item.icon;
          return (
            <div
  key={item.title}
  className={`flex items-center gap-4 ${item.bg} rounded-3xl p-5 text-white shadow-lg hover:shadow-2xl hover:-translate-y-2 hover:scale-105 transition-all duration-300 cursor-pointer relative overflow-hidden`}
>

  {/* Decorative Circle */}
  <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />

  {/* Icon */}
  <div className="relative z-10 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
    <Icon size={20} className="text-white" />
  </div>

  {/* Text */}
  <div className="relative z-10">
    <h3 className="font-bold text-sm md:text-base">
      {item.title}
    </h3>

    <p className="text-white/90 text-xs md:text-sm">
      {item.subtitle}
    </p>
  </div>

</div>
          );
        })}
      </motion.div>
    </section>
  );
}
