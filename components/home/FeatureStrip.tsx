"use client";

import {
  Truck,
  ShieldCheck,
  RotateCcw,
  BadgeCheck,
  Headphones,
} from "lucide-react";

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
    <section className="bg-white py-6 border-b">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {features.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className={`flex items-center gap-4 ${item.bg} rounded-3xl p-5 text-white shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer relative overflow-hidden`}
            >
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Icon size={20} className="text-white" />
              </div>
              <div>
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
      </div>
    </section>
  );
}
