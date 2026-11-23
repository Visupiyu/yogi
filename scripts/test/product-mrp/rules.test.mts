/*
 * LOCAL-ONLY Firestore RULES test (emulator) — F-14: product MRP / discount /
 * cost price cannot be written directly by a seller.
 *
 * sellingPrice, price, variants, stock and GST were already server-only for
 * sellers (app/api/seller/create-product, update-product). mrp, discount and
 * costPrice were still in the owner direct-write list, and isValidProduct()
 * never looked at them, so on ANY product — approved and live included — a
 * seller's SDK write could set an MRP below the price, an inflated MRP (a fake
 * "99% off" badge), a negative or non-numeric MRP, any discount figure, or a
 * negative cost price, with no re-review. Those three fields are now frozen
 * for direct seller writes like the other money fields: they change only
 * through update-product, which validates them (lib/products/
 * sellerProductValidation.ts) and derives discount itself.
 *
 * Proves: every such write is DENIED on approved, pending and legacy-live
 * products (single-field and whole-document saves); the non-money listing
 * fields a seller may still edit directly stay ALLOWED; admin's direct write is
 * unchanged; another seller and a stranger stay denied; the view counter still
 * works.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/product-mrp/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostPort)) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not a local emulator. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const [host, port] = hostPort.split(":");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// RULES_FILE lets the reproduction run point this suite at an older rules file.
const RULES_FILE = process.env.RULES_FILE || path.join(REPO, "firestore.rules");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-test",
  firestore: { rules: fs.readFileSync(RULES_FILE, "utf8"), host, port: Number(port) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message.split("\n")[0]}`); fail++; }
}

const SELLER = "seller_mrp_a";
const OTHER = "seller_mrp_b";
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const owner = (id: string) => doc(as(SELLER), "products", id);

const BASE = {
  vendorId: SELLER, title: "MRP Lamp", sellingPrice: 599, mrp: 799, discount: 25, costPrice: 300,
  stock: 10, sales: 0, gstRate: 12, views: 0, warranty: "", sku: "MRP-1",
  categoryId: "HOME", subCategoryId: "", leafCategoryId: "",
};
const PRODUCTS: Record<string, Record<string, unknown>> = {
  p_live: { ...BASE, approvalStatus: "approved", approved: true, active: true, featured: false },
  p_pending: { ...BASE, approvalStatus: "pending", approved: false, active: false, featured: false },
  p_legacy: { ...BASE, approved: true, active: true, featured: false }, // no approvalStatus: legacy live
};
async function reseed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [id, data] of Object.entries(PRODUCTS)) await setDoc(doc(ctx.firestore(), "products", id), data);
  });
}
async function stored(id: string) {
  let d: Record<string, unknown> = {};
  await env.withSecurityRulesDisabled(async (ctx) => { d = (await getDoc(doc(ctx.firestore(), "products", id))).data() || {}; });
  return d;
}

await env.clearFirestore();
await reseed();

// ---------- the old bypass: direct MRP / discount / costPrice writes ----------
const MONEY_WRITES: [string, Record<string, unknown>][] = [
  ["valid-looking mrp 899", { mrp: 899 }],
  ["mrp below sellingPrice (100 < 599)", { mrp: 100 }],
  ["inflated mrp 99999 (fake discount)", { mrp: 99999 }],
  ["negative mrp", { mrp: -5 }],
  ["non-numeric mrp", { mrp: "abc" }],
  ["mrp removed (null)", { mrp: null }],
  ["discount 95 (inconsistent)", { discount: 95 }],
  ["negative discount", { discount: -50 }],
  ["non-numeric discount", { discount: "huge" }],
  ["costPrice -1", { costPrice: -1 }],
  ["costPrice string", { costPrice: "x" }],
];
for (const id of ["p_live", "p_pending", "p_legacy"]) {
  for (const [label, change] of MONEY_WRITES) {
    await check(`D1 ${id}: seller direct write of ${label} DENIED`, () => assertFails(updateDoc(owner(id), change)));
  }
}
await check("D2 approved: whole-document save that changes mrp (and discount) DENIED", async () => {
  const d = await stored("p_live");
  await assertFails(setDoc(owner("p_live"), { ...d, mrp: 99999, discount: 99 }));
});
await check("D3 nothing above reached the stored product (mrp 799, discount 25, costPrice 300 on all three)", async () => {
  for (const id of ["p_live", "p_pending", "p_legacy"]) {
    const d = await stored(id);
    if (d.mrp !== 799 || d.discount !== 25 || d.costPrice !== 300) throw new Error(`${id}: ${JSON.stringify({ mrp: d.mrp, discount: d.discount, costPrice: d.costPrice })}`);
  }
});

// ---------- existing money freeze unchanged ----------
await check("F1 sellingPrice / price / variants / stock still DENIED for direct seller writes", async () => {
  await assertFails(updateDoc(owner("p_live"), { sellingPrice: 799 }));
  await assertFails(updateDoc(owner("p_live"), { price: 799 }));
  await assertFails(updateDoc(owner("p_live"), { variants: [{ id: "v", price: 5000, stock: 1 }] }));
  await assertFails(updateDoc(owner("p_live"), { stock: 99 }));
});

// ---------- legitimate direct seller edits still work ----------
await check("L1 approved: non-money, non-reviewed listing fields (warranty, sku, returnDays) still ALLOWED", () =>
  assertSucceeds(updateDoc(owner("p_live"), { warranty: "1 year", sku: "MRP-2", returnDays: 10 })));
await check("L2 approved: whole-document save with mrp / discount / costPrice UNCHANGED still ALLOWED", async () => {
  const d = await stored("p_live");
  await assertSucceeds(setDoc(owner("p_live"), { ...d, warranty: "2 years" }));
});
await check("L3 pending: seller may still edit title / description directly", () =>
  assertSucceeds(updateDoc(owner("p_pending"), { title: "MRP Lamp v2", description: "d2" })));
await check("L4 any signed-in visitor: view counter +1 still ALLOWED", async () => {
  const d = await stored("p_live");
  await assertSucceeds(updateDoc(doc(as("visitor_mrp"), "products", "p_live"), { views: Number(d.views) + 1 }));
});

// ---------- isolation and admin unchanged ----------
await check("I1 another seller and a stranger cannot write mrp / discount", async () => {
  await assertFails(updateDoc(doc(as(OTHER), "products", "p_live"), { mrp: 999 }));
  await assertFails(updateDoc(doc(as("stranger_mrp"), "products", "p_live"), { discount: 10 }));
  await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), "products", "p_live"), { mrp: 999 }));
});
await check("A1 admin direct write of mrp / discount / costPrice unchanged (still ALLOWED)", () =>
  assertSucceeds(updateDoc(doc(as("admin_mrp", ADMIN_EMAIL), "products", "p_live"), { mrp: 999, discount: 40, costPrice: 350 })));

await env.clearFirestore();
await env.cleanup();
console.log(`\n${pass}/${pass + fail} product MRP rules checks passed`);
process.exit(fail ? 1 : 0);
