/*
 * LOCAL-ONLY Firestore RULES test (emulator) — product approval gate.
 * A seller may not write any moderation field directly with the client SDK
 * (approvalStatus, approved, active, featured, rejectionReason, moderatedAt,
 * moderatedBy); ordinary non-money seller edits still work. Once a product is
 * approved (or is a legacy live product), its seller can no longer change
 * categoryId / subCategoryId / leafCategoryId; pending/rejected still can.
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

// ============ CATEGORY LOCK (approved products) ============
// categoryId / subCategoryId / leafCategoryId are editable by the seller only
// while the product is explicitly pending or rejected (lib/products/categoryLock.ts).
const CATS = { categoryId: "HOME", subCategoryId: "HOME_DECOR", leafCategoryId: "HOME_DECOR_LAMPS" };
const LIVE = { vendorId: SELLER, title: "Live Lamp", sellingPrice: 499, mrp: 799, stock: 7, sales: 0, gstRate: 12, ...CATS };
const { subCategoryId: _noSub, ...LIVE_NO_SUB } = LIVE;
void _noSub;
async function seedCat() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "products", "c_pending"), { ...LIVE, approvalStatus: "pending", approved: false, active: false, featured: false });
    await setDoc(doc(db, "products", "c_rejected"), { ...LIVE, approvalStatus: "rejected", approved: false, active: false, featured: false, rejectionReason: "x" });
    await setDoc(doc(db, "products", "c_approved"), { ...LIVE, approvalStatus: "approved", approved: true, active: true, featured: false });
    await setDoc(doc(db, "products", "c_blocked"), { ...LIVE, approvalStatus: "approved", approved: true, active: false, featured: false });
    await setDoc(doc(db, "products", "c_legacy"), { ...LIVE, approved: false, active: true });
    await setDoc(doc(db, "products", "c_unknown"), { ...LIVE, approvalStatus: "weird", active: true });
    await setDoc(doc(db, "products", "c_nosub"), { ...LIVE_NO_SUB, approvalStatus: "approved", approved: true, active: true, featured: false });
  });
}
const sellerP = (id: string) => doc(env.authenticatedContext(SELLER).firestore(), "products", id);
const adminP = (id: string) => doc(env.authenticatedContext("adminUid", { email: "adminyogimart@gmail.com", email_verified: true }).firestore(), "products", id);

await seedCat();
await check("C1  pending: seller may change categoryId / subCategoryId / leafCategoryId", () =>
  assertSucceeds(updateDoc(sellerP("c_pending"), { categoryId: "FASHION", subCategoryId: "FASHION_MEN", leafCategoryId: "FASHION_MEN_SHIRTS" })));
await check("C2  rejected: seller may change category (fix and resubmit)", () =>
  assertSucceeds(updateDoc(sellerP("c_rejected"), { leafCategoryId: "HOME_DECOR_CLOCKS" })));
await check("C3  approved: seller change categoryId DENIED", () => assertFails(updateDoc(sellerP("c_approved"), { categoryId: "FASHION" })));
await check("C4  approved: seller change subCategoryId DENIED", () => assertFails(updateDoc(sellerP("c_approved"), { subCategoryId: "HOME_KITCHEN" })));
await check("C5  approved: seller change leafCategoryId DENIED", () => assertFails(updateDoc(sellerP("c_approved"), { leafCategoryId: "HOME_DECOR_CLOCKS" })));
await check("C6  approved: seller deleting a category field DENIED", async () => {
  const { deleteField } = await import("firebase/firestore");
  await assertFails(updateDoc(sellerP("c_approved"), { leafCategoryId: deleteField() }));
});
await check("C7  approved: seller adding a missing category field DENIED", () => assertFails(updateDoc(sellerP("c_nosub"), { subCategoryId: "HOME_DECOR" })));
await check("C8  approved: seller non-category edit (title, description) still ALLOWED", () =>
  assertSucceeds(updateDoc(sellerP("c_approved"), { title: "Live Lamp v2", description: "new copy" })));
await check("C9  approved: whole-document save with the SAME categories still ALLOWED", () =>
  assertSucceeds(setDoc(sellerP("c_approved"), { ...LIVE, title: "Live Lamp v3", approvalStatus: "approved", approved: true, active: true, featured: false })));
await check("C10 blocked (approved + inactive): seller change category DENIED", () => assertFails(updateDoc(sellerP("c_blocked"), { categoryId: "FASHION" })));
await check("C11 legacy (no approvalStatus, live): seller change category DENIED; title ALLOWED", async () => {
  await assertFails(updateDoc(sellerP("c_legacy"), { leafCategoryId: "HOME_DECOR_CLOCKS" }));
  await assertSucceeds(updateDoc(sellerP("c_legacy"), { title: "Legacy Lamp v2" }));
});
await check("C12 unknown approvalStatus: seller change category DENIED (fail closed)", () => assertFails(updateDoc(sellerP("c_unknown"), { categoryId: "FASHION" })));
await check("C13 admin may still change the category of an approved product", () =>
  assertSucceeds(updateDoc(adminP("c_approved"), { categoryId: "FASHION", subCategoryId: "FASHION_MEN", leafCategoryId: "FASHION_MEN_SHIRTS" })));
await check("C14 other seller still cannot edit an approved product at all", () =>
  assertFails(updateDoc(doc(env.authenticatedContext("seller_other").firestore(), "products", "c_approved"), { title: "hijack" })));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} rules checks passed`);
if (fail > 0) process.exitCode = 1;
