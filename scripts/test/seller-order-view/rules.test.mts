/*
 * LOCAL-ONLY Firestore RULES test (emulator) — Seller Shared-Order Privacy.
 *   - sellers can no longer read (get or list) or write the shared
 *     orders/{id} document at all — single- or multi-seller, any status. Their
 *     view comes from app/api/seller/orders (allow-listed, Admin SDK);
 *   - the customer, admin and the assigned delivery partner keep their access;
 *   - sellerOrders stays per-seller (own record readable, others' not).
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/seller-order-view/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

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

const A = "sellerA";
const B = "sellerB";
const BUYER = "buyer1";
const RIDER = "rider1";
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const as = (uid: string, email = `${uid}@example.com`) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  const base = { userId: BUYER, userEmail: "buyer1@example.com", phone: "9898989898", address: "1 Road", total: 800 };
  await setDoc(doc(f, "orders", "o_multi"), { ...base, vendorIds: [A, B], status: "Confirmed", items: [{ vendorId: A }, { vendorId: B }] });
  await setDoc(doc(f, "orders", "o_sole"), { ...base, vendorIds: [A], status: "Packed", items: [{ vendorId: A }] });
  await setDoc(doc(f, "orders", "o_delivered"), { ...base, vendorIds: [A], status: "Delivered", items: [{ vendorId: A }] });
  await setDoc(doc(f, "orders", "o_pending"), { ...base, vendorIds: [A], status: "Pending", items: [{ vendorId: A }] });
  await setDoc(doc(f, "orders", "o_rider"), { ...base, vendorIds: [A], status: "Out For Delivery", items: [{ vendorId: A }], deliveryPartnerId: "dp1" });
  await setDoc(doc(f, "deliveryPartners", "dp1"), { uid: RIDER, name: "Rider" });
  await setDoc(doc(f, "sellerOrders", `o_multi_${A}`), { orderId: "o_multi", vendorId: A, items: [], itemFulfilment: {} });
  await setDoc(doc(f, "sellerOrders", `o_multi_${B}`), { orderId: "o_multi", vendorId: B, items: [], itemFulfilment: {} });
});

// ---------- sellers: no direct access to the shared order ----------
for (const id of ["o_multi", "o_sole", "o_delivered", "o_pending"]) {
  await check(`R1 seller A CANNOT read orders/${id}`, () => assertFails(getDoc(doc(as(A), "orders", id))));
}
await check("R2 seller B CANNOT read the multi-seller order either", () => assertFails(getDoc(doc(as(B), "orders", "o_multi"))));
await check("R3 seller list queries on orders are refused (array-contains, with or without the old status filter)", async () => {
  await assertFails(getDocs(query(collection(as(A), "orders"), where("vendorIds", "array-contains", A))));
  await assertFails(getDocs(query(collection(as(A), "orders"), where("vendorIds", "array-contains", A), where("status", "!=", "Pending"))));
});
await check("R4 seller CANNOT write the order — not even shipping details on a sole-seller open order", async () => {
  await assertFails(updateDoc(doc(as(A), "orders", "o_sole"), { trackingNumber: "T", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(A), "orders", "o_multi"), { sellerNotes: "n" }));
  await assertFails(updateDoc(doc(as(A), "orders", "o_sole"), { status: "Delivered" }));
  await assertFails(updateDoc(doc(as(A), "orders", "o_delivered"), { paymentStatus: "Paid" }));
});

// ---------- everyone else unchanged ----------
await check("C1 customer reads their own order", () => assertSucceeds(getDoc(doc(as(BUYER, "buyer1@example.com"), "orders", "o_multi"))));
await check("C2 customer lists their own orders", () =>
  assertSucceeds(getDocs(query(collection(as(BUYER, "buyer1@example.com"), "orders"), where("userId", "==", BUYER)))));
// Customer Account hardening: cancelling goes through app/api/cancel-order only.
await check("C3 customer can no longer cancel their Pending order by a direct write (app/api/cancel-order only)", () =>
  assertFails(updateDoc(doc(as(BUYER, "buyer1@example.com"), "orders", "o_pending"), { status: "Cancelled", updatedAt: serverTimestamp() })));
await check("C4 another customer cannot read the order", () => assertFails(getDoc(doc(as("buyer2"), "orders", "o_multi"))));
await check("A1 admin reads and updates orders", async () => {
  await assertSucceeds(getDoc(doc(as("adminUid", ADMIN_EMAIL), "orders", "o_multi")));
  await assertSucceeds(updateDoc(doc(as("adminUid", ADMIN_EMAIL), "orders", "o_sole"), { trackingNumber: "ADMIN" }));
});
await check("D1 the assigned delivery partner still reads their order; an unassigned one cannot", async () => {
  await assertSucceeds(getDoc(doc(as(RIDER), "orders", "o_rider")));
  await assertFails(getDoc(doc(as("rider2"), "orders", "o_rider")));
});

// ---------- per-seller records unchanged ----------
await check("S1 seller reads their OWN sellerOrders record, never another seller's", async () => {
  await assertSucceeds(getDoc(doc(as(A), "sellerOrders", `o_multi_${A}`)));
  await assertFails(getDoc(doc(as(A), "sellerOrders", `o_multi_${B}`)));
  await assertSucceeds(getDocs(query(collection(as(A), "sellerOrders"), where("vendorId", "==", A))));
});

// Leave the shared emulator clean for whichever suite runs next.
await env.clearFirestore();
await env.cleanup();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
