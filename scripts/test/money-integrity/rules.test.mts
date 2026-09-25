/*
 * LOCAL-ONLY Firestore RULES test (emulator) — L4 seller price hardening.
 * Proves a seller cannot bypass /api/seller/update-product by writing price,
 * stock, variants or GST fields directly with the client SDK, while ordinary
 * non-money seller edits and the existing customer stock-transfer rule keep
 * working. Loads the repository's firestore.rules into the emulator.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/money-integrity/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const [host, port] = hostPort.split(":");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-test",
  firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host, port: Number(port) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const SELLER = "seller_rules_1";
const PRODUCT = {
  vendorId: SELLER, title: "Rules Lamp", sellingPrice: 499, mrp: 799, stock: 7, sales: 0,
  gstRate: 12, approved: true, active: true, featured: false,
  variants: [{ id: "v1", attributes: { Color: "Red" }, stock: 7, price: 0 }],
};

async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "products", "p_rules"), PRODUCT);
  });
}

const seller = () => doc(env.authenticatedContext(SELLER).firestore(), "products", "p_rules");

await reseed();
await check("seller direct write: negative sellingPrice DENIED", () => assertFails(updateDoc(seller(), { sellingPrice: -1 })));
await check("seller direct write: valid sellingPrice change DENIED (must use the server route)", () => assertFails(updateDoc(seller(), { sellingPrice: 450 })));
await check("seller direct write: legacy price field DENIED", () => assertFails(updateDoc(seller(), { price: -1 })));
await check("seller direct write: variants (price) DENIED", () =>
  assertFails(updateDoc(seller(), { variants: [{ id: "v1", attributes: { Color: "Red" }, stock: 7, price: -5 }] })));
await check("seller direct write: variants (fractional stock) DENIED", () =>
  assertFails(updateDoc(seller(), { variants: [{ id: "v1", attributes: { Color: "Red" }, stock: 1.5, price: 0 }] })));
await check("seller direct write: stock DENIED", () => assertFails(updateDoc(seller(), { stock: 2.5 })));
await check("seller direct write: gstRate DENIED", () => assertFails(updateDoc(seller(), { gstRate: 7 })));
await check("seller direct write: gstPercent DENIED", () => assertFails(updateDoc(seller(), { gstPercent: 3 })));
await check("seller direct write: non-money field (title) still ALLOWED", () => assertSucceeds(updateDoc(seller(), { title: "Rules Lamp v2" })));
await check("other seller: title write still DENIED", () =>
  assertFails(updateDoc(doc(env.authenticatedContext("seller_rules_2").firestore(), "products", "p_rules"), { title: "x" })));
await reseed();
await check("customer stock<->sales transfer rule unchanged (still ALLOWED)", () =>
  assertSucceeds(updateDoc(doc(env.authenticatedContext("buyer_rules_1").firestore(), "products", "p_rules"), { stock: 6, sales: 1 })));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} rules checks passed`);
if (fail > 0) process.exitCode = 1;
