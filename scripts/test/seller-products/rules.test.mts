/*
 * LOCAL-ONLY Firestore RULES test (emulator) — Seller Product Management,
 * Phase 1 product write hardening.
 *   - a seller's direct write to their own product may touch only the
 *     seller-editable listing fields; identity (vendorName, vendorId), the
 *     product number, createdAt, the sales/rating/reviewCount/views/
 *     wishlistCount counters and every moderation/lifecycle field are refused;
 *   - content an admin approved (title, description, media, …) is frozen on an
 *     approved or legacy-live product (it changes via the server route, which
 *     sends it back to review); still editable while pending/rejected;
 *   - the old client stock<->sales transfer and rating paths are gone: no
 *     stranger can empty a competitor's stock or set its rating; the +1 view
 *     bump remains;
 *   - a seller can no longer hard-delete a product (archive instead); admin can.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/seller-products/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostPort)) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not a local emulator. Run under `firebase emulators:exec`.");
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

const SELLER = "seller_rules_a";
const OTHER = "seller_rules_b";
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const BASE = {
  vendorId: SELLER, vendorName: "Asha Traders", title: "Brass Lamp", description: "A lamp", brand: "Lumo",
  sellingPrice: 499, mrp: 799, stock: 10, sales: 2, gstRate: 12, rating: 4, reviewCount: 3, views: 10,
  wishlistCount: 1, productNumber: "PCT000001", createdAt: new Date("2026-01-01T00:00:00Z"),
  images: ["https://x/1.jpg"], thumbnail: "https://x/1.jpg", specifications: { Material: "Brass" },
  warranty: "", returnDays: 7, sku: "LMP-1",
};
const LIVE = { ...BASE, approvalStatus: "approved", approved: true, active: true, featured: false };
const PENDING = { ...BASE, approvalStatus: "pending", approved: false, active: false, featured: false };
const LEGACY = { ...BASE, approved: false, active: true };

async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, "products", "p_live"), LIVE);
    await setDoc(doc(f, "products", "p_pending"), PENDING);
    await setDoc(doc(f, "products", "p_legacy"), LEGACY);
    await setDoc(doc(f, "products", "p_other"), { ...LIVE, vendorId: OTHER, productNumber: "PCT000002" });
  });
}
const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const owner = (id: string) => doc(as(SELLER), "products", id);
async function stored(id: string) {
  let d: any;
  await env.withSecurityRulesDisabled(async (ctx) => { d = (await getDoc(doc(ctx.firestore(), "products", id))).data(); });
  return d;
}

await reseed();

// ---------- server-owned fields: denied on the seller's own product ----------
const FROZEN: [string, unknown][] = [
  ["vendorName", "YOMICO Official"], ["vendorId", OTHER], ["sales", 5000], ["rating", 5], ["reviewCount", 999],
  ["views", 100000], ["wishlistCount", 500], ["productNumber", "PCT999999"], ["createdAt", new Date()],
  ["approvalStatus", "approved"], ["approved", true], ["active", true], ["featured", true],
  ["archived", true], ["archivedFromStatus", "live"], ["lastRejectionReason", "x"], ["resubmittedAt", new Date()],
  ["reReviewRequestedAt", new Date()], ["isBestSeller", true],
];
for (const [field, value] of FROZEN) {
  await check(`S1  seller CANNOT write ${field} on own product (pending)`, () => assertFails(updateDoc(owner("p_pending"), { [field]: value })));
}
await check("S2  seller CANNOT remove a counter / vendorName (deleting a field is a change)", async () => {
  const { deleteField } = await import("firebase/firestore");
  await assertFails(updateDoc(owner("p_pending"), { sales: deleteField() }));
  await assertFails(updateDoc(owner("p_pending"), { vendorName: deleteField() }));
});
await check("S3  price / stock / variants / GST still route-only (unchanged)", async () => {
  await assertFails(updateDoc(owner("p_pending"), { sellingPrice: 1 }));
  await assertFails(updateDoc(owner("p_pending"), { stock: 999 }));
  await assertFails(updateDoc(owner("p_pending"), { gstRate: 5 }));
});

// ---------- content freeze on approved / legacy live ----------
for (const [field, value] of [
  ["title", "Different product"], ["description", "new"], ["images", ["https://x/2.jpg"]], ["thumbnail", "https://x/2.jpg"],
  ["specifications", { Material: "Plastic" }], ["brand", "Other"], ["shortTitle", "x"], ["model", "M2"], ["video", "https://x/v.mp4"],
] as const) {
  await check(`L1  APPROVED product: seller direct write of ${field} DENIED (goes through the re-review route)`, () =>
    assertFails(updateDoc(owner("p_live"), { [field]: value })));
}
await check("L2  LEGACY live product: seller direct title write DENIED", () => assertFails(updateDoc(owner("p_legacy"), { title: "x" })));
await check("L3  approved product: non-content fields (warranty, returnDays, sku, mrp) still ALLOWED", () =>
  assertSucceeds(updateDoc(owner("p_live"), { warranty: "1 year", returnDays: 10, sku: "LMP-2", mrp: 899 })));
await check("L4  approved product: whole-document save with unchanged content still ALLOWED", async () => {
  const d = await stored("p_live");
  await assertSucceeds(setDoc(owner("p_live"), d));
});
await check("L5  PENDING product: seller may still edit title / description / images directly", () =>
  assertSucceeds(updateDoc(owner("p_pending"), { title: "Brass Lamp v2", description: "d2", images: ["https://x/3.jpg"] })));
await check("L6  other seller cannot write even a non-content field", () =>
  assertFails(updateDoc(doc(as(OTHER), "products", "p_live"), { warranty: "x" })));

// ---------- dead client stock / rating paths ----------
await reseed();
const stranger = () => doc(as("random_user"), "products", "p_other");
await check("X1  stranger stock->sales transfer (empty a competitor's stock) DENIED (was ALLOWED)", () =>
  assertFails(updateDoc(stranger(), { stock: 0, sales: 12 })));
await check("X2  stranger sales->stock 'restore' transfer DENIED (was ALLOWED)", () =>
  assertFails(updateDoc(stranger(), { stock: 12, sales: 0 })));
await check("X3  stranger rating + reviewCount+1 without a review DENIED (was ALLOWED)", () =>
  assertFails(updateDoc(stranger(), { rating: 0, reviewCount: 4 })));
await check("X4  owner cannot use the rating pattern either", () =>
  assertFails(updateDoc(owner("p_live"), { rating: 5, reviewCount: 4 })));
await check("X5  signed-in +1 view bump still ALLOWED (unchanged)", () => assertSucceeds(updateDoc(stranger(), { views: 11 })));
await check("X6  view bump of more than +1 still DENIED", () => assertFails(updateDoc(stranger(), { views: 500 })));
await check("X7  signed-out cannot bump views", () =>
  assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), "products", "p_other"), { views: 11 })));

// ---------- delete ----------
await check("D1  seller CANNOT hard-delete own product (archive instead)", () => assertFails(deleteDoc(owner("p_pending"))));
await check("D2  admin client delete still ALLOWED (admin access unchanged)", () =>
  assertSucceeds(deleteDoc(doc(as("adminUid", ADMIN_EMAIL), "products", "p_pending"))));
await check("D3  admin client may still update counters/moderation (admin access unchanged)", () =>
  assertSucceeds(updateDoc(doc(as("adminUid", ADMIN_EMAIL), "products", "p_live"), { rating: 4.5, featured: true })));
await check("D4  seller client create still DENIED (unchanged)", () =>
  assertFails(setDoc(doc(as(SELLER), "products", "p_new"), PENDING)));
await check("D5  public read unchanged (D3 deferred): signed-out can still read a product", () =>
  assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "products", "p_live"))));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
