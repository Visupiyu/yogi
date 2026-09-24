/*
 * LOCAL CONFIG UNIT TEST — no Firebase, no Razorpay, no network, no emulator.
 * Verifies the preview environment-isolation logic (fail-closed) in
 * lib/firebaseConfig.ts and lib/razorpayEnv.ts.
 * Run: npx tsx scripts/test/config/preview-isolation.test.mts
 */
import { selectFirebaseConfig, PRODUCTION_FIREBASE_CONFIG } from "../../../lib/firebaseConfig.ts";
import { assertRazorpayTestKeyInPreview } from "../../../lib/razorpayEnv.ts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (ok) pass++; else fail++;
}
function throwsWith(fn: () => void): string | null {
  try { fn(); return null; } catch (e) { return (e as Error).message; }
}

const PREVIEW_FULL: Record<string, string> = {
  NEXT_PUBLIC_VERCEL_ENV: "preview",
  NEXT_PUBLIC_FIREBASE_API_KEY: "test-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "yogi-mart-test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "yogi-mart-test",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "yogi-mart-test.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "111111111111",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:111111111111:web:testappid",
};

// --- Firebase config selection ---
{
  const cfg = selectFirebaseConfig({});
  check("firebase: non-preview -> production project unchanged",
    cfg.projectId === "yogi-mart" && cfg === PRODUCTION_FIREBASE_CONFIG,
    `projectId=${cfg.projectId}`);
}
{
  const cfg = selectFirebaseConfig({ NEXT_PUBLIC_VERCEL_ENV: "production", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "someone-else" });
  check("firebase: production ignores NEXT_PUBLIC_FIREBASE_* (stays yogi-mart)",
    cfg.projectId === "yogi-mart", `projectId=${cfg.projectId}`);
}
{
  const cfg = selectFirebaseConfig(PREVIEW_FULL);
  check("firebase: preview complete -> uses env test project",
    cfg.projectId === "yogi-mart-test" && cfg.apiKey === "test-api-key",
    `projectId=${cfg.projectId}`);
}
{
  const partial: Record<string, string> = { ...PREVIEW_FULL };
  delete partial.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const msg = throwsWith(() => selectFirebaseConfig(partial));
  check("firebase: preview missing var -> throws, no prod fallback",
    !!msg && msg.includes("NEXT_PUBLIC_FIREBASE_PROJECT_ID"), msg || "(no throw)");
}

// --- Razorpay preview key guard ---
{
  const msg = throwsWith(() => assertRazorpayTestKeyInPreview({ VERCEL_ENV: "production", RAZORPAY_KEY_ID: "rzp_live_ABC" }));
  check("razorpay: production LIVE key -> allowed (unchanged)", msg === null, msg || "");
}
{
  const msg = throwsWith(() => assertRazorpayTestKeyInPreview({ RAZORPAY_KEY_ID: "rzp_live_ABC" }));
  check("razorpay: local dev (no VERCEL_ENV) -> allowed", msg === null, msg || "");
}
{
  const msg = throwsWith(() => assertRazorpayTestKeyInPreview({ VERCEL_ENV: "preview", RAZORPAY_KEY_ID: "rzp_test_ABC" }));
  check("razorpay: preview TEST key -> allowed", msg === null, msg || "");
}
{
  const msg = throwsWith(() => assertRazorpayTestKeyInPreview({ VERCEL_ENV: "preview", RAZORPAY_KEY_ID: "rzp_live_ABC" }));
  check("razorpay: preview LIVE key -> throws (fail closed)", !!msg && msg.includes("rzp_test_"), msg || "(no throw)");
}
{
  const msg = throwsWith(() => assertRazorpayTestKeyInPreview({ VERCEL_ENV: "preview" }));
  check("razorpay: preview missing key -> throws", !!msg, msg || "(no throw)");
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exitCode = 1;
