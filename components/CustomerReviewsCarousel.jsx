"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

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
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">

  <span className="inline-block bg-pink-100 text-pink-600 px-4 py-1 rounded-full text-sm font-semibold mb-3">
    ❤️ CUSTOMER LOVE
  </span>

  <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
    What Our Customers Say
  </h2>

  <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
    Trusted by happy shoppers across India for quality products and reliable service.
  </p>

</div>
<motion.div
      key={current}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`${review.bg} rounded-3xl shadow-xl p-6 md:p-10 text-center transition-all duration-500`}
        >
          <div className="text-yellow-500 text-3xl mb-4 tracking-wide">
            {"⭐".repeat(review.rating)}
          </div>

          <div className="text-6xl text-black/10 mb-2">❝</div>

          <p className="text-xl text-gray-700 leading-9 max-w-3xl mx-auto mb-5">
            &quot;{review.text}&quot;
          </p>

          <div className="w-24 h-24 rounded-full bg-white shadow-lg mx-auto mb-4 flex items-center justify-center text-3xl">
            👤
          </div>

          <h3 className="font-bold text-xl">{review.name}</h3>

          <p className="inline-block mt-3 bg-green-100 text-green-700 px-4 py-1 rounded-full text-sm font-semibold">✅ Verified Purchase</p>
          </motion.div>

        <div className="flex justify-center gap-2 mt-4">
          {reviews.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrent(index)}
              className={`w-4 h-4 rounded-full transition ${
                current === index ? "bg-green-600" : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
