/*
 * LOCAL-ONLY emulator regression harness — homepage product sections
 * (lib/storefront/homeSections.ts, lib/storefront/catalogScan.ts and the
 * homepage components that use them).
 * ---------------------------------------------------------------------------
 * Proves an UNAVAILABLE Firestore is reported as an error, never as an empty
 * catalogue, and that a genuinely empty or populated catalogue is reported as
 * such:
 *
 *   U  Firestore unreachable: every homepage loader REJECTS ("unavailable")
 *      instead of resolving empty. (Control: plain getDocs resolves EMPTY from
 *      the memory cache in the same situation — the behaviour that hid an
 *      outage behind the "no products yet" empty states.)
 *   R  Retry: once Firestore is reachable, the SAME client's next call
 *      succeeds, and the failed catalog scan was not cached as empty.
 *   E  Empty catalogue: loaders resolve empty; Best Deals does not qualify.
 *   P  Products (all under 40% off): sections populate, hidden products are
 *      excluded, Best Deals still does not qualify.
 *   D  Best Deals qualifies only for a VISIBLE product at >= 40% off MRP
 *      (39% does not; a hidden 60% product does not).
 *   S  Source: the homepage components use these loaders, hide when empty,
 *      keep their error/Retry states, and PromoBanner honours reduced motion.
 *
 * It manages its own Firestore emulator (demo-* project, the repo's real
 * firestore.rules via firebase.json) because U→R needs the backend to go
 * from unreachable to reachable under one running client — which
 * `firebase emulators:exec` cannot do. Never touches a real project.
 *
 * Run:
 *   npx tsx scripts/test/home-sections/run.mts
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PROJECT_ID = "demo-yomico-home";
const HOST = "127.0.0.1";
const PORT = 8080; // lib/firebase.ts connects the emulator here (firebase.json pins it)

function portOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(PORT, HOST);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

if (await portOpen()) {
  console.error(`REFUSING TO RUN: something already listens on ${HOST}:${PORT}; the "unreachable" phase needs it free.`);
  process.exit(2);
}

// The browser Firebase module must target the emulator with a demo project
// BEFORE it is imported (otherwise it would select the production config).
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;

// The repo's .ts modules load firebase/firestore's CommonJS build; load the
// same instance here.
const { collection, getDocs, setLogLevel } = createRequire(import.meta.url)("firebase/firestore");
setLogLevel("silent"); // the unreachable phase is expected to log transport errors
const { db } = await import("../../../lib/firebase.ts");
const home = await import("../../../lib/storefront/homeSections.ts");
const { getVisibleCatalog } = await import("../../../lib/storefront/catalogScan.ts");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (ok) pass++; else fail++;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; code: string };
async function outcome<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, code: String((e as { code?: unknown })?.code ?? e) }; }
}

const LOADERS: [string, () => Promise<unknown>][] = [
  ["Trending", () => home.fetchTrendingProducts()],
  ["Best Sellers", () => home.fetchBestSellers()],
  ["Featured", () => home.fetchFeaturedProducts()],
  ["Recommended/Collection (Electronics)", () => home.fetchCategoryProducts("Electronics", 12)],
  ["catalog scan (category rows, search, Navbar)", () => getVisibleCatalog()],
  ["Best Deals availability", () => home.fetchHasQualifyingDeals()],
];

// catalogScan caches a SUCCESSFUL scan for 2 minutes. Each phase below
// changes the data, so advance the clock past that window between phases
// rather than wait it out.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const expireCatalogCache = () => { clockOffset += 3 * 60 * 1000; };

let emulator: ChildProcess | null = null;
function stopEmulator() {
  if (!emulator?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(emulator.pid), "/T", "/F"]);
  else { try { process.kill(-emulator.pid, "SIGINT"); } catch {} }
  emulator = null;
}
process.on("exit", stopEmulator);

const docsUrl = `http://${HOST}:${PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
// "Bearer owner" is the emulator's rules-bypass credential for seeding.
async function seed(id: string, fields: Record<string, unknown>) {
  const toValue = (v: unknown): Record<string, unknown> =>
    typeof v === "boolean" ? { booleanValue: v }
    : typeof v === "number" ? { integerValue: String(v) }
    : v instanceof Date ? { timestampValue: v.toISOString() }
    : { stringValue: String(v) };
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) };
  const res = await fetch(`${docsUrl}/products/${id}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`seed ${id} failed: ${res.status}`);
}
// Clearly-labelled test products; prices are arbitrary test values.
const testProduct = (id: string, mrp: number, price: number, extra: Record<string, unknown> = {}) =>
  seed(id, {
    title: `TEST PRODUCT ${id}`, categoryId: "ELECTRONICS", mrp, sellingPrice: price, stock: 5,
    sales: 1, views: 1, approvalStatus: "approved", active: true, vendorId: "test-vendor",
    createdAt: new Date("2026-01-01T00:00:00Z"), ...extra,
  });

try {
  // ---- U: unreachable ----
  {
    type Snapshot = { size: number; metadata: { fromCache: boolean } };
    const control = await outcome<Snapshot>(() => getDocs(collection(db, "products")));
    check("U control: plain getDocs RESOLVES empty from cache when Firestore is unreachable (the masking behaviour)",
      control.ok && control.value.size === 0 && control.value.metadata.fromCache === true,
      control.ok ? `size=${control.value.size} fromCache=${control.value.metadata.fromCache}` : `rejected ${control.code}`);
    for (const [name, load] of LOADERS) {
      const r = await outcome(load);
      check(`U ${name}: rejects instead of resolving empty`, !r.ok && r.code === "unavailable",
        r.ok ? `resolved ${JSON.stringify(r.value).slice(0, 40)}` : `code=${r.code}`);
    }
  }

  // ---- R: Firestore becomes reachable; the same client recovers on retry ----
  emulator = spawn("npx", ["firebase", "emulators:start", "--only", "firestore", "--project", PROJECT_ID], {
    cwd: REPO, stdio: "ignore", detached: process.platform !== "win32", shell: process.platform === "win32",
  });
  const started = realNow();
  while (!(await portOpen())) {
    if (realNow() - started > 120_000) throw new Error("emulator did not start within 120s");
    await new Promise((r) => setTimeout(r, 500));
  }
  let recovered: Outcome<unknown> = { ok: false, code: "not tried" };
  const retryStart = realNow();
  while (realNow() - retryStart < 60_000) {
    recovered = await outcome(() => home.fetchTrendingProducts());
    if (recovered.ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  check("R retry: the same client's next call succeeds once Firestore is reachable", recovered.ok,
    recovered.ok ? `after ${((realNow() - retryStart) / 1000).toFixed(1)}s of retries` : `still ${recovered.code}`);

  // ---- E: empty catalogue ----
  {
    const scan = await outcome(() => getVisibleCatalog());
    check("R/E catalog scan was not cached as empty during the outage — it now reads the (empty) server",
      scan.ok && scan.value.products.length === 0);
    const results = await Promise.all(LOADERS.slice(0, 4).map(([, load]) => outcome(load)));
    check("E empty catalogue: Trending, Best Sellers, Featured and category loaders resolve to []",
      results.every((r) => r.ok && Array.isArray(r.value) && r.value.length === 0));
    const deals = await outcome(() => home.fetchHasQualifyingDeals());
    check("E empty catalogue: Best Deals does not qualify", deals.ok && deals.value === false);
  }

  // ---- P: products, none at 40%+ ----
  await testProduct("p-ten", 1000, 900, { sales: 9, views: 50 });   // 10% off
  await testProduct("p-twenty", 500, 400, { sales: 3, views: 20 }); // 20% off
  await testProduct("p-pending", 1000, 400, { approvalStatus: "pending", active: false, sales: 99, views: 99 });
  expireCatalogCache();
  {
    const ids = (v: unknown) => (v as { id: string }[]).map((p) => p.id).sort().join(",");
    const trending = await outcome(() => home.fetchTrendingProducts());
    const best = await outcome(() => home.fetchBestSellers());
    const featured = await outcome(() => home.fetchFeaturedProducts());
    const cat = await outcome(() => home.fetchCategoryProducts("Electronics", 12));
    const want = "p-ten,p-twenty";
    check("P Trending lists the visible products (pending excluded)", trending.ok && ids(trending.value) === want, trending.ok ? ids(trending.value) : trending.code);
    check("P Best Sellers lists the visible products", best.ok && ids(best.value) === want, best.ok ? ids(best.value) : best.code);
    check("P Featured falls back to the visible in-stock products", featured.ok && ids(featured.value) === want, featured.ok ? ids(featured.value) : featured.code);
    check("P category loader lists the visible Electronics products", cat.ok && ids(cat.value) === want, cat.ok ? ids(cat.value) : cat.code);
    const deals = await outcome(() => home.fetchHasQualifyingDeals());
    check("P no product at 40%+ (a hidden 60%-off product does not count): Best Deals does not qualify", deals.ok && deals.value === false);
  }

  // ---- D: the 40% boundary ----
  await testProduct("d-thirtynine", 1000, 610); // 39% off
  expireCatalogCache();
  {
    const deals = await outcome(() => home.fetchHasQualifyingDeals());
    check("D 39% off does not qualify", deals.ok && deals.value === false);
  }
  await testProduct("d-forty", 1000, 600); // exactly 40% off
  expireCatalogCache();
  {
    const deals = await outcome(() => home.fetchHasQualifyingDeals());
    check("D a visible product at exactly 40% off qualifies: Best Deals shows", deals.ok && deals.value === true);
    check("D Best Deals links to the same threshold it checks", home.DEALS_HREF === `/search?minDiscount=${home.DEALS_MIN_DISCOUNT}` && home.DEALS_MIN_DISCOUNT === 40);
  }
} catch (e) {
  check("harness ran to completion", false, e instanceof Error ? e.message : String(e));
} finally {
  stopEmulator();
}

// ---- S: source wiring of the components that render these results ----
{
  const src = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");
  const sections: [string, string][] = [
    ["components/TrendingProducts.jsx", "fetchTrendingProducts"],
    ["components/BestSellers.jsx", "fetchBestSellers"],
    ["components/home/FeaturedProducts.tsx", "fetchFeaturedProducts"],
    ["components/RecommendedProducts.jsx", "fetchCategoryProducts"],
    ["components/home/CollectionStrip.jsx", "fetchCategoryProducts"],
    ["components/home/FlashSale.jsx", "fetchHasQualifyingDeals"],
  ];
  for (const [file, loader] of sections) {
    const s = src(file);
    check(`S ${file} loads through ${loader} and makes no direct getDocs read`,
      s.includes(loader) && !/\bgetDocs\s*\(/.test(s));
  }
  for (const file of ["components/TrendingProducts.jsx", "components/BestSellers.jsx", "components/home/FeaturedProducts.tsx", "components/RecommendedProducts.jsx"]) {
    const s = src(file);
    check(`S ${file} hides when empty and keeps its error/Retry state`, /return null/.test(s) && /Retry/.test(s));
  }
  check("S FlashSale renders nothing unless a deal qualifies", /if \(!hasDeals\) return null/.test(src("components/home/FlashSale.jsx")));
  check("S catalogScan reads pages from the server", /getDocsFromServer\(/.test(src("lib/storefront/catalogScan.ts")) && !/\bgetDocs\s*\(/.test(src("lib/storefront/catalogScan.ts")));
  const promo = src("components/home/PromoBanner.jsx");
  check("S PromoBanner disables the floating animation under prefers-reduced-motion",
    /useReducedMotion\(\)/.test(promo) && /animate=\{reduceMotion \? undefined : \{ y: \[0, -10, 0\] \}\}/.test(promo));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
