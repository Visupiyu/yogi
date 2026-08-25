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
    // Matches RETURN_WINDOW_DAYS in lib/returnEligibility.ts, which
    // /api/request-return enforces. This read "14 Day Returns" while the
    // server refused any request past day 7.
    subtitle: "7 Day Returns",
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
    <section className="bg-white py-3 border-b">
      
      <motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
  viewport={{ once: true }}
  className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
        {features.map((item) => {
          const Icon = item.icon;
          return (
            <div
  key={item.title}
  className={`flex items-center gap-4 ${item.bg} rounded-xl p-3 text-white shadow-lg hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden`}
>

  {/* Decorative Circle */}
  <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />

  {/* Icon */}
  <div className="relative z-10 w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
    <Icon size={16} className="text-white" />
  </div>

  {/* Text */}
  <div className="relative z-10">
    <h3 className="font-semibold text-xs">
      {item.title}
    </h3>

    <p className="text-white/90 text-[11px]">
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
