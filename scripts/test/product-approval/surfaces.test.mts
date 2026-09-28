/*
 * LOCAL UNIT + SOURCE TEST — customer-facing product surfaces use the canonical
 * visibility rule. No Firebase, no network.
 *
 *  - The rule itself (lib/products/visibility.ts): pending / rejected /
 *    blocked are hidden; legacy (no approvalStatus) and approved+active are
 *    visible.
 *  - Search autocomplete (components/Navbar.tsx, components/Header.tsx) skips
 *    any product that fails isProductVisible BEFORE it is added to the list it
 *    renders. These are client components with no component-test harness in
 *    this repo, so the guard is asserted on the source (same approach as
 *    scripts/test/config/preview-isolation.test.mts check 8), and the filter
 *    expression is then exercised against real product shapes.
 *  - The public seller storefront is server-rendered (31c300d): the old
 *    /seller/[id] page only redirects to /store/[id], which loads through
 *    lib/storefront/storefrontServer.loadPublicStorefront, and every product
 *    card is built by lib/storefront/publicStorefront.toStorefrontProduct,
 *    which returns null for any product failing isProductVisible. The
 *    architecture is asserted on the source and buildStorefront is run against
 *    the same product shapes.
 *
 * Run: npx tsx scripts/test/product-approval/surfaces.test.mts
 */
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

// ---- each surface: import + guard placed before the list push ----
type Surface = { id: string; file: string; loop: string; push: string };
const surfaces: Surface[] = [
  { id: "A-C Navbar autocomplete", file: "components/Navbar.tsx", loop: "snapshot.forEach((doc) => {", push: "items.push(" },
  { id: "D Header autocomplete", file: "components/Header.tsx", loop: "snapshot.forEach((doc) => {", push: "items.push(" },
];
for (const s of surfaces) {
  const src = fs.readFileSync(path.join(REPO, s.file), "utf8");
  const imported = /import \{ isProductVisible \} from "@\/lib\/products\/visibility";/.test(src);
  const loopAt = src.indexOf(s.loop);
  const guardAt = src.indexOf("if (!isProductVisible(", loopAt);
  const pushAt = src.indexOf(s.push, loopAt);
  const guardedBeforePush = loopAt !== -1 && guardAt !== -1 && pushAt !== -1 && guardAt < pushAt;
  // Exactly one products loop in the file, so the guard cannot sit on a different one.
  const loops = src.split(s.loop).length - 1;
  check(`${s.id}: imports the canonical helper and skips hidden products before adding them`,
    imported && guardedBeforePush && loops === 1,
    `imported=${imported} loop@${loopAt} guard@${guardAt} push@${pushAt} loops=${loops}`);
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
if (fail > 0) process.exitCode = 1;
