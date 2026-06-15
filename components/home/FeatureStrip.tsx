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
    title:"Free Delivery",
    subtitle:"On orders above ₹499",
    icon:Truck,
    bg:"bg-green-100",
    iconColor:"text-green-600"
  },

  {
    title:"Secure Payment",
    subtitle:"100% protected payments",
    icon:ShieldCheck,
    bg:"bg-blue-100",
    iconColor:"text-blue-600"
  },

  {
    title:"Easy Returns",
    subtitle:"7 days return policy",
    icon:RotateCcw,
    bg:"bg-orange-100",
    iconColor:"text-orange-600"
  },

  {
    title:"Best Quality",
    subtitle:"Trusted branded products",
    icon:BadgeCheck,
    bg:"bg-purple-100",
    iconColor:"text-purple-600"
  },

  {
    title:"24/7 Support",
    subtitle:"Dedicated customer support",
    icon:Headphones,
    bg:"bg-red-100",
    iconColor:"text-red-600"
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
        gap-1

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
    rounded-2xl
    p-4
    hover:shadow-md
    transition
  `}
>

              <div className={`
  w-12
  h-12
  rounded-full
  ${item.bg}
  flex
  items-center
  justify-center
`}>

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
                  text-gray-500
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