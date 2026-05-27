"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function HeroSlider(){

  const slides = [

    {
      title:"Fresh Grocery Delivered",
      subtitle:"Daily essentials at best prices",
      image:
        "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1600&auto=format&fit=crop",
      button:"Shop Grocery"
    },

    {
      title:"Latest Fashion Collection",
      subtitle:"Trending styles for everyone",
      image:
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1600&auto=format&fit=crop",
      button:"Explore Fashion"
    },

    {
      title:"Beauty & Electronics",
      subtitle:"Everything you need in one marketplace",
      image:
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1600&auto=format&fit=crop",
      button:"Shop Now"
    }

  ];

  const [current,setCurrent] =
    useState(0);

  useEffect(()=>{

    const interval = setInterval(()=>{

      setCurrent((prev)=>
        prev === slides.length - 1
          ? 0
          : prev + 1
      );

    },4000);

    return ()=> clearInterval(interval);

  },[]);

  return(

    <div
      className="
        relative
        w-full
       h-[260px] md:h-[420px]
        overflow-hidden
        rounded-2xl
        mb-06
      "
    >

      {slides.map((slide,index)=>(

        <div

          key={index}

          className={`

            absolute
            inset-0
            transition-all
            duration-700

            ${current === index

              ? "opacity-100 scale-100"

              : "opacity-0 scale-105"

            }

          `}

        >

          <img
            src={slide.image}
            alt={slide.title}
            className="
              w-full
              h-full
              object-cover
            "
          />

          <div
            className="
              absolute
              inset-0
              bg-black/50
              flex
              items-center
            "
          >

            <div className="px-10 md:px-20 text-white max-w-2xl">

              <h1
                className="
                  text-3xl
                  md:text-5xl
                  font-bold
                  mb-6
                "
              >
                {slide.title}
              </h1>

              <p
                className="
                  text-base md:text-lg
                  mb-8
                  text-gray-200
                "
              >
                {slide.subtitle}
              </p>

              <Link
                href="/"
                className="
                  bg-green-600
                  hover:bg-green-700
                  px-6
                  py-3
                  rounded-2xl
                  text-lg
                  font-semibold
                  inline-block
                "
              >
                {slide.button}
              </Link>

            </div>

          </div>

        </div>

      ))}

      <div
        className="
          absolute
          bottom-5
          left-1/2
          -translate-x-1/2
          flex
          gap-3
        "
      >

        {slides.map((_,index)=>(

          <button

            key={index}

            onClick={()=>setCurrent(index)}

            className={`
              w-3
              h-3
              rounded-full

              ${current === index

                ? "bg-white"

                : "bg-white/50"

              }
            `}

          />

        ))}

      </div>

    </div>

  );

}
