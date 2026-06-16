"use client";

import {
  useEffect,
  useState
} from "react";

import { motion }
from "framer-motion";

export default function FlashSale(){

  const calculateTimeLeft = ()=>{

    const target =
      new Date().getTime() +
      1000 * 60 * 60 * 24;

    const now =
      new Date().getTime();

    const difference =
      target - now;

    return {

      hours:
        Math.floor(
          (difference /
          (1000 * 60 * 60)) % 24
        ),

      minutes:
        Math.floor(
          (difference / 1000 / 60) % 60
        ),

      seconds:
        Math.floor(
          (difference / 1000) % 60
        ),

    };

  };

  const [timeLeft,setTimeLeft] =
    useState(calculateTimeLeft());

  useEffect(()=>{

    const timer =
      setInterval(()=>{

        setTimeLeft(
          calculateTimeLeft()
        );

      },1000);

    return ()=>clearInterval(timer);

  },[]);

  return(

    <section className="
      py-*
      px-2
    ">

     <motion.div

  initial={{
    opacity:0,
    y:50
  }}

  whileInView={{
    opacity:1,
    y:0
  }}

  transition={{
    duration:0.6
  }}

  viewport={{
    once:true
  }}

  className="
    max-w-7xl
    mx-auto
  "
>

        <div className="
          rounded-2xl
          overflow-hidden
          bg-gradient-to-r
          from-red-500
          to-orange-500
          text-white
          p-5 md:p-6
          shadow-xl
        ">

          <div className="
            flex
            flex-col
            lg:flex-row
            items-center
            justify-between
            gap-3
          ">

      

            {/* LEFT */}

          

              <p className="
                uppercase
                tracking-widest
                text-sm
                mb-*
              ">
                Limited Time Offer
              </p>

              <h2 className="
                text-2xl
                md:text-2xl
                font-extrabold
                leading-tight
              ">
                Flash Sale
                <br />
                Up To 70% OFF
              </h2>

              <p className="
                mt-*
                text-base
                text-white/90
              ">
                Grab your favorite products
                before the offer ends.
              </p>

              <button className="
                mt-*
                bg-white
                text-red-500
                px-*
                py-*
                rounded-x1
                font-bold
                hover:scale-105
                transition
              ">
                Shop Now
              </button>

            </div>

            {/* TIMER */}

            <div className="
              flex
              gap-3
            ">

              <div className="
                bg-white/20
                backdrop-blur-md
                rounded-2xl
                p-2                min-w-[90px]
                text-center
              ">

                <h3 className="
                  text-3xl
                  font-bold
                ">
                  {timeLeft.hours}
                </h3>

                <p className="mt-2">
                  Hours
                </p>

              </div>

              <div className="
                bg-white/20
                backdrop-blur-md
                rounded-2xl
                p-2
                min-w-[90px]
                text-center
              ">

                <h3 className="
                  text-3xl
                  font-bold
                ">
                  {timeLeft.minutes}
                </h3>

                <p className="mt-2">
                  Minutes
                </p>

              </div>

              <div className="
                bg-white/20
                backdrop-blur-md
                rounded-2xl
                p-2
                min-w-[75px]
                text-center
              ">

                <h3 className="
                  text-2xl
                  font-bold
                ">
                  {timeLeft.seconds}
                </h3>

                <p className="mt-2">
                  Seconds
                </p>

              </div>

              </div>

          </div>

        </motion.div>

    </section>

  );

}