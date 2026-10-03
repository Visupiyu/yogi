/*
 * LOCAL UNIT TEST — L5 error handling / monitoring. No Firebase, no network,
 * no emulator.
 *   - lib/observability/redact strips credentials, tokens, keys, emails, phone
 *     numbers, query strings and long opaque ids;
 *   - instrumentation.ts onRequestError writes ONE redacted JSON line, never
 *     headers/cookies/query strings;
 *   - app/api/client-errors accepts, redacts, bounds and rate-limits reports
 *     and always answers 204;
 *   - the error boundaries never render error.message / stack and offer Retry;
 *   - the API error responses fixed in L5 no longer echo raw exceptions.
 * Run: npx tsx scripts/test/observability/run.test.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactText, redactPath } from "../../../lib/observability/redact.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (ok) pass++; else fail++;
}

// Captured console.error lines (the error sinks under test write there).
const lines: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };

// ---- 1. redaction ----
const SECRETS = {
  bearer: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl",
  // Fake values, assembled at runtime so secret scanners never see a key shape in the source.
  firebaseKey: ["AI", "za", "SyC_EXAMPLEEXAMPLEEXAMPLE12345"].join(""),
  razorpay: "rzp_live_ABCdef123456",
  resend: "re_AbCdEf1234567890XYZ",
  privateKey: ["-----BEGIN ", "PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END ", "PRIVATE KEY-----"].join(""),
  email: "customer.name@example.com",
  phone: "+91 9876543210",
  query: "/checkout?token=abc123&uid=xyz",
  pwd: "password=hunter2",
};
const dirty = Object.values(SECRETS).join(" | ");
const clean = redactText(dirty, 5000);
const leaked = Object.entries(SECRETS).filter(([k, v]) => {
  const probe = k === "privateKey" ? "MIIEvQIBADANBg" : k === "query" ? "token=abc123" : k === "pwd" ? "hunter2" : k === "phone" ? "9876543210" : v;
  return clean.includes(probe);
}).map(([k]) => k);
check("1 redactText removes tokens, keys, private keys, emails, phones, query strings, passwords", leaked.length === 0, leaked.join(",") || clean.slice(0, 120));
check("1b redactText bounds length", redactText("x".repeat(1000)).length <= 301);
check("1c redactPath drops query and fragment", redactPath("/orders/123?token=abc#frag") === "/orders/123");
check("1d ordinary text survives", redactText("Cannot read properties of undefined (reading 'items')").includes("reading 'items'"));

// ---- 2. instrumentation.ts ----
const { onRequestError } = await import("../../../instrumentation.ts");
lines.length = 0;
const err = Object.assign(new Error(`Firestore failed for ${SECRETS.email} with ${SECRETS.bearer}`), { digest: "123456789" });
await onRequestError(err as never, {
  path: "/orders/abc?session=SECRET_SESSION",
  method: "GET",
  headers: { cookie: "session=SECRET_COOKIE", authorization: SECRETS.bearer },
} as never, { routerKind: "App Router", routePath: "/orders/[id]", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined } as never);
const logged = lines.join("\n");
let parsed: Record<string, unknown> = {};
try { parsed = JSON.parse(lines[0] || "{}"); } catch {}
check("2 onRequestError writes one structured line with digest + route",
  lines.length === 1 && parsed.digest === "123456789" && parsed.routePath === "/orders/[id]" && parsed.path === "/orders/abc");
check("2b no headers, cookies, query, email or token in the server error log",
  !logged.includes("SECRET_COOKIE") && !logged.includes("SECRET_SESSION") && !logged.includes(SECRETS.email) &&
    !logged.includes("eyJhbGci") && !("stack" in parsed));

// ---- 3. client error intake ----
const { POST: clientErrors } = await import("../../../app/api/client-errors/route.ts");
lines.length = 0;
const report = (body: string) => clientErrors(new Request("http://x/api/client-errors", { method: "POST", body }));
const r1 = await report(JSON.stringify({ boundary: "segment", digest: "abc<script>", path: "/cart?coupon=SECRET", message: `boom ${SECRETS.firebaseKey} ${SECRETS.email}` }));
const c1 = lines.join("\n");
check("3 client report -> 204 and one redacted log line",
  r1.status === 204 && lines.length === 1 && c1.includes("client_render_error") && !c1.includes(SECRETS.firebaseKey) &&
    !c1.includes(SECRETS.email) && !c1.includes("coupon=SECRET") && !c1.includes("<script>"));
lines.length = 0;
const r2 = await report("not json");
const r3 = await report("x".repeat(5000));
check("3b malformed / oversized report -> 204, nothing logged", r2.status === 204 && r3.status === 204 && lines.length === 0);
lines.length = 0;
for (let k = 0; k < 40; k++) await report(JSON.stringify({ boundary: "segment", message: "spam" }));
check("3c per-instance rate limit caps log volume", lines.length < 40 && lines.length > 0, `logged=${lines.length}`);

// ---- 4. error boundaries ----
const segment = read("app/error.tsx");
const global = read("app/global-error.tsx");
const rendersMessage = (src: string) => /\{\s*error\.(message|stack)\s*\}/.test(src) || /error\.stack/.test(src);
check("4 app/error.tsx: client component, Retry via unstable_retry, never renders error.message/stack",
  segment.startsWith('"use client"') && segment.includes("unstable_retry()") && !rendersMessage(segment) && segment.includes('role="alert"'));
check("4b app/global-error.tsx: own <html>/<body>, Retry, never renders error.message/stack",
  global.startsWith('"use client"') && global.includes("<html") && global.includes("<body") && global.includes("unstable_retry()") && !rendersMessage(global));

// ---- 5. API error responses no longer echo raw exceptions ----
check("5 send-order-email no longer returns String(error)", !/error:\s*String\(error\)/.test(read("app/api/send-order-email/route.ts")));
check("5b admin AI chat no longer returns the provider's error.message",
  !/error instanceof Error \? error\.message/.test(read("app/api/ai/admin/chat/route.ts")));

console.error = origError;
console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exitCode = 1;
