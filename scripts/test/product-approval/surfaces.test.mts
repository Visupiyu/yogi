/*
 * LOCAL UNIT + SOURCE TEST — customer-facing product surfaces use the canonical
 * visibility rule. No Firebase, no network.
 *
 *  - The rule itself (lib/products/visibility.ts): pending / rejected /
 *    blocked are hidden; legacy (no approvalStatus) and approved+active are
 *    visible.
 *  - Search (app/search) and the Navbar's search suggestions read the catalog
 *    ONLY through lib/storefront/catalogScan.getVisibleCatalog, which drops
 *    every product failing the visibility rule. This is tested by BEHAVIOUR:
 *    a mixed catalog is seeded in the Firestore EMULATOR and the real
 *    getVisibleCatalog (browser SDK, real firestore.rules) is called, then the
 *    real search ranking is run over its result. (The old components/Header.tsx
 *    autocomplete no longer exists.)
 *  - The public seller storefront is server-rendered (31c300d): the old
 *    /seller/[id] page only redirects to /store/[id], which loads through
 *    lib/storefront/storefrontServer.loadPublicStorefront, and every product
 *    card is built by lib/storefront/publicStorefront.toStorefrontProduct,
 *    which returns null for any product failing isProductVisible. The
 *    architecture is asserted on the source and buildStorefront is run against
 *    the same product shapes.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST from `firebase emulators:exec`);
 * never touches production.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/product-approval/surfaces.test.mts"
 */
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}
// The browser Firebase module (lib/firebase.ts) must connect to the EMULATOR:
// set emulator mode with the demo project BEFORE it is imported (without
// these it would select the production config).
const PROJECT_ID = "demo-yomico-test";
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProductVisible } from "../../../lib/products/visibility.ts";
import { buildStorefront } from "../../../lib/storefront/publicStorefront.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (ok) pass++; else fail++;
}

const PRODUCTS: Record<string, Record<string, unknown>> = {
  legacy: { title: "Legacy Lamp", approved: false, active: true, stock: 5 },
  legacyNoActive: { title: "Legacy No Active", stock: 5 },
  approved: { title: "Approved Heater", approvalStatus: "approved", approved: true, active: true, stock: 5 },
  pending: { title: "Pending Kettle", approvalStatus: "pending", approved: false, active: false, stock: 5 },
  rejected: { title: "Rejected Fan", approvalStatus: "rejected", approved: false, active: false, rejectionReason: "x", stock: 5 },
  blocked: { title: "Blocked Mixer", approvalStatus: "approved", approved: true, active: false, stock: 5 },
  legacyBlocked: { title: "Legacy Blocked", approved: false, active: false, stock: 5 },
};
const visibleNames = () => Object.entries(PRODUCTS).filter(([, p]) => isProductVisible(p)).map(([k]) => k).sort();

// ---- the rule (J) ----
check("J/E legacy product (no approvalStatus, active) is eligible", isProductVisible(PRODUCTS.legacy) && isProductVisible(PRODUCTS.legacyNoActive));
check("I approved + active product is eligible", isProductVisible(PRODUCTS.approved));
check("J pending / rejected / blocked / legacy-blocked are NOT eligible",
  [PRODUCTS.pending, PRODUCTS.rejected, PRODUCTS.blocked, PRODUCTS.legacyBlocked].every((p) => !isProductVisible(p)));

// ---- A-D search + Navbar suggestions: the real catalog read, on the emulator ----
{
  const { initializeTestEnvironment } = await import("@firebase/rules-unit-testing");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host, port: Number(port) },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [id, data] of Object.entries(PRODUCTS)) await ctx.firestore().doc(`products/${id}`).set(data);
  });

  const { getVisibleCatalog } = await import("../../../lib/storefront/catalogScan.ts");
  const { rankProducts } = await import("../../../lib/storefront/searchRelevance.ts");
  const scan = await getVisibleCatalog();
  const ids = scan.products.map((p) => p.id).sort();
  check("A-B the catalog read used by search and Navbar suggestions returns legacy + approved only (pending / rejected / blocked dropped)",
    JSON.stringify(ids) === JSON.stringify(["approved", "legacy", "legacyNoActive"]) && scan.truncated === false, `got=${ids.join(",")}`);

  // A query matching EVERY product's name: hidden ones still never appear.
  const suggestions = rankProducts(scan.products, "e").map((p) => p.id).sort();
  check("C a search that matches every product name only ever offers visible products",
    suggestions.length > 0 && suggestions.every((id) => ["approved", "legacy", "legacyNoActive"].includes(id)), `got=${suggestions.join(",")}`);

  // The Navbar suggestions get products only from this read. The search page
  // uses it for text search; its one direct query (exact category browse)
  // filters every document with the same visibility rule before showing it.
  const src = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");
  const directRead = /collection\(db,\s*["']products["']\)/;
  const navbar = src("components/Navbar.tsx");
  check("D1 the Navbar suggestions read products only through getVisibleCatalog",
    navbar.includes("getVisibleCatalog(") && !directRead.test(navbar));
  const search = src("app/search/page.jsx");
  const queryAt = search.search(directRead);
  const guardAt = search.indexOf("if (!isStorefrontVisible(data)) return;", queryAt);
  const pushAt = search.indexOf("items.push(", queryAt);
  check("D2 the search page uses getVisibleCatalog for text search, and its category query skips hidden products before listing them",
    search.includes("getVisibleCatalog(") && (search.match(new RegExp(directRead.source, "g")) || []).length === 1 &&
      queryAt !== -1 && guardAt !== -1 && pushAt !== -1 && guardAt < pushAt,
    `query@${queryAt} guard@${guardAt} push@${pushAt}`);

  await env.cleanup();
}

// ---- F-H public seller storefront: server-rendered /store/[id] ----
{
  const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");
  const clientFirestore = /from\s+["']firebase\/firestore["']/;
  const clientComponent = /^\s*["']use client["']/m;

  // The old public page no longer reads anything: it only redirects.
  const legacy = read("app/seller/[id]/page.tsx");
  check("F-H1 /seller/[id] only redirects to /store/[id] — no browser-side product reads left",
    /redirect\(`\/store\/\$\{encodeURIComponent\(id\)\}`\)/.test(legacy) &&
      !clientComponent.test(legacy) && !clientFirestore.test(legacy) && !legacy.includes("products"),
    `redirect=${legacy.includes("redirect(")} useClient=${clientComponent.test(legacy)} firestore=${clientFirestore.test(legacy)}`);

  // The storefront page is a server component that loads through the one server loader.
  const store = read("app/store/[id]/page.tsx");
  check("F-H2 /store/[id] is a server component loading via loadPublicStorefront (Admin SDK), with no client Firestore reads",
    !clientComponent.test(store) && !clientFirestore.test(store) &&
      /import \{ loadPublicStorefront \} from "@\/lib\/storefront\/storefrontServer";/.test(store) &&
      store.includes("loadPublicStorefront(getAdminDb(), id)"),
    `useClient=${clientComponent.test(store)} firestore=${clientFirestore.test(store)}`);

  // The loader hands every product to buildStorefront, whose cards come only
  // from toStorefrontProduct — which rejects hidden products first.
  const loader = read("lib/storefront/storefrontServer.ts");
  const builder = read("lib/storefront/publicStorefront.ts");
  const fnAt = builder.indexOf("export function toStorefrontProduct(");
  const guardAt = builder.indexOf("if (!isProductVisible(data)) return null;", fnAt);
  const returnAt = builder.indexOf("return {", fnAt);
  check("F-H3 the storefront's product cards are built only by toStorefrontProduct, which skips hidden products before building the card",
    /import \{ isProductVisible \} from "@\/lib\/products\/visibility";/.test(builder) &&
      fnAt !== -1 && guardAt !== -1 && returnAt !== -1 && guardAt < returnAt &&
      /\.map\(\(p\) => toStorefrontProduct\(p\.id, p\.data\)\)\s*\.filter\(/.test(builder) &&
      /buildStorefront\(\{ vendor, publicProfile, products \}\)/.test(loader),
    `fn@${fnAt} guard@${guardAt} return@${returnAt}`);

  // And the real builder, on the same mixed catalog.
  const storefront = buildStorefront({
    vendor: { businessName: "Test Store", status: "Approved" },
    products: Object.entries(PRODUCTS).map(([id, data]) => ({ id, data })),
  });
  const shown = storefront.products.map((p) => p.id).sort();
  check("F-H4 buildStorefront on a mixed catalog shows legacy + approved only (pending / rejected / blocked dropped)",
    JSON.stringify(shown) === JSON.stringify(["approved", "legacy", "legacyNoActive"]), `shown=${shown.join(",")}`);
}

// ---- the guard's effect on a mixed catalog ----
{
  const shown = visibleNames();
  const expected = ["approved", "legacy", "legacyNoActive"];
  check("A-I filtering a mixed catalog keeps legacy + approved, drops pending/rejected/blocked",
    JSON.stringify(shown) === JSON.stringify(expected), `shown=${shown.join(",")}`);
}

console.log(`\n${pass}/${pass + fail} surface visibility checks passed`);
// The browser SDK keeps its emulator connection open; exit explicitly.
process.exit(fail > 0 ? 1 : 0);
