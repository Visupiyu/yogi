import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllBlogPosts, getBlogPostBySlug } from "@/lib/blogPosts";

// One reusable article route for every post in lib/blogPosts.ts, rather than
// a separate page per article.
export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return { title: "Blog" };
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/blog" className="text-green-600 hover:underline text-sm">
          ← Back to Blog
        </Link>

        <div className="flex items-center gap-3 text-xs text-gray-500 mt-6 mb-3">
          <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
            {post.category}
          </span>
          <span>{post.date}</span>
        </div>

        <h1 className="text-4xl font-bold mb-8">{post.title}</h1>

        <div className="bg-white p-8 rounded-2xl shadow space-y-5">
          {post.content.map((paragraph, i) => (
            <p key={i} className="text-gray-700 leading-8">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mt-10 text-center">
          <p className="text-gray-700 mb-4">Still have questions?</p>
          <Link
            href="/contact"
            className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
