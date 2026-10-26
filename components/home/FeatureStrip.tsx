"use client";

import {
  Truck,
  ShieldCheck,
  RotateCcw,
  BadgeCheck,
  Headphones,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { FREE_SHIPPING_THRESHOLD, getShippingSettings } from "@/lib/shipping";

// Each line here must match what the code actually does — see the comment on
// each entry for where it is enforced.
const buildFeatures = (freeShippingThreshold: number) => [
  {
    // The configured threshold (settings/global, the same cached read
    // TopStrip, cart and checkout use) — never a hard-coded amount.
    title: "🚚 FREE DELIVERY",
    subtitle: `Above ₹${freeShippingThreshold}`,
    icon: Truck,
    bg: "bg-gradient-to-r from-green-500 to-emerald-700",
  },
  {
    // Online payments run through Razorpay's checkout; YOMICO never handles
    // card details. No "100%" guarantee is implied.
    title: "💳 SECURE PAYMENT",
    subtitle: "Online payments by Razorpay",
    icon: ShieldCheck,
    bg: "bg-gradient-to-r from-blue-500 to-indigo-700",
  },
  {
    title: "↩ EASY RETURNS",
    // The return window is set per product (lib/returnEligibility.ts:
    // product returnDays, snapshotted on the order line; platform default
    // DEFAULT_RETURN_DAYS) and shown on each product page — so no single
    // number is promised here.
    subtitle: "Window shown per product",
    icon: RotateCcw,
    bg: "bg-gradient-to-r from-orange-500 to-red-600",
  },
  {
    // Only admin-Approved vendors may list (enforced server-side in
    // app/api/seller/create-product). There is no brand verification, so
    // this no longer claims "Premium Quality / Top Brands".
    title: "✅ VERIFIED SELLERS",
    subtitle: "Approved by YOMICO",
    icon: BadgeCheck,
    bg: "bg-gradient-to-r from-purple-500 to-pink-600",
  },
  {
    // Real availability (lib/siteConfig.ts) — no 24/7 staffed support exists.
    title: "🎧 HELP & SUPPORT",
    subtitle: "Replies in 24–48 business hrs",
    icon: Headphones,
    bg: "bg-gradient-to-r from-cyan-500 to-blue-700",
  },
];

export default function FeatureStrip() {
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    FREE_SHIPPING_THRESHOLD
  );

  useEffect(() => {
    getShippingSettings().then((settings) =>
      setFreeShippingThreshold(settings.freeShippingThreshold)
    );
  }, []);

  const features = buildFeatures(freeShippingThreshold);

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
