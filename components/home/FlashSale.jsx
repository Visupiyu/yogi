"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// The countdown that used to live here was removed, not rebuilt.
//
// It computed `Date.now() + 24h` inside a useEffect on every mount, so it
// restarted at ~23:59:59 on every page load and every refresh — it could
// never reach zero, and there was no sale window behind it to count down to.
// No flashSale / saleEndsAt / salePrice field exists on any product, so
// nothing anywhere defined an end time. A timer implies a deadline; there
// isn't one, so the honest fix is to show no timer rather than a fake one.
//
// What IS real: every product carries mrp > sellingPrice, and
// app/search/page.jsx already filters on that via its minimumDiscount
// control. Both CTAs now point at that filter, so "deals" links to actual
// discounted products instead of the unfiltered catalogue.
//
// Deliberately NOT done here: no sale data model, no price changes. Building
// a genuine countdown needs sale start/end timestamps, an admin UI to set
// them and server-side enforcement so the price actually changes at expiry —
// a feature, not a correction.

// Keep this in step with the seeded filter in app/search/page.jsx. 40% is
// used because it is the deepest band the catalogue currently fills well.
const DEALS_HREF = "/search?minDiscount=40";

export default function FlashSale() {
return (
    <section className="py-3 px-2">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="max-w-7xl mx-auto"
      >
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white p-4 md:p-5 shadow-xl">

  <div className="absolute inset-0 opacity-10">
    <div className="w-full h-full bg-[radial-gradient(circle_at_top_right,white_2px,transparent_2px)] bg-[length:30px_30px]" />
  </div>

  <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* LEFT */}
            <div className="text-center lg:text-left">
              {/* One badge. This copy was rendered twice — once here and once
                  as a rotated badge in the corner — inside the same card. */}
              <span className="inline-block bg-white text-red-600 px-4 py-1 rounded-full text-sm font-bold shadow-lg mb-4">
  🔥 BIGGEST DISCOUNTS ON YOMICO
</span>
             <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight">
                🏷️ Best Deals
              </h2>
              {/* Describes what the links actually show — products discounted
                  40% or more off MRP — with no claim of a time limit. */}
              <p className="mt-4 text-lg text-white/95 max-w-md">
               Save 40% or more off MRP across the store.
              </p>
              <div className="mt-5 flex flex-wrap gap-4 items-center">

                <Link
  href={DEALS_HREF}
  className="
inline-flex
items-center
justify-center
bg-white
text-red-600
hover:bg-gray-100
px-6
py-3
rounded-2xl
font-semibold
shadow-lg
transition-all
hover:scale-105"
>
  Shop Deals →
</Link>
                <Link
  href={DEALS_HREF}
  className="
inline-flex
items-center
justify-center
border-2
border-white
px-6
py-3
rounded-2xl
font-semibold
hover:bg-white
hover:text-red-600
transition-all
"
>
  View All Deals
</Link>
                <p className="hidden sm:block mt-4 text-sm font-semibold text-white">
  🚚 Free Shipping • Secure Payment • Easy Returns
</p>
            </div>
             </div>


          </div>
        </div>
      </motion.div>
    </section>
  );
}
