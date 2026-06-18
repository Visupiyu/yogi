"use client";

import Link from "next/link";

const categories = [

  {
    name:"Fashion",
    image:"https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200",
    slug:"fashion",
    bg:"bg-green-100",
    },

  {
    name:"Electronics",
    image:"https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=1200",
    slug:"electronics",
    bg:"bg-blue-100",
  },

  {
    name:"Grocery",
    image:"https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200",
    slug:"grocery",
    bg:"bg-orange-100",
  },

  {
    name:"Beauty",
    image:"https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200",
    slug:"beauty",
    bg:"bg-pink-100",
  },

  {
    name:"Furniture",
    image:"https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200",
    slug:"furniture",
    bg:"bg-yellow-100",
  },

  {
    name:"Sports",
    image:"https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&w=1200",
    slug:"sports",
    bg:"bg-red-100",
  },

];

export default function CategoriesGrid(){

  return(

    <section className="
      py-*
      px-*
      bg-white
    ">

      <div className="
        max-w-7xl
        mx-auto
      ">

        <div className="
          flex
          items-center
          justify-between
          mb-*
        ">

          <h2 className="
            text-3xl
            font-bold
          ">
            Shop By Category
          </h2>

        </div>

        <div className="
  flex
  flex-nowrap
  overflow-x-scroll
  w-full
  gap-4
  pb-2
  scrollbar-hide
">
          {categories.map((category,index)=>(
            

          <Link
  key={index}
  href={`/category/${category.slug}`}
  className="
    flex-shrink-0
    block
  "
>

             <div
  className={`
    group
    min-w-[140px]
    md:min-w-[180px]
    ${category.bg}
    rounded-2xl
    overflow-hidden
    shadow-md
    hover:shadow-xl
    transition
    duration-300
    cursor-pointer
  `}
>

                <div className="
                  h-24
                  md:h-28
                  overflow-hidden
                ">

                  <img
                    src={category.image}
                    alt={category.name}
                    className="
                      w-full
                      h-full
                      object-cover
                      group-hover:scale-110
                      transition
                      duration-500
                    "
                  />

                </div>

                <div className="
                  p-2
                  text-center
                ">

                  <h3 className="
                    font-semibold
                  text-sm
md:text-base
                  ">
                    {category.name}
                  </h3>

                </div>

              </div>

            </Link>

          ))}

        </div>

      </div>

    </section>

  );

}