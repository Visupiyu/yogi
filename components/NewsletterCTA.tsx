"use client";

import { Mail, Smartphone } from "lucide-react";

export default function NewsletterCTA() {
  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-blue-600 rounded-3xl overflow-hidden shadow-2xl">

          <div className="grid lg:grid-cols-2 gap-10 items-center p-8 md:p-12">

            {/* LEFT */}
            <div>

              <span className="inline-block bg-white/20 text-white px-4 py-1 rounded-full text-sm font-semibold mb-4">
                📱 YOMICO APP
              </span>

              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                Shop Smarter with YOMICO
              </h2>

              <p className="text-white/90 mt-4 text-lg">
                Get exclusive offers, faster checkout, order tracking,
                and exciting deals directly from the YOMICO app.
              </p>

              <div className="flex flex-wrap gap-4 mt-8">

                <button className="bg-black hover:bg-gray-900 text-white px-6 py-4 rounded-2xl transition">
                  <div className="text-xs opacity-80">
                    Coming Soon
                  </div>

                  <div className="font-bold">
                    Google Play
                  </div>
                </button>

                <button className="bg-black hover:bg-gray-900 text-white px-6 py-4 rounded-2xl transition">
                  <div className="text-xs opacity-80">
                    Coming Soon
                  </div>

                  <div className="font-bold">
                    App Store
                  </div>
                </button>

              </div>

            </div>

            {/* RIGHT */}

            <div className="bg-white rounded-3xl p-8 shadow-xl">

              <div className="flex items-center gap-3 mb-5">

                <Mail className="text-green-600" size={30} />

                <h3 className="text-2xl font-bold">
                  Subscribe
                </h3>

              </div>

              <p className="text-gray-600 mb-6">
                Subscribe to receive exclusive offers, new arrivals and
                special discounts.
              </p>

              <input
                type="email"
                placeholder="Enter your email"
                className="w-full border rounded-xl px-5 py-4 outline-none focus:ring-2 focus:ring-green-500"
              />

              <button className="mt-5 w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold transition">
                Subscribe
              </button>

              <div className="flex items-center justify-center gap-2 mt-6 text-gray-500 text-sm">

                <Smartphone size={18} />

                Download the app for a better shopping experience

              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}