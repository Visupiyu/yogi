"use client";

import { useEffect, useState } from "react";

const reviews = [
  {
    name: "Rahul Sharma",
    rating: 5,
    text: "Excellent products and super fast delivery. Highly recommended!",
    bg:"bg-green-100"
  },
  {
    name: "Priya Patel",
    rating: 5,
    text: "Very smooth shopping experience. Customer support was amazing.",
    bg:"bg-blue-100"
  },
  {
    name: "Amit Kumar",
    rating: 4,
    text: "Good quality products and reasonable prices.",
      bg:"bg-yellow-100"
  },
  {
    name: "Sneha Gupta",
    rating: 5,
    text: "Best marketplace I've used recently. Easy checkout process.",
      bg:"bg-pink-100"
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
      py-*
      px-*
    ">

      <div className="
        max-w-5xl
        mx-auto
      ">

        <h2 className="
          text-3xl
          font-bold
          text-center
          mb-*
        ">
          ⭐ Customer Reviews
        </h2>

        <div
  className={`
    ${reviews[current].bg}
    rounded-3xl
    shadow-xl
    p-2 md:p-6
    text-center
    transition-all
    duration-500
  `}
>

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
          gap-1
          mt-2
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