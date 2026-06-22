"use client";

import Link from "next/link";



export default function Footer(){

  return(

    <footer className="
  bg-gradient-to-br
from-slate-50
via-white
to-green-50
  border-t
  mt-*
">

      {/* TOP */}

      <div className="
        max-w-7xl
        mx-auto
        px-3
        py-3
        grid
        grid-cols-1
        md:grid-cols-2
        lg:grid-cols-5
        gap-*
      ">

        {/* BRAND */}

        <div>

          <img
            src="/logo.png"
            alt="Yogi Mart"
            className="
            h-20
md:h-24
w-auto
object-contain
            "
          />

          <p className="
            text-gray-600
            leading-7
          ">

          India's trusted multi-vendor marketplace connecting customers with quality sellers across Grocery, Fashion, Electronics, Beauty and Home Essentials.
            
          </p>

        </div>

        {/* COMPANY */}

        <div>

          <h3 className="
            text-lg
            font-bold
            mb-2          ">

            Company

          </h3>

          <ul className="
            space-y-3
           text-gray-600
hover:text-green-600
transition
          ">

            <li>
              <Link href="/about">
  About Us
</Link>
            </li>

            <li>
              <Link href="/">
                Careers
              </Link>
            </li>

            <li>
              <Link href="/">
                Press
              </Link>
            </li>

            <li>
              <Link href="/">
                Blog
              </Link>
            </li>

          </ul>

        </div>

        {/* HELP */}

        <div>

          <h3 className="
            text-lg
            font-bold
            mb-2
          ">

            Help

          </h3>

          <ul className="
            space-y-3
            text-gray-600
          ">

            <li>
              <Link href="/contact">
  Contact Us
</Link>
            </li>

            <li>
              <Link href="/">
                Returns
              </Link>
            </li>

            <li>
              <Link href="/">
                Shipping
              </Link>
            </li>

            <li>
              <Link href="/privacy-policy">
  Privacy Policy
</Link>
            </li>

            <li>
  <Link href="/terms">
    Terms & Conditions
  </Link>
</li>

          </ul>

        </div>

        {/* SELLER */}

        <div>

          <h3 className="
            text-lg
            font-bold
            mb-2
          ">

            Seller

          </h3>

          <ul className="
            space-y-3
            text-gray-600
          ">

            <li>

              <Link href="/vendor-login">

                Sell on Yogi Mart

              </Link>

            </li>

            <li>

              <Link href="/vendor-register">

                Become a Seller

              </Link>

            </li>

            <li>

              <Link href="/vendor-login">

                Seller Login

              </Link>

            </li>

          </ul>

        </div>

        {/* DOWNLOAD */}

        <div>

          <h3 className="
            text-lg
            font-bold
            mb-2
          ">

            Download App

          </h3>

          <div className="
            flex
            flex-col
            gap-3
          ">

            <button className="
              bg-black
              text-white
              py-3
              rounded-xl
              font-semibold
            ">

              Coming Soon

            </button>

            <button className="
              bg-black
              text-white
              py-3
              rounded-xl
              font-semibold
            ">

            Coming Soon

            </button>

          </div>

        </div>

      </div>

      <div className="
  border-t
  border-b
  py-4
  px-4
">

  <div className="
    max-w-7xl
    mx-auto
    grid
    grid-cols-2
    md:grid-cols-4
    gap-4
    text-center
  ">

    <div>🚚 Fast Delivery</div>

    <div>🔒 Secure Payments</div>

    <div>↩ Easy Returns</div>

    <div>✅ Trusted Sellers</div>

  </div>

</div>

<div className="
  flex
  justify-center
  gap-4
  py-4
">

  <span className="text-2xl cursor-pointer">📘</span>
  <span className="text-2xl cursor-pointer">📷</span>
  <span className="text-2xl cursor-pointer">▶️</span>
  <span className="text-2xl cursor-pointer">🐦</span>

</div>

      {/* BOTTOM */}

      <div className="
        border-t
        py-2
        text-center
        text-gray-500
        text-sm
      ">

       © 2026 Yogi Mart • Made in India 🇮🇳 • All Rights Reserved

      </div>    
    </footer>

  );

}