"use client";

import Link from "next/link";

const TRUST_POINTS = [
  { icon: "🔒", label: "100% Secure Payments" },
  { icon: "🚚", label: "Fast Delivery" },
  { icon: "✅", label: "Verified Sellers" },
  { icon: "🎧", label: "24/7 Support" },
];

export default function LaunchTrustBanner() {
  return (
    <section className="max-w-7xl mx-auto px-2 pb-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-500 via-white to-green-600 shadow-2xl">
        <div className="bg-black/0 px-6 py-8 sm:px-10 sm:py-10">
          <span className="inline-block rounded-full bg-black/80 px-4 py-2 text-sm font-bold text-white shadow-lg">
            🇮🇳 Independence Day Launch
          </span>

          <h2 className="mt-5 max-w-2xl text-3xl font-extrabold leading-tight text-gray-900 md:text-4xl">
            Shop With Confidence This Independence Day
          </h2>

          <p className="mt-4 max-w-xl text-base text-gray-800 md:text-lg">
            Sellers pay 0% commission during our launch — bringing more
            sellers and more choices to YOMICO.
          </p>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-gray-900">
            {TRUST_POINTS.map((point) => (
              <span key={point.label} className="flex items-center gap-2">
                <span>{point.icon}</span>
                {point.label}
              </span>
            ))}
          </div>

          <Link
            href="/store"
            className="mt-8 inline-block rounded-2xl bg-gray-900 px-7 py-3 font-bold text-white transition hover:scale-105"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    </section>
  );
}
