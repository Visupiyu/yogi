"use client";

import { useEffect, useState } from "react";

const reviews = [
  {
    name: "Rahul Sharma",
    rating: 5,
    text: "Excellent products and super fast delivery. Highly recommended!",
  },
  {
    name: "Priya Patel",
    rating: 5,
    text: "Very smooth shopping experience. Customer support was amazing.",
  },
  {
    name: "Amit Kumar",
    rating: 4,
    text: "Good quality products and reasonable prices.",
  },
  {
    name: "Sneha Gupta",
    rating: 5,
    text: "Best marketplace I've used recently. Easy checkout process.",
  },
];

export default function CustomerReviewsCarousel() {

  const [current, setCurrent] =
    useState(0);

  useEffect(() => {

    const interval =
      setInterval(() => {

        setCurrent((prev) =>
          prev === reviews.length - 1
            ? 0
            : prev + 1
        );

      }, 4000);

    return () =>
      clearInterval(interval);

  }, []);

  return (

    <section className="
      py-1
      px-4
    ">

      <div className="
        max-w-5xl
        mx-auto
      ">

        <h2 className="
          text-3xl
          font-bold
          text-center
          mb-3
        ">
          ⭐ Customer Reviews
        </h2>

        <div className="
          bg-gradient-to-r
from-green-50
via-white
to-blue-50
          rounded-3xl
          shadow-xl
         p-6
md:p-10
          text-center
          transition-all
          duration-500
        ">

          <div className="
            text-yellow-500
            text-2xl
            mb-3
          ">
            {"⭐".repeat(
              reviews[current].rating
            )}
          </div>

          <p className="
            text-lg
            text-gray-700
            leading-8
            mb-3
          ">
            "
            {reviews[current].text}
            "
          </p>

          <h3 className="
  font-bold
  text-xl
">
  {reviews[current].name}
</h3>

<p className="
  text-green-600
  text-sm
  mt-1
">
  Verified Customer
</p>

        </div>

        <div className="
          flex
          justify-center
          gap-2
          mt-6
        ">

          {reviews.map(
            (_, index) => (

            <button
              key={index}
              onClick={() =>
                setCurrent(index)
              }
              className={`
                w-3
                h-3
                rounded-full
                transition

                ${
                  current === index
                    ? "bg-green-600"
                    : "bg-gray-300"
                }
              `}
            />

          ))}

        </div>

      </div>

    </section>

  );

}