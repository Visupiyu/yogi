import type { Instrumentation } from "next";
import { redactPath, redactText } from "@/lib/observability/redact";

// Server error visibility (Next.js instrumentation hook — runs for errors the
// Next.js server itself catches: thrown during rendering, in a route handler,
// a server action or the proxy). Each one becomes ONE structured JSON log line
// in the deployment's runtime logs (Vercel → Logs), carrying the same `digest`
// the customer-facing error page shows as its reference, so a support report
// can be matched to the server-side record.
//
// Deliberately NOT logged: request headers (cookies, Authorization), query
// strings, bodies, or stack traces; the message itself is redacted
// (lib/observability/redact). No third-party monitoring service is configured
// in this repository — see README → "Error monitoring" for adding one.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      type: "server_request_error",
      digest: typeof err?.digest === "string" ? err.digest : null,
      name: typeof err?.name === "string" ? err.name.slice(0, 60) : "Error",
      message: redactText(err?.message),
      method: request.method,
      path: redactPath(request.path),
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: (context as { renderSource?: string }).renderSource ?? null,
      at: new Date().toISOString(),
    })
  );
};
