import Link from "next/link";

export default function Hero() {
  return (
    <section className="bg-gradient-to-r from-green-500 via-green-600 to-blue-600 text-white py-20">
      <div className="max-w-7xl mx-auto px-6">
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          🛒 Welcome to YOMICO – India's Smart Marketplace
        </h1>

        <p className="text-lg md:text-2xl mb-2">
          India&apos;s trusted multi-vendor marketplace for Groceries, Electronics, Fashion, Beauty, Furniture and much more.
        </p>

        <p className="text-lg md:text-2xl mb-6">
          🔥 Up to 70% OFF on Fashion, Electronics, Groceries & More
        </p>

        <Link
          href="/search"
          className="inline-block bg-white text-green-600 px-8 py-3 rounded-2xl font-bold text-lg hover:bg-gray-100 transition"
        >
         Start Shopping
        </Link>
      </div>
    </section>
  );
}
