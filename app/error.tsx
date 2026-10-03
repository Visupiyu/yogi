"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/observability/clientReport";

// Route-segment error boundary for the whole app (inside the root layout, so
// the site header/footer stay). Shows a calm, customer-safe message — never
// the error text, a stack, or a provider/Firebase message. In production a
// server error reaches here with a generic message and a `digest`, which is
// shown as a short reference that matches the server log line written by
// instrumentation.ts. Expected business outcomes (validation, out of stock,
// payment declined) are handled in their own pages and never land here.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError("segment", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center"
    >
      <h1 className="text-3xl font-bold sm:text-4xl">Something went wrong</h1>
      <p className="mt-3 text-gray-600">
        We couldn&apos;t load this page just now. Your cart, orders and payments are safe — please try again.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
        >
          Go to Home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-gray-500">
          If this keeps happening, contact support and mention reference{" "}
          <span className="font-mono">{error.digest}</span>.
        </p>
      )}
    </div>
  );
}
