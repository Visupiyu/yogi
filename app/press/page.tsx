import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Press",
  description:
    "Press and media information for YOMICO, India's multi-vendor marketplace.",
};

export default function PressPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-5xl font-bold text-center mb-6">Press</h1>
        <p className="text-center text-gray-600 max-w-2xl mx-auto mb-12">
          Resources and contact information for journalists and media
          covering YOMICO.
        </p>

        <div className="bg-white p-8 rounded-2xl shadow">
          <h2 className="text-2xl font-bold mb-4">About this page</h2>
          <p className="text-gray-600 leading-8">
            YOMICO is a growing multi-vendor marketplace based in India. We
            don't have press coverage or media mentions to share here yet —
            this page will be updated as that changes. In the meantime, if
            you're working on a story that involves YOMICO, we'd like to
            hear from you.
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow mt-8">
          <h2 className="text-2xl font-bold mb-4">Company overview</h2>
          <p className="text-gray-600 leading-8">
            YOMICO connects customers with independent sellers across
            categories including groceries, fashion, electronics and beauty.
            Alongside the marketplace itself, YOMICO operates checkout,
            delivery coordination, and after-sales support such as returns,
            replacements and refunds.
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow mt-8">
          <h2 className="text-2xl font-bold mb-4">Brand assets</h2>
          <p className="text-gray-600 leading-8 mb-4">
            The current YOMICO logo is available below. For any other brand
            assets, please contact us directly.
          </p>
          <a
            href="/logo.png"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-green-700 font-semibold hover:underline"
          >
            View YOMICO logo →
          </a>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 mt-8 text-center">
          <h3 className="text-2xl font-bold mb-2">Media contact</h3>
          <p className="text-gray-600 mb-4">
            For interviews, comment, or media inquiries, email{" "}
            <a
              href="mailto:yomico.help@gmail.com"
              className="text-green-700 font-semibold hover:underline"
            >
              yomico.help@gmail.com
            </a>
            .
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
