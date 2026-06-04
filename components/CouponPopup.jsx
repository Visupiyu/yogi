"use client";

import { useEffect, useState } from "react";

export default function CouponPopup() {

  const [show, setShow] =
    useState(false);

    const couponCode =
  "YOGI10";

  useEffect(() => {

  const alreadyShown =
    localStorage.getItem(
      "couponShown"
    );

let timer;
    if (!alreadyShown) {

    timer = setTimeout(() => {

      setShow(true);

    }, 2000);

  }

  return () => {

    if (timer) {

      clearTimeout(timer);

    }

  };

}, []);

  const closePopup = () => {

   localStorage.setItem(
  "couponShown",
  new Date().toDateString()
);

    setShow(false);

  };

  const copyCoupon = async () => {

   await navigator.clipboard.writeText(
   couponCode
);

    alert(
      `Coupon copied: ${couponCode}`
    );

    localStorage.setItem(
      "couponShown",
       new Date().toDateString()
    );

    setShow(false);

  };

  if (!show) return null;

  return (

    <div className="
      fixed
      inset-0
      bg-black/60
      z-[9999]
      flex
      items-center
      justify-center
      p-4
    ">

      <div className="
        bg-white
        rounded-3xl
        shadow-2xl
        max-w-md
        w-full
        p-8
        text-center
        relative
      ">

        <button
          onClick={closePopup}
          className="
            absolute
            top-4
            right-4
            text-gray-500
            text-2xl
          "
        >
          ×
        </button>

        <div className="
          text-6xl
          mb-4
        ">
          🎉
        </div>

        <h2 className="
          text-3xl
          font-bold
          mb-3
        ">
          Welcome to Yogi-Mart
        </h2>

        <p className="
          text-gray-600
          mb-6
        ">
          Use this coupon and
          save on your first order.
        </p>

        <div className="
          bg-green-100
          border-2
          border-dashed
          border-green-500
          rounded-2xl
          p-4
          mb-6
        ">

          <p className="
            text-sm
            text-gray-500
          ">
            Coupon Code
          </p>

          <h3 className="
            text-3xl
            font-bold
            text-green-600
          ">
            {couponCode}
          </h3>

          <p className="
            text-sm
            mt-2
          ">
           Get 10% OFF
            </p>
          <p className="
  text-xs
  text-gray-500
  mt-1
">
  Valid on first order only
</p>

        </div>

        <button
          onClick={copyCoupon}
          className="
            w-full
            bg-green-600
            hover:bg-green-700
            text-white
            py-4
            rounded-2xl
            font-bold
            text-lg
            transition
          "
        >
          Copy Coupon
        </button>

      </div>

    </div>

  );

}