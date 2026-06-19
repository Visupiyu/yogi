"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { motion } from "framer-motion";

export default function HeroSlider(){

 const slides = [ 

   {
  title:"Fresh Grocery Deals",
  subtitle:"Daily Essentials Delivered Fast",
  image:"https://images.unsplash.com/photo-1610348725531-843dff563e2c?q=80&w=1600&auto=format&fit=crop",
  button:"Order Grocery",
  link:"/category/Grocery"
},

  {
  title:"Men's Fashion Collection",
  subtitle:"Upgrade Your Style • Up To 70% OFF",
  image:"https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1600&auto=format&fit=crop",
  button:"Shop Men's Fashion",
  link:"/category/Men Fashion"
},
{
  title:"Women's Fashion Sale",
  subtitle:"Trending Styles For Every Occasion",
  image:"https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1600&auto=format&fit=crop",
  button:"Explore Women's Fashion",
  link:"/category/Women Fashion"
},
{
  title:"Latest Electronics",
  subtitle:"Mobiles • Laptops • Smart Watches",
  image:"https://images.unsplash.com/photo-1498049794561-7780e7231661?q=80&w=1600&auto=format&fit=crop",
  button:"Shop Electronics",
  link:"/category/Electronics"
},

];
console.log("Slides:", slides.length);

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
       h-[220px] md:h-[420px]
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

         <motion.img

  animate={{
    scale:[1,1.05,1]
  }}

  transition={{
    repeat:Infinity,
    duration:8
  }}

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
    bg-black/40
  "
/>

<motion.div
  initial={{
    opacity: 0,
    scale: 0.95,
  }}
  animate={{
    opacity: 1,
    scale: 1,
  }}
  transition={{
    duration: 0.7,
  }}
  className="absolute inset-0 flex flex-col justify-center px-10 md:px-20 text-white max-w-xl z-10"
>  <h1
    className="
      text-2xl
      md:text-4xl
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

              <p className="absolute top-2 right-2 z-50 bg-black text-white p-2">
  Slide {current + 1}
</p>

              <motion.div

  animate={{
    y:[0,-6,0]
  }}

  transition={{
    repeat:Infinity,
    duration:2
  }}
>
           <Link
  href={slide.link}
                className={`
  relative
  overflow-hidden
  bg-gradient-to-r
  from-green-600
  to-blue-600
  hover:from-green-500
  hover:to-blue-500
  px-8
  py-4
  rounded-2xl
  text-lg
  font-semibold
  inline-block
  shadow-xl
  hover:shadow-2xl
  transition-all
  duration-300
  hover:scale-105
`}
>
               {slide.button}

                </Link>

              </motion.div>

            </motion.div>

        </div>

       

      ))}

      <div
        className="
          absolute
          bottom-5
          left-1/2
          -translate-x-1/2
          flex
          gap-4
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
