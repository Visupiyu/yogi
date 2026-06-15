"use client";

import Link from "next/link";

import { motion } from "framer-motion";

const categories = [

  {
    name:"Grocery",
    image:
      "https://cdn-icons-png.flaticon.com/512/3082/3082037.png",
    bg:"bg-green-100"
  },

  {
  name:"Men Fashion",
  image:
    "https://cdn-icons-png.flaticon.com/512/892/892458.png",
  bg:"bg-blue-100"
},

{
  name:"Women Fashion",
  image:
    "https://cdn-icons-png.flaticon.com/512/892/892458.png",
  bg:"bg-pink-100"
},

{
  name:"Kids Fashion",
  image:
    "https://cdn-icons-png.flaticon.com/512/3468/3468378.png",
  bg:"bg-orange-100"
},

  {
    name:"Beauty",
    image:
      "https://cdn-icons-png.flaticon.com/512/3050/3050153.png",
    bg:"bg-purple-100"
  },

  {
    name:"Electronics",
    image:
      "https://cdn-icons-png.flaticon.com/512/1041/1041916.png",
    bg:"bg-cyan-100"
  },

  {
    name:"Furniture",
    image:
      "https://cdn-icons-png.flaticon.com/512/3081/3081559.png",
    bg:"bg-yellow-100"
  },

  {
    name:"Mobiles",
    image:
      "https://cdn-icons-png.flaticon.com/512/545/545245.png",
    bg:"bg-red-100"
  },

  {
    name:"Appliances",
    image:
      "https://cdn-icons-png.flaticon.com/512/3659/3659898.png",
    bg:"bg-gray-100"
  },

  {
    name:"Books",
    image:
      "https://cdn-icons-png.flaticon.com/512/3145/3145765.png",
    bg:"bg-indigo-100"
  }
  
];

export default function CategoryStrip(){

  return (

  <section
    className="
      bg-gradient-to-r
      from-green-50
      via-white
      to-blue-50
      border-b
      border-gray-200
    "
  >

    <div
      className="
        max-w-screen-2xl
        mx-auto
        px-4
        py-5
        flex
        justify-start
        items-center
        gap-6
        overflow-x-auto
        scrollbar-hide
      "
    >

      {categories.map((cat) => (

        <motion.div
          key={cat.name}
          whileHover={{
            y: -4,
            scale: 1.05
          }}
          whileTap={{
            scale: 0.96
          }}
        >

          <Link
            href={`/category/${cat.name}`}
            className="
              flex
              flex-col
              items-center
              min-w-[90px]
              shrink-0
              group
            "
          >

            <div
              className={`
                w-16
                h-16
                md:w-20
                md:h-20
                rounded-full
                ${cat.bg}
                flex
                items-center
                justify-center
                shadow-sm
                group-hover:shadow-lg
                transition
                overflow-hidden
              `}
            >

              <img
                src={cat.image}
                alt={cat.name}
                className="
                  w-8
                  h-8
                  md:w-10
                  md:h-10
                  object-contain
                "
              />

            </div>

            <p
              className="
                mt-3
                text-sm
                font-semibold
                text-gray-700
                group-hover:text-green-600
                transition
                text-center
              "
            >

              {cat.name}

            </p>

          </Link>

        </motion.div>

      ))}

    </div>

  </section>

);
}