import { redactPath, redactText } from "@/lib/observability/redact";

// POST /api/client-errors — intake for the App Router error boundaries
// (lib/observability/clientReport). Unauthenticated by necessity (the page
// that crashed may be signed out), so it stores NOTHING: each accepted report
// becomes one structured, re-redacted log line, the same shape the server's
// instrumentation.ts writes. Bounded body size and a per-instance rate limit
// keep it from becoming a log-spam vector. Always answers 204.

const MAX_BODY = 2_000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const recent: number[] = [];

export async function POST(request: Request) {
  try {
    const now = Date.now();
    while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
    if (recent.length >= MAX_PER_WINDOW) return new Response(null, { status: 204 });
    recent.push(now);

    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY) return new Response(null, { status: 204 });
    const body = JSON.parse(raw) as { boundary?: unknown; digest?: unknown; path?: unknown; message?: unknown };

    console.error(
      JSON.stringify({
        level: "error",
        type: "client_render_error",
        boundary: body.boundary === "global" ? "global" : "segment",
        digest: typeof body.digest === "string" ? body.digest.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100) : null,
        path: redactPath(body.path),
        message: redactText(body.message, 200),
        at: new Date(now).toISOString(),
      })
    );
  } catch {
    /* malformed report — ignore */
  }
  return new Response(null, { status: 204 });
}
