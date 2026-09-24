/*
 * LOCAL CONFIG UNIT TEST — no Firebase, no Razorpay, no network, no emulator.
 * Verifies the hardened preview environment-isolation logic (fail-closed) in
 * lib/firebaseConfig.ts and lib/razorpayEnv.ts, and that every server-side
 * Razorpay client is guarded by assertRazorpayTestKeyInPreview() BEFORE it is
 * constructed. Run: npx tsx scripts/test/config/preview-isolation.test.mts
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { selectFirebaseConfig, PRODUCTION_FIREBASE_CONFIG } from "../../../lib/firebaseConfig.ts";
import { assertRazorpayTestKeyInPreview } from "../../../lib/razorpayEnv.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (ok) pass++; else fail++;
}
function throwsWith(fn: () => void): string | null {
  try { fn(); return null; } catch (e) { return (e as Error).message; }
}

const FB = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "test-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "yogi-mart-test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "yogi-mart-test",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "yogi-mart-test.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "111111111111",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:111111111111:web:testappid",
};

// 1) Production/dev (no project id, no preview flag) -> production, unchanged.
{
  const cfg = selectFirebaseConfig({});
  check("1 production/dev -> production project unchanged",
    cfg === PRODUCTION_FIREBASE_CONFIG && cfg.projectId === "yogi-mart", `projectId=${cfg.projectId}`);
}
// production even with NEXT_PUBLIC_VERCEL_ENV=production explicitly
{
  const cfg = selectFirebaseConfig({ NEXT_PUBLIC_VERCEL_ENV: "production" });
  check("1b production flag -> production project unchanged", cfg.projectId === "yogi-mart", `projectId=${cfg.projectId}`);
}
// 2) Preview with complete test config (triggered by PROJECT_ID, NO vercel flag) -> test config.
{
  const cfg = selectFirebaseConfig({ ...FB });
  check("2 env-driven via PROJECT_ID (no vercel flag) -> test project",
    cfg.projectId === "yogi-mart-test" && cfg.apiKey === "test-api-key", `projectId=${cfg.projectId}`);
}
// 2b) Triggered by NEXT_PUBLIC_VERCEL_ENV=preview + complete config -> test config.
{
  const cfg = selectFirebaseConfig({ ...FB, NEXT_PUBLIC_VERCEL_ENV: "preview" });
  check("2b env-driven via preview flag -> test project", cfg.projectId === "yogi-mart-test");
}
// 3) Preview/env-driven with missing var -> throws.
{
  const partial: Record<string, string> = { ...FB };
  delete partial.NEXT_PUBLIC_FIREBASE_API_KEY;
  const msg = throwsWith(() => selectFirebaseConfig(partial));
  check("3 env-driven missing var -> throws (fail closed)",
    !!msg && msg.includes("NEXT_PUBLIC_FIREBASE_API_KEY"), msg || "(no throw)");
}
// 3b) preview flag set but NO firebase config at all -> throws (cannot silently use prod).
{
  const msg = throwsWith(() => selectFirebaseConfig({ NEXT_PUBLIC_VERCEL_ENV: "preview" }));
  check("3b preview flag, no firebase config -> throws (no prod fallback)", !!msg, msg || "(no throw)");
}
// 4) Never silently selects production once env-driven: incomplete config throws, does not return prod.
{
  const partial: Record<string, string> = { ...FB };
  delete partial.NEXT_PUBLIC_FIREBASE_PROJECT_ID; // removes the trigger too
  // Only trigger via the preview flag so it stays env-driven but incomplete.
  const msg = throwsWith(() => selectFirebaseConfig({ ...partial, NEXT_PUBLIC_VERCEL_ENV: "preview" }));
  check("4 env-driven cannot fall back to production (throws)", !!msg, msg || "(no throw)");
}
// 4b) No accidental trigger: a single stray non-project var does NOT force env-mode.
{
  const cfg = selectFirebaseConfig({ NEXT_PUBLIC_FIREBASE_API_KEY: "stray" });
  check("4b single stray non-project var -> stays production (no false trigger)",
    cfg.projectId === "yogi-mart", `projectId=${cfg.projectId}`);
}

// 5) Razorpay: preview + rzp_test_ -> accepted.
check("5 razorpay preview test key -> accepted",
  throwsWith(() => assertRazorpayTestKeyInPreview({ VERCEL_ENV: "preview", RAZORPAY_KEY_ID: "rzp_test_ABC" })) === null);
// 6) Razorpay: preview + rzp_live_ -> rejected.
{
  const msg = throwsWith(() => assertRazorpayTestKeyInPreview({ VERCEL_ENV: "preview", RAZORPAY_KEY_ID: "rzp_live_ABC" }));
  check("6 razorpay preview LIVE key -> rejected", !!msg && msg.includes("rzp_test_"), msg || "(no throw)");
}
// 7) Razorpay: production LIVE key -> accepted (unchanged).
check("7 razorpay production LIVE key -> accepted (unchanged)",
  throwsWith(() => assertRazorpayTestKeyInPreview({ VERCEL_ENV: "production", RAZORPAY_KEY_ID: "rzp_live_ABC" })) === null);

// 8) Every server Razorpay client is guarded BEFORE construction.
{
  const files = [
    "app/api/create-order/route.ts",
    "app/api/verify-payments/route.ts",
    "app/api/mobile/create-payment-order/route.ts",
    "lib/razorpayVerify.ts",
  ];
  let allGuarded = true;
  const details: string[] = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    const g = src.indexOf("assertRazorpayTestKeyInPreview()");
    const r = src.indexOf("new Razorpay(");
    const ok = g !== -1 && r !== -1 && g < r;
    if (!ok) { allGuarded = false; details.push(`${rel}(guard=${g},razorpay=${r})`); }
  }
  check("8 all server Razorpay clients guarded before construction", allGuarded, details.join("; "));
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exitCode = 1;
