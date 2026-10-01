import type { Metadata } from "next";
import Link from "next/link";

// Real 404 page (the status code is set by Next when notFound() / no route
// matches). Kept out of the index and gives the visitor a way back.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-4xl font-bold">Page not found</h1>
      <p className="mt-3 text-gray-600">
        The page you&apos;re looking for doesn&apos;t exist or is no longer available.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700">
          Go to Home
        </Link>
        <Link href="/search" className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50">
          Search products
        </Link>
      </div>
    </div>
  );
}
