/*
 * LOCAL UNIT + SOURCE TEST — customer-facing product surfaces use the canonical
 * visibility rule. No Firebase, no network.
 *
 *  - The rule itself (lib/products/visibility.ts): pending / rejected /
 *    blocked are hidden; legacy (no approvalStatus) and approved+active are
 *    visible.
 *  - Search autocomplete (components/Navbar.tsx, components/Header.tsx) and
 *    the public seller storefront (app/seller/[id]/page.tsx) skip any product
 *    that fails isProductVisible BEFORE it is added to the list they render.
 *    These are client components with no component-test harness in this repo,
 *    so the guard is asserted on the source (same approach as
 *    scripts/test/config/preview-isolation.test.mts check 8), and the filter
 *    expression is then exercised against real product shapes.
 *
 * Run: npx tsx scripts/test/product-approval/surfaces.test.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProductVisible } from "../../../lib/products/visibility.ts";

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
  { id: "F-H public seller storefront", file: "app/seller/[id]/page.tsx", loop: "productSnap.forEach((docSnap) => {", push: "items.push(" },
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

// ---- the guard's effect on a mixed catalog ----
{
  const shown = visibleNames();
  const expected = ["approved", "legacy", "legacyNoActive"];
  check("A-I filtering a mixed catalog keeps legacy + approved, drops pending/rejected/blocked",
    JSON.stringify(shown) === JSON.stringify(expected), `shown=${shown.join(",")}`);
}

console.log(`\n${pass}/${pass + fail} surface visibility checks passed`);
if (fail > 0) process.exitCode = 1;
