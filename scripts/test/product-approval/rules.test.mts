/*
 * LOCAL-ONLY Firestore RULES test (emulator) — product approval gate.
 * A seller may not write any moderation field directly with the client SDK
 * (approvalStatus, approved, active, featured, rejectionReason, moderatedAt,
 * moderatedBy); ordinary non-money seller edits still work.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/product-approval/rules.test.mts"
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

const SELLER = "seller_appr_rules";
const PENDING = {
  vendorId: SELLER, title: "Pending Lamp", sellingPrice: 499, mrp: 799, stock: 7, sales: 0, gstRate: 12,
  approvalStatus: "pending", approved: false, active: false, featured: false,
};

async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "products", "p_pending"), PENDING);
  });
}
const seller = () => doc(env.authenticatedContext(SELLER).firestore(), "products", "p_pending");

await reseed();
await check("seller direct write approvalStatus=approved DENIED", () => assertFails(updateDoc(seller(), { approvalStatus: "approved" })));
await check("seller direct write approved=true DENIED", () => assertFails(updateDoc(seller(), { approved: true })));
await check("seller direct write active=true DENIED", () => assertFails(updateDoc(seller(), { active: true })));
await check("seller direct write featured=true DENIED", () => assertFails(updateDoc(seller(), { featured: true })));
await check("seller direct write rejectionReason DENIED", () => assertFails(updateDoc(seller(), { rejectionReason: "x" })));
await check("seller direct write moderatedBy DENIED", () => assertFails(updateDoc(seller(), { moderatedBy: SELLER })));
await check("seller direct write moderatedAt DENIED", () => assertFails(updateDoc(seller(), { moderatedAt: new Date() })));
await check("seller direct write non-moderation field (title) still ALLOWED", () => assertSucceeds(updateDoc(seller(), { title: "Pending Lamp v2" })));
await check("seller client create still DENIED (server route only)", () =>
  assertFails(setDoc(doc(env.authenticatedContext(SELLER).firestore(), "products", "p_new"), { ...PENDING, approvalStatus: "approved", active: true })));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} rules checks passed`);
if (fail > 0) process.exitCode = 1;
