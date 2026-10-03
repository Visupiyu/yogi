// Client-side, best-effort error report for the App Router error boundaries.
// Sends ONLY: which boundary, the server digest (when the error came from the
// server), the page path without its query string, and a short redacted
// message. Never the stack, never user data, never throws, never retries.
import { redactPath, redactText } from "@/lib/observability/redact";

export function reportClientError(boundary: "segment" | "global", error: Error & { digest?: string }): void {
  try {
    const body = JSON.stringify({
      boundary,
      digest: typeof error?.digest === "string" ? error.digest.slice(0, 100) : null,
      path: typeof window !== "undefined" ? redactPath(window.location.pathname) : "",
      // A server error reaching the browser already has a generic message in
      // production; a client error's message is redacted before it leaves.
      message: redactText(error?.message, 200),
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/client-errors", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never break the error page */
  }
}
