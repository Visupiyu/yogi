"use client";

import { useEffect,useState }
from "react";

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
      py-14
      px-4
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <div className="
          rounded-3xl
          overflow-hidden
          bg-gradient-to-r
          from-red-500
          to-orange-500
          text-white
          p-10
          shadow-xl
        ">

          <div className="
            flex
            flex-col
            lg:flex-row
            items-center
            justify-between
            gap-10
          ">

            {/* LEFT */}

            <div>

              <p className="
                uppercase
                tracking-widest
                text-sm
                mb-3
              ">
                Limited Time Offer
              </p>

              <h2 className="
                text-4xl
                md:text-5xl
                font-extrabold
                leading-tight
              ">
                Flash Sale
                <br />
                Up To 70% OFF
              </h2>

              <p className="
                mt-4
                text-lg
                text-white/90
              ">
                Grab your favorite products
                before the offer ends.
              </p>

              <button className="
                mt-6
                bg-white
                text-red-500
                px-6
                py-3
                rounded-full
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
              gap-5
            ">

              <div className="
                bg-white/20
                backdrop-blur-md
                rounded-2xl
                p-5
                min-w-[90px]
                text-center
              ">

                <h3 className="
                  text-4xl
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
                p-5
                min-w-[90px]
                text-center
              ">

                <h3 className="
                  text-4xl
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
                p-5
                min-w-[90px]
                text-center
              ">

                <h3 className="
                  text-4xl
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

        </div>

      </div>

    </section>

  );

}