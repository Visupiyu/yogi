import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Explore careers at YOMICO, India's multi-vendor marketplace connecting customers with trusted sellers.",
};

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-5xl font-bold text-center mb-6">
          Careers at YOMICO
        </h1>
        <p className="text-center text-gray-600 max-w-2xl mx-auto mb-12">
          We're building a multi-vendor marketplace that connects customers
          with trusted sellers across India — and we're doing it with a
          small, hands-on team.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">What we're building</h2>
            <p className="text-gray-600 leading-8">
              YOMICO brings customers and independent sellers together across
              groceries, fashion, electronics, beauty and more — and connects
              sellers with the tools, payments and delivery infrastructure
              they need to run their business. Every part of that, from
              checkout to delivery to returns, is being built and improved
              by our team.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow">
            <h2 className="text-2xl font-bold mb-4">Why work with us</h2>
            <ul className="text-gray-600 leading-8 list-disc list-inside space-y-1">
              <li>Real impact from day one — we're a small team, so your work matters immediately.</li>
              <li>You'll work across a genuine three-sided marketplace: customers, sellers and delivery.</li>
              <li>Broad, end-to-end exposure to ecommerce, payments and logistics.</li>
            </ul>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow mt-8">
          <h2 className="text-2xl font-bold mb-4">Current openings</h2>
          <p className="text-gray-600 leading-8">
            We don't have specific open positions listed right now. YOMICO is
            still growing, and what we need changes as we do — so if there's
            nothing posted today, that's not a no, it just means we haven't
            defined a role yet.
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 mt-8 text-center">
          <h3 className="text-2xl font-bold mb-2">Interested anyway?</h3>
          <p className="text-gray-600 mb-4 max-w-xl mx-auto">
            Send us a short note about what you'd like to work on, along with
            your resume or portfolio if you have one, to{" "}
            <a
              href="mailto:yomico.help@gmail.com"
              className="text-green-700 font-semibold hover:underline"
            >
              yomico.help@gmail.com
            </a>
            . We read every message.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
