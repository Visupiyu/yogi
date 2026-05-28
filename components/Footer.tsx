"use client";

import Link from "next/link";

export default function Footer(){

  return(

    <footer className="
      bg-white
      border-t
      mt-16
    ">

      {/* TOP */}

      <div className="
        max-w-7xl
        mx-auto
        px-6
        py-6
        grid
        grid-cols-1
        md:grid-cols-2
        lg:grid-cols-5
        gap-2
      ">

        {/* BRAND */}

        <div>

          <img
            src="/logo.png"
            alt="Yogi Mart"
            className="
              h-20
              mb-6
            "
          />

          <p className="
            text-gray-600
            leading-7
          ">

            Modern ecommerce marketplace
            
          </p>

        </div>

        {/* COMPANY */}

        <div>

          <h3 className="
            text-lg
            font-bold
            mb-4
          ">

            Company

          </h3>

          <ul className="
            space-y-3
            text-gray-600
          ">

            <li>
              <Link href="/">
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
            mb-4
          ">

            Help

          </h3>

          <ul className="
            space-y-3
            text-gray-600
          ">

            <li>
              <Link href="/">
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
              <Link href="/">
                Privacy Policy
              </Link>
            </li>

          </ul>

        </div>

        {/* SELLER */}

        <div>

          <h3 className="
            text-lg
            font-bold
            mb-5
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
            mb-4
          ">

            Download App

          </h3>

          <div className="
            flex
            flex-col
            gap-2
          ">

            <button className="
              bg-black
              text-white
              py-3
              rounded-xl
              font-semibold
            ">

              Google Play

            </button>

            <button className="
              bg-black
              text-white
              py-3
              rounded-xl
              font-semibold
            ">

              App Store

            </button>

          </div>

        </div>

      </div>

      {/* BOTTOM */}

      <div className="
        border-t
        py-5
        text-center
        text-gray-500
        text-sm
      ">

        © 2026 Yogi Mart.
        All Rights Reserved.

      </div>

    </footer>

  );

}