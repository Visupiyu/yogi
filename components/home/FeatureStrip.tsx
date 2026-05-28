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

    icon:Truck

  },

  {

    title:"Secure Payment",

    subtitle:"100% protected payments",

    icon:ShieldCheck

  },

  {

    title:"Easy Returns",

    subtitle:"7 days return policy",

    icon:RotateCcw

  },

  {

    title:"Best Quality",

    subtitle:"Trusted branded products",

    icon:BadgeCheck

  },

  {

    title:"24/7 Support",

    subtitle:"Dedicated customer support",

    icon:Headphones

  }

];

export default function FeatureStrip(){

  return(

    <section className="
      bg-white
      py-5
      border-b
    ">

      <div className="
        max-w-7xl
        mx-auto
        px-4
        grid
        grid-cols-2
        md:grid-cols-3
        lg:grid-cols-5
        gap-2
      ">

        {features.map((item,index)=>{

          const Icon = item.icon;

          return(

            <div

              key={index}

              className="
                flex
                items-center
                gap-2
                bg-gray-50
                rounded-2xl
                p-4
                hover:shadow-md
                transition
              "
            >

              <div className="
                w-12
                h-12
                rounded-full
                bg-green-100
                flex
                items-center
                justify-center
              ">

                <Icon
                  size={24}
                  className="
                    text-green-600
                  "
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