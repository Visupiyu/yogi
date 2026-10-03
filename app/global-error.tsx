"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/clientReport";

// Last-resort boundary: replaces the ROOT layout when the layout itself fails,
// so it carries its own <html>/<body> and inline styles (the app's stylesheet
// and providers may be what failed). Same rules as app/error.tsx — no error
// text, no stack, only the digest as a support reference.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError("global", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f9fafb",
          color: "#111827",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        <title>Something went wrong | YOMICO</title>
        <main role="alert" style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <p style={{ fontWeight: 800, fontSize: 22, color: "#16a34a", margin: 0 }}>YOMICO</p>
          <h1 style={{ fontSize: 28, margin: "16px 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#4b5563", lineHeight: 1.5, margin: 0 }}>
            The site couldn&apos;t load just now. Your cart, orders and payments are safe — please try again in a
            moment.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "12px 24px",
                fontWeight: 600,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A plain anchor on purpose: a full reload, since the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                border: "1px solid #d1d5db",
                color: "#374151",
                borderRadius: 12,
                padding: "12px 24px",
                fontWeight: 600,
                fontSize: 16,
                textDecoration: "none",
              }}
            >
              Go to Home
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 12, color: "#6b7280" }}>
              Reference: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
