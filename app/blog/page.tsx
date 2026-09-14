import Link from "next/link";
import type { Metadata } from "next";
import { getAllBlogPosts } from "@/lib/blogPosts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides and updates from YOMICO on shopping, selling, delivery and returns on India's multi-vendor marketplace.",
};

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-5xl font-bold text-center mb-6">YOMICO Blog</h1>
        <p className="text-center text-gray-600 max-w-2xl mx-auto mb-12">
          Guides and updates on shopping, selling, delivery and returns —
          straight from the YOMICO team.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block bg-white p-6 rounded-2xl shadow hover:shadow-lg transition"
            >
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                  {post.category}
                </span>
                <span>{post.date}</span>
              </div>
              <h2 className="text-xl font-bold mb-2">{post.title}</h2>
              <p className="text-gray-600 leading-7">{post.excerpt}</p>
              <span className="inline-block mt-4 text-green-600 font-semibold">
                Read more →
              </span>
            </Link>
          ))}
        </div>

        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 mt-12 text-center">
          <h3 className="text-2xl font-bold mb-2">Have a question we haven't covered?</h3>
          <p className="text-gray-600 mb-4">
            Check our FAQ, or reach out to our support team directly.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/faq"
              className="inline-block bg-white border border-green-600 text-green-700 px-6 py-3 rounded-lg font-semibold hover:bg-green-50 transition"
            >
              Visit FAQ
            </Link>
            <Link
              href="/contact"
              className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
