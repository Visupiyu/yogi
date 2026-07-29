"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Truck,
  ShieldCheck,
  RotateCcw,
  BadgeCheck,
 } from "lucide-react";
import {
  FaFacebook,
  FaInstagram,
  FaYoutube,
  FaXTwitter,
} from "react-icons/fa6";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-slate-50 via-white to-green-50 border-t mt-10">
      {/* TOP */}
      <div className="max-w-7xl mx-auto px-4 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
        {/* BRAND */}
        <div>
          <h2 className="text-3xl font-extrabold text-green-700 mb-2 tracking-wide">YOMICO</h2>
          <Image
  src="/logo.png"
  alt="YOMICO Logo"
  width={180}
  height={180}
  className="h-36 md:h-40 w-auto object-contain"
/>
          <p className="text-gray-600 leading-7">
  <span className="font-bold text-green-700">YOMICO</span> is India's
  modern multi-vendor marketplace connecting customers with trusted
  sellers for groceries, fashion, electronics, beauty, home essentials
  and much more.
</p>
        </div>

        {/* COMPANY */}
        <div>
          <h3 className="text-lg font-bold mb-3">Company</h3>
          <ul className="space-y-3 text-gray-600">
            <li><Link href="/about" className="hover:text-green-600 transition">About Us</Link></li>
            </ul>
        </div>

        {/* HELP */}
        <div>
          <h3 className="text-lg font-bold mb-3">Help</h3>
          <ul className="space-y-3 text-gray-600">
            <li><Link href="/contact" className="hover:text-green-600 transition">Contact Us</Link></li>
            <li>
  <Link href="/returns-refunds" className="hover:text-green-600 transition">
    Returns & Refunds
  </Link>
</li>

<li>
  <Link href="/shipping-policy" className="hover:text-green-600 transition">
    Shipping Policy
  </Link>
</li>
            <li><Link href="/privacy-policy" className="hover:text-green-600 transition">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-green-600 transition">Terms &amp; Conditions</Link></li>
          </ul>
        </div>

        {/* SELLER */}
        <div>
          <h3 className="text-lg font-bold mb-3">Seller</h3>
          <ul className="space-y-3 text-gray-600">
            <li><Link href="/vendor-login" className="hover:text-green-600 transition">Sell on YOMICO</Link></li>
            <li><Link href="/vendor-register" className="hover:text-green-600 transition">Become a Seller</Link></li>
            <li><Link href="/vendor-login" className="hover:text-green-600 transition">Seller Login</Link></li>
          </ul>
        </div>

        {/* DOWNLOAD */}
        <div>
          <h3 className="text-lg font-bold mb-3">Download App</h3>
          <div className="flex flex-col gap-3">
            <button className="bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition">
  Google Play
  <div className="text-xs opacity-80">
    Coming Soon
  </div>
  </button>

   <button className="bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition">
         
 App Store
  <div className="text-xs opacity-80">
    Coming Soon
  </div>
</button>
          </div>
        </div>
      </div>

      {/* TRUST ROW */}
      <div className="border-t border-b py-4 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-gray-700">
          <div className="flex items-center justify-center gap-2">
  <Truck size={18} className="text-green-600" />
  Fast Delivery
</div>

<div className="flex items-center justify-center gap-2">
  <ShieldCheck size={18} className="text-green-600" />
  Secure Payments
</div>

<div className="flex items-center justify-center gap-2">
  <RotateCcw size={18} className="text-green-600" />
  Easy Returns
</div>

<div className="flex items-center justify-center gap-2">
  <BadgeCheck size={18} className="text-green-600" />
  Trusted Sellers
</div>
        </div>
      </div>

      {/* SOCIAL */}
 <div className="flex justify-center gap-6 py-4">
  <Link href="#">
    <FaFacebook className="text-2xl hover:text-blue-600 transition" />
  </Link>

  <Link href="#">
    <FaInstagram className="text-2xl hover:text-pink-600 transition" />
  </Link>

  <Link href="#">
    <FaYoutube className="text-2xl hover:text-red-600 transition" />
  </Link>

  <Link href="#">
    <FaXTwitter className="text-2xl hover:text-black transition" />
  </Link>
</div>

      {/* BOTTOM */}
      <div className="border-t py-4 text-center text-gray-500 text-sm">
      © 2026 YOMICO. All Rights Reserved.

Designed & Developed with ❤️ in India 🇮🇳
      </div>
    </footer>
  );
}
