"use client";

import Link from "next/link";

export default function FeaturedCategories() {

  const categories = [

    {
  name: "Men Fashion",
  image: "/man-fashion.jpg",
  link: "/category/Men Fashion",
},

{
  name: "Women-Fashion",
  image: "/woman fashion.jpg",
  link: "/category/Women Fashion",
},

{
  name: "Electronics",
  image: "/Electronics.jpg",
  link: "/category/Electronics",
},

{
  name: "Grocery",
  image: "/Grocery.jpg",
  link: "/category/Grocery",
},

{
  name: "Kids Fashion",
  image: "/Kids-fashion.jpg",
  link: "/category/Kids Fashion",
},
{
  name: "Beauty",
  image: "/beauty.jpg",
  link: "/category/Beauty",
},



  ];

  return (

    <section
      className="
        max-w-7xl
        mx-auto
        px-2
        py-8
      "
    >

      <div
        className="
          flex
          items-center
          justify-between
          mb-6
        "
      >

        <h2
          className="
            text-2xl
            md:text-3xl
            font-bold
          "
        >
          Featured Categories
        </h2>

      </div>

      <div
        className="
          grid
          grid-cols-2
          md:grid-cols-3
          lg:grid-cols-6
          gap-4
        "
      >

        {categories.map((category, index) => (

          <Link
            key={index}
            href={category.link}
          >

            <div
              className="
                bg-white
                rounded-3xl
                overflow-hidden
                shadow-md
                hover:shadow-xl
                transition
                duration-300
                group
                cursor-pointer
              "
            >

              <div
                className="
                  overflow-hidden
                "
              >

                <img
                  src={category.image}
                  alt={category.name}
                  className="
                    w-full
                    h-40
                    object-cover
                    group-hover:scale-110
                    transition
                    duration-500
                  "
                />

              </div>

              <div
                className="
                  p-4
                  text-center
                "
              >

                <h3
                  className="
                    font-bold
                    text-lg
                  "
                >
                  {category.name}
                </h3>

              </div>

            </div>

          </Link>

        ))}

      </div>

    </section>

  );

}