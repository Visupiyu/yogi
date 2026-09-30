"use client";

import Link from "next/link";

// Only points backed by a real feature: Razorpay-secured payments (no
// absolute "100%" claim), the
// 7-day return window (RETURN_WINDOW_DAYS in lib/returnEligibility.ts) and
// the customer support ticket page (app/support). "Fast Delivery",
// "Verified Sellers" and "24/7 Support" were removed — nothing in the app
// guarantees or defines them.
const TRUST_POINTS = [
  { icon: "🔒", label: "Secure Payments" },
  { icon: "↩", label: "7-Day Returns" },
  { icon: "🎧", label: "Help & Support" },
];

// Below sm the block is tightened (padding, badge, heading and spacing); every
// sm+ class is the original, so tablet and desktop are unchanged.
export default function LaunchTrustBanner() {
  return (
    <section className="max-w-7xl mx-auto px-2 pb-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-500 via-white to-green-600 shadow-2xl">
        <div className="bg-black/0 px-5 py-5 sm:px-10 sm:py-10">
          <span className="inline-block rounded-full bg-black/80 px-3 py-1 text-xs font-bold text-white shadow-lg sm:px-4 sm:py-2 sm:text-sm">
            🚀 YOMICO Launch Offer
          </span>

          <h2 className="mt-3 max-w-2xl text-2xl font-extrabold leading-tight text-gray-900 sm:mt-5 sm:text-3xl md:text-4xl">
            Shop With Confidence on YOMICO
          </h2>

          <p className="mt-2 max-w-xl text-sm text-gray-800 sm:mt-4 sm:text-base md:text-lg">
            Sellers pay 0% commission during our launch — bringing more
            sellers and more choices to YOMICO.
          </p>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-gray-900 sm:mt-6 sm:gap-y-3">
            {TRUST_POINTS.map((point) => (
              <span key={point.label} className="flex items-center gap-2">
                <span>{point.icon}</span>
                {point.label}
              </span>
            ))}
          </div>

          {/* Products, not the stores directory (/store). */}
          <Link
            href="/search"
            className="mt-4 inline-block rounded-2xl bg-gray-900 px-5 py-2.5 font-bold text-white transition hover:scale-105 sm:mt-8 sm:px-7 sm:py-3"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    </section>
  );
}
