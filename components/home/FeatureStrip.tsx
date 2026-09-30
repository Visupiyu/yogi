"use client";

import {
  Truck,
  ShieldCheck,
  RotateCcw,
  Headphones,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { FREE_SHIPPING_THRESHOLD, getShippingSettings } from "@/lib/shipping";

// Every item here describes a real feature. "⭐ PREMIUM QUALITY / Top Brands"
// was removed (nothing in the catalogue defines or checks brands), and
// "24/7 SUPPORT / Always Here" became the support-ticket page that exists
// (app/support), with no promise about hours. The free-delivery threshold is
// read from settings/global (lib/shipping), not hard-coded, and the payment
// line makes no absolute "100%" claim.
const buildFeatures = (freeShippingThreshold: number) => [
  {
    title: "🚚 FREE DELIVERY",
    subtitle: `Above ₹${freeShippingThreshold.toLocaleString("en-IN")}`,
    icon: Truck,
    bg: "bg-gradient-to-r from-green-500 to-emerald-700",
  },
  {
    title: "💳 SECURE PAYMENT",
    subtitle: "Secure checkout",
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
    title: "🎧 HELP & SUPPORT",
    subtitle: "Raise a support ticket",
    icon: Headphones,
    bg: "bg-gradient-to-r from-cyan-500 to-blue-700",
  },
];

// Mobile: one compact, left-aligned horizontal scroller (the stacked
// full-width cards pushed the hero a whole screen down). md and up: the
// original grid.
export default function FeatureStrip() {
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(FREE_SHIPPING_THRESHOLD);
  useEffect(() => {
    getShippingSettings().then((s) => setFreeShippingThreshold(s.freeShippingThreshold));
  }, []);
  const features = buildFeatures(freeShippingThreshold);

  return (
    <section className="bg-white py-3 border-b">

      <motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
  viewport={{ once: true }}
  className="max-w-7xl mx-auto px-4 flex gap-2 overflow-x-auto scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible">
        {features.map((item) => {
          const Icon = item.icon;
          return (
            <div
  key={item.title}
  className={`flex shrink-0 min-w-[165px] md:min-w-0 items-center gap-3 md:gap-4 ${item.bg} rounded-xl p-2.5 md:p-3 text-white shadow-lg hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden`}
>

  {/* Decorative Circle */}
  <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />

  {/* Icon */}
  <div className="relative z-10 w-8 h-8 md:w-9 md:h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
    <Icon size={16} className="text-white" />
  </div>

  {/* Text */}
  <div className="relative z-10">
    <h3 className="font-semibold text-xs whitespace-nowrap">
      {item.title}
    </h3>

    <p className="text-white/90 text-[11px] whitespace-nowrap">
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
