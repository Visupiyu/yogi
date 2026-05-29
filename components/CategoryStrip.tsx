"use client";

import Link from "next/link";

import { motion } from "framer-motion";

const categories = [

  {
    name:"Grocery",
    image:
      "https://cdn-icons-png.flaticon.com/512/3082/3082037.png"
  },

  {
    name:"Fashion",
    image:
      "https://cdn-icons-png.flaticon.com/512/892/892458.png"
  },

  {
    name:"Beauty",
    image:
      "https://cdn-icons-png.flaticon.com/512/3050/3050153.png"
  },

  {
    name:"Electronics",
    image:
      "https://cdn-icons-png.flaticon.com/512/1041/1041916.png"
  },

  {
    name:"Furniture",
    image:
      "https://cdn-icons-png.flaticon.com/512/3081/3081559.png"
  },

  {
    name:"Mobiles",
    image:
      "https://cdn-icons-png.flaticon.com/512/545/545245.png"
  },

  {
    name:"Appliances",
    image:
      "https://cdn-icons-png.flaticon.com/512/3659/3659898.png"
  },

  {
    name:"Books",
    image:
      "https://cdn-icons-png.flaticon.com/512/3145/3145765.png"
  }

];

export default function CategoryStrip(){

  return(

    <section className="
      bg-white
      border-b
    ">

      <div className="
        max-w-7xl
        mx-auto
        px-4
        py-5
        flex
        justify-center
        items-center
        gap-6
        overflow-x-auto
        scrollbar-hide
      ">

        {categories.map((cat)=>(

        <motion.div

  whileHover={{
    y:-4,
    scale:1.05
  }}

  whileTap={{
    scale:0.96
  }}

>

  <Link

    key={cat.name}

    href={`/category/${cat.name}`}

    className="
      flex
      flex-col
      items-center
      min-w-[90px]
      group
    "
  >
             <div className="
              w-16
              h-16
              rounded-full
              bg-gray-100
              flex
              items-center
              justify-center
              shadow-sm
              group-hover:shadow-lg
              transition
              overflow-hidden
            ">

              <img
                src={cat.image}
                alt={cat.name}
                className="
                  w-8
                  h-8
                  object-contain
                "
              />

            </div>

            <p className="
              mt-3
              text-sm
              font-semibold
              text-gray-700
              group-hover:text-green-600
              transition
              text-center
            ">

              {cat.name}

            </p>

             </Link>

          </motion.div>

        ))}

      </div>

    </section>

  );

}