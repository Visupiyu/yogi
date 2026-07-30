"use client";

import { Mail, Smartphone } from "lucide-react";

export default function NewsletterCTA() {
  return (
    <section className="py-3 md:py-6 px-1">
      <div className="max-w-4xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-blue-600 rounded-3xl overflow-hidden shadow-2xl">

         <div className="grid lg:grid-cols-2 gap-1 md:gap-1 items-center p-2 md:p-4">

            {/* LEFT */}
            <div>

              <span className="inline-block bg-white/20 text-white px-4 py-1 rounded-full text-sm font-semibold mb-3">
                📱 YOMICO APP
              </span>

              <h2 className="text-2xl md:text-4xl font-bold text-white leading-tight">
                Shop Smarter with YOMICO
              </h2>

              <p className="text-white/90 mt-3 text-base md:text-lg">
                Get exclusive offers, faster checkout, order tracking,
                and exciting deals directly from the YOMICO app.
              </p>

             <div className="flex flex-col sm:flex-row gap-1 mt-3">

                <button className="w-full sm:w-auto bg-black text-white px-3 py-1 rounded-2xl transition">
                  <div className="text-xs opacity-80">
                    Coming Soon
                  </div>

                  <div className="font-bold">
                    Google Play
                  </div>
                </button>

               <button className="w-full sm:w-auto bg-black text-white px-3 py-1 rounded-2xl transition">
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

            <div className="bg-white rounded-3xl p-2 md:p-4 shadow-xl">

              <div className="flex flex-col sm:flex-row gap-1 mt-3">

                <Mail className="text-green-600" size={24} />

                <h3 className="text-2xl font-bold">
                  Subscribe
                </h3>

              </div>

              <p className="text-gray-600 mb-3">
                Subscribe to receive exclusive offers, new arrivals and
                special discounts.
              </p>

              <input
                type="email"
                placeholder="Enter your email"
                className="w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
              />

             <button className="mt-5 w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white py-3 sm:py-4 rounded-2xl text-sm sm:text-lg font-semibold shadow-xl transition-all hover:scale-[1.02]">
                Subscribe
              </button>

              <div className="flex items-center justify-center gap-1 mt-3 text-gray-500 text-sm">

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