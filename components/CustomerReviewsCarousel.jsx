"use client";

import { useEffect, useState } from "react";

const reviews = [
  {
    name: "Rahul Sharma",
    rating: 5,
    text: "Excellent products and super fast delivery. Highly recommended!",
    bg: "bg-green-100",
  },
  {
    name: "Priya Patel",
    rating: 5,
    text: "Very smooth shopping experience. Customer support was amazing.",
    bg: "bg-blue-100",
  },
  {
    name: "Amit Kumar",
    rating: 4,
    text: "Good quality products and reasonable prices.",
    bg: "bg-yellow-100",
  },
  {
    name: "Sneha Gupta",
    rating: 5,
    text: "Best marketplace I've used recently. Easy checkout process.",
    bg: "bg-pink-100",
  },
];

export default function CustomerReviewsCarousel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev === reviews.length - 1 ? 0 : prev + 1));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const review = reviews[current];

  return (
    <section className="py-8 px-4 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          ❤️ What Our Customers Say
        </h2>

        <div
          className={`${review.bg} rounded-3xl shadow-xl p-6 md:p-10 text-center transition-all duration-500`}
        >
          <div className="text-yellow-500 text-2xl mb-3">
            {"⭐".repeat(review.rating)}
          </div>

          <div className="text-5xl text-black/10 mb-2">❝</div>

          <p className="text-lg text-gray-700 leading-8 mb-3">
            &quot;{review.text}&quot;
          </p>

          <div className="w-20 h-20 rounded-full bg-white shadow-lg mx-auto mb-4 flex items-center justify-center text-3xl">
            👤
          </div>

          <h3 className="font-bold text-xl">{review.name}</h3>

          <p className="text-green-600 text-sm mt-1">✅ Verified Purchase</p>
        </div>

        <div className="flex justify-center gap-2 mt-4">
          {reviews.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrent(index)}
              className={`w-3 h-3 rounded-full transition ${
                current === index ? "bg-green-600" : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
