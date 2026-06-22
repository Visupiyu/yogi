"use client";

import {

  Truck,

  ShieldCheck,

  RotateCcw,

  BadgeCheck,

  Headphones

} from "lucide-react";

const features = [

  {
    title:"🚚 FREE DELIVERY",
    subtitle:"Above ₹499",
    icon:Truck,
    bg:"bg-gradient-to-r from-green-500 to-emerald-700",
    iconColor:"text-white"
  },

  {
    title:"💳 SECURE PAYMENT",
    subtitle:"100% Protected",
    icon:ShieldCheck,
    bg:"bg-gradient-to-r from-blue-500 to-indigo-700",
    iconColor:"text-white"
  },

  {
    title:"↩ EASY RETURNS",
    subtitle:"14 Day Returns",
    icon:RotateCcw,
    bg:"bg-gradient-to-r from-orange-500 to-red-600",
    iconColor:"text-white"
  },

  {
    title:"⭐ PREMIUM QUALITY",
    subtitle:"Top Brands",
    icon:BadgeCheck,
    bg:"bg-gradient-to-r from-purple-500 to-pink-600",
    iconColor:"text-white"
  },

  {
    title:"🎧 24/7 SUPPORT",
    subtitle:"Always Here",
    icon:Headphones,
    bg:"bg-gradient-to-r from-cyan-500 to-blue-700",
    iconColor:"text-white"
  }

];

export default function FeatureStrip(){

  return(

    <section className="
      bg-white
      py-*
      border-b
    ">

      <div className="
        max-w-7xl
        mx-auto
        px-*
        grid
        grid-cols-2
        md:grid-cols-3
        lg:grid-cols-5
        gap-4

      ">

        {features.map((item,index)=>{

          const Icon = item.icon;

          return(

 <div
  key={index}
  className={`
    flex
    items-center
    gap-4
    ${item.bg}
    rounded-3xl
    p-5
    text-white
    shadow-lg
    hover:shadow-2xl
    hover:scale-105
    transition-all
    duration-300
    cursor-pointer
    relative
    overflow-hidden
  `}
>

  <div className="
  w-14
  h-14
  rounded-full
  bg-white/20
  backdrop-blur-sm
  flex
  items-center
  justify-center
">

                <Icon
  size={24}
  className={item.iconColor}
/>

              </div>

              <div>

                <h3 className="
                  font-bold
                  text-sm
                  md:text-base
                ">

                  {item.title}

                </h3>

                <p className="
  text-white/90
  text-xs
  md:text-sm
">
  {item.subtitle}
</p>
                

              </div>

            </div>

          );

        })}

      </div>

    </section>

  );

}