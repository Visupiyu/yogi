"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Truck, Headphones, Smartphone } from "lucide-react";
import { FREE_SHIPPING_THRESHOLD, getShippingSettings } from "@/lib/shipping";

export default function TopStrip() {
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    FREE_SHIPPING_THRESHOLD
  );

  useEffect(() => {
    getShippingSettings().then((settings) =>
      setFreeShippingThreshold(settings.freeShippingThreshold)
    );
  }, []);

  return (
    <div className="hidden md:block bg-gradient-to-r from-green-600 via-green-700 to-emerald-700 text-white text-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 overflow-x-auto whitespace-nowrap">

        {/* LEFT */}
        <div className="flex items-center gap-6">

          <div className="flex items-center gap-2 font-medium">
            <Truck size={18} />
            <span>🚚 Free Delivery on Orders Above ₹{freeShippingThreshold}</span>
          </div>
{/* Divider */}
  <div className="hidden lg:block h-5 w-px bg-white/30" />
          <Link
            href="/support"
            className="flex items-center gap-2 hover:text-yellow-200 hover:scale-105 transition-all duration-300"
          >
            <Headphones size={16} />
            <span>24/7 Support</span>
          </Link>

        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-6">

          <Link
            href="/track-order"
            className="flex items-center gap-2 hover:text-yellow-200 transition"
          >
            <MapPin size={16} />
            Track Order
          </Link>

          <Link
            href="/"
            className="flex items-center gap-2 hover:text-yellow-200 transition"
          >
            <Smartphone size={16} />
            Get Our App
          </Link>

        </div>

      </div>
    </div>
  );
}