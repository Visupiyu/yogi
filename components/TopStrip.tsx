"use client";

import Link from "next/link";

import {

  MapPin,

  Truck,

  Headphones,

  Smartphone

} from "lucide-react";

export default function TopStrip(){

  return(

    <div className="
      bg-green-600
      text-white
      text-sm
    ">

      <div className="
        max-w-7xl
        mx-auto
        px-4
        py-2
        flex
        items-center
        justify-between
        gap-4
        overflow-x-auto
        whitespace-nowrap
      ">

        {/* LEFT */}

        <div className="
          flex
          items-center
          gap-6
        ">

          <div className="
            flex
            items-center
            gap-2
          ">

            <Truck size={16} />

            <span>
              Free Delivery Above ₹499
            </span>

          </div>

          <div className="
            flex
            items-center
            gap-2
          ">

            <Headphones size={16} />

            <span>
              24/7 Support
            </span>

          </div>

        </div>

        {/* RIGHT */}

        <div className="
          flex
          items-center
          gap-6
        ">

          <Link
            href="/track-order"
            className="
              flex
              items-center
              gap-2
              hover:text-yellow-200
              transition
            "
          >

            <MapPin size={16} />

            Track Order

          </Link>

          <Link
            href="/download-app"
            className="
              flex
              items-center
              gap-2
              hover:text-yellow-200
              transition
            "
          >

            <Smartphone size={16} />

            Download App

          </Link>

        </div>

      </div>

    </div>

  );

}