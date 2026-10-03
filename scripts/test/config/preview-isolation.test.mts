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

// ---- L8: local development must never silently use production ----
// 4c) `next dev` with nothing configured -> throws (no silent production).
{
  const msg = throwsWith(() => selectFirebaseConfig({ NODE_ENV: "development" }));
  check("4c local dev, nothing configured -> throws (no silent production)",
    !!msg && msg.includes("NEXT_PUBLIC_USE_FIREBASE_EMULATORS"), msg || "(no throw)");
}
// 4d) `next dev` with explicit production opt-in -> production (deliberate only).
{
  const cfg = selectFirebaseConfig({ NODE_ENV: "development", NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV: "true" });
  check("4d local dev + explicit opt-in -> production", cfg.projectId === "yogi-mart");
}
// 4e) `next dev` with a development project -> that project.
{
  const cfg = selectFirebaseConfig({ ...FB, NODE_ENV: "development" });
  check("4e local dev + development project -> dev project", cfg.projectId === "yogi-mart-test");
}
// 4f) `next dev` naming the PRODUCTION project id via env -> throws without opt-in.
{
  const msg = throwsWith(() => selectFirebaseConfig({ ...FB, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "yogi-mart", NODE_ENV: "development" }));
  check("4f local dev + env names production project -> throws", !!msg, msg || "(no throw)");
}
// 4g) Emulator mode -> demo project with inert placeholders, nothing production.
{
  const cfg = selectFirebaseConfig({ NODE_ENV: "development", NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-yomico-local" });
  const values = Object.values(cfg).join("|");
  check("4g emulator mode -> demo project, no production values",
    cfg.projectId === "demo-yomico-local" &&
      !values.includes(PRODUCTION_FIREBASE_CONFIG.apiKey) &&
      !values.includes("yogi-mart.") && !values.includes(PRODUCTION_FIREBASE_CONFIG.appId),
    `projectId=${cfg.projectId}`);
}
// 4h) Emulator mode with a real project id -> throws.
{
  const msg = throwsWith(() => selectFirebaseConfig({ NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "yogi-mart" }));
  check("4h emulator mode + real project -> throws", !!msg && msg.includes("demo-"), msg || "(no throw)");
}
// 4i) Production build (NODE_ENV=production) -> production, unchanged.
{
  const cfg = selectFirebaseConfig({ NODE_ENV: "production" });
  check("4i production build -> production project unchanged", cfg === PRODUCTION_FIREBASE_CONFIG);
}
// 4j) Local dev + LIVE Razorpay key -> rejected; test key accepted; explicit opt-out allowed.
{
  const live = throwsWith(() => assertRazorpayTestKeyInPreview({ NODE_ENV: "development", RAZORPAY_KEY_ID: "rzp_live_ABC" }));
  const test = throwsWith(() => assertRazorpayTestKeyInPreview({ NODE_ENV: "development", RAZORPAY_KEY_ID: "rzp_test_ABC" }));
  const optOut = throwsWith(() => assertRazorpayTestKeyInPreview({ NODE_ENV: "development", RAZORPAY_KEY_ID: "rzp_live_ABC", ALLOW_LIVE_RAZORPAY_IN_DEV: "true" }));
  check("4j local dev LIVE razorpay rejected, test accepted, opt-out explicit",
    !!live && test === null && optOut === null, live || "(no throw)");
}
// 4k) The browser bundle reads NODE_ENV and the selectors through literal references.
{
  const src = fs.readFileSync(path.join(REPO, "lib/firebaseConfig.ts"), "utf8");
  const ok = ["process.env.NODE_ENV", "process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS",
    "process.env.NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV"].every((s) => src.includes(s));
  check("4k selectors read via literal process.env references (inlined in browser)", ok);
}
// 4l) Admin SDK refuses the production service account under `next dev`.
{
  const src = fs.readFileSync(path.join(REPO, "lib/firebaseAdmin.ts"), "utf8");
  const guard = src.indexOf("assertNotProductionInLocalDev(serviceProjectId)");
  const init = src.indexOf("initializeApp({ credential: cert(serviceAccount) }");
  check("4l admin SDK guards production service account before init in local dev", guard !== -1 && init !== -1 && guard < init);
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
    "lib/refunds/orderRefund.ts",
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
