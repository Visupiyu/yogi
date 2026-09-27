/*
 * LOCAL-ONLY Firestore RULES test (emulator) — Seller Order & Fulfillment.
 *   - orders: a seller may write ONLY shipping details (tracking, courier,
 *     dates, notes), only on an order that is entirely theirs and still open.
 *     Never status, deliveredAt, paymentStatus (the legacy cash-COD
 *     self-certification is retired), money, items or identity; never on a
 *     multi-seller order; never after Delivered/Cancelled;
 *   - sellerOrders: the owning seller keeps their shipping fields; item
 *     fulfilment and the money snapshot stay server-only;
 *   - deliveryJobs / itemRequests stay server-only.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/seller-orders/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

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
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const order = (uid: string, id: string, email?: string) => doc(as(uid, email), "orders", id);

const BASE = {
  userId: BUYER, userEmail: "buyer1@example.com", total: 500, finalTotal: 500, commission: 0,
  paymentMethod: "COD", paymentStatus: "Pending", trackingNumber: "", sellerNotes: "",
  items: [{ id: "p1", vendorId: A, price: 500, qty: 1 }],
};
async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, "orders", "o_sole"), { ...BASE, vendorIds: [A], status: "Packed" });
    await setDoc(doc(f, "orders", "o_sole_delivered"), { ...BASE, vendorIds: [A], status: "Delivered" });
    await setDoc(doc(f, "orders", "o_sole_cancelled"), { ...BASE, vendorIds: [A], status: "Cancelled" });
    await setDoc(doc(f, "orders", "o_sole_pending"), { ...BASE, vendorIds: [A], status: "Pending" });
    await setDoc(doc(f, "orders", "o_multi"), {
      ...BASE, vendorIds: [A, B], status: "Confirmed",
      items: [{ id: "p1", vendorId: A, price: 300, qty: 1 }, { id: "p2", vendorId: B, price: 200, qty: 1 }],
    });
    await setDoc(doc(f, "sellerOrders", `o_multi_${A}`), {
      orderId: "o_multi", vendorId: A, items: [{ itemKey: "i0_p1", id: "p1" }], itemFulfilment: { i0_p1: { status: "Confirmed" } },
      vendorSubtotal: 300, vendorCommission: 0, vendorEarning: 300, sellerDeliveryCharge: 0,
    });
    await setDoc(doc(f, "deliveryJobs", `o_multi_${A}`), { orderId: "o_multi", vendorId: A, status: "InProgress" });
    await setDoc(doc(f, "itemRequests", "ir1"), { orderId: "o_multi", vendorId: A, userId: BUYER, type: "return", status: "REQUESTED" });
  });
}

await reseed();

// ---------- sole-seller, open order: shipping details only ----------
await check("O1 sole seller, open order: tracking / courier / dates / notes ALLOWED", () =>
  assertSucceeds(updateDoc(order(A, "o_sole"), {
    trackingNumber: "TRK1", courierPartner: "Courier", dispatchDate: "2026-09-28", expectedDelivery: "2026-10-01",
    sellerNotes: "Fragile", updatedAt: serverTimestamp(),
  })));
for (const [field, value] of [
  ["status", "Delivered"], ["status", "Out For Delivery"], ["deliveredAt", serverTimestamp()],
  ["paymentStatus", "Paid"], ["total", 1], ["finalTotal", 1], ["commission", 50], ["items", []],
  ["vendorIds", [A, B]], ["userId", A], ["refundAmount", 500], ["owesRefund", false], ["deliveryPartnerId", "dp1"],
] as const) {
  await check(`O2 sole seller CANNOT write ${field}`, () => assertFails(updateDoc(order(A, "o_sole"), { [field]: value })));
}
await check("O3 legacy cash-COD self-mark Paid on a Delivered COD order is now DENIED (was the one seller payment path)", () =>
  assertFails(updateDoc(order(A, "o_sole_delivered"), { paymentStatus: "Paid", updatedAt: serverTimestamp() })));
await check("O4 Delivered and Cancelled orders are closed to seller edits (tracking DENIED)", async () => {
  await assertFails(updateDoc(order(A, "o_sole_delivered"), { trackingNumber: "LATE", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(order(A, "o_sole_cancelled"), { trackingNumber: "LATE", updatedAt: serverTimestamp() }));
});
await check("O5 Pending order: seller write still DENIED (unchanged)", () =>
  assertFails(updateDoc(order(A, "o_sole_pending"), { trackingNumber: "X" })));

// ---------- multi-seller order ----------
await check("M1 multi-seller order: seller A CANNOT write the shared tracking fields", () =>
  assertFails(updateDoc(order(A, "o_multi"), { trackingNumber: "A-TRK", updatedAt: serverTimestamp() })));
await check("M2 multi-seller order: seller B CANNOT write them either", () =>
  assertFails(updateDoc(order(B, "o_multi"), { sellerNotes: "B note", updatedAt: serverTimestamp() })));
await check("M3 a seller not on the order CANNOT write it", () =>
  assertFails(updateDoc(order("sellerZ", "o_sole"), { trackingNumber: "Z" })));

// ---------- sellerOrders ----------
const soA = () => doc(as(A), "sellerOrders", `o_multi_${A}`);
await check("S1 seller keeps their own shipping details on their seller record (multi-seller safe)", () =>
  assertSucceeds(updateDoc(soA(), { trackingNumber: "A-TRK", courierPartner: "X", sellerNotes: "n", updatedAt: serverTimestamp() })));
await check("S2 seller CANNOT write itemFulfilment (advance only through the server)", () =>
  assertFails(updateDoc(soA(), { itemFulfilment: { i0_p1: { status: "Delivered" } } })));
await check("S3 seller CANNOT write their money snapshot", async () => {
  await assertFails(updateDoc(soA(), { vendorEarning: 9999 }));
  await assertFails(updateDoc(soA(), { sellerDeliveryCharge: 0, vendorSubtotal: 1 }));
  await assertFails(updateDoc(soA(), { sellerDeliveryCharge: deleteField() }));
});
await check("S4 seller B CANNOT read or write seller A's record", async () => {
  await assertFails(getDoc(doc(as(B), "sellerOrders", `o_multi_${A}`)));
  await assertFails(updateDoc(doc(as(B), "sellerOrders", `o_multi_${A}`), { trackingNumber: "B" }));
});

// ---------- delivery / returns stay server-only ----------
await check("D1 deliveryJobs: seller cannot read or write (rider/company/job identity server-only)", async () => {
  await assertFails(getDoc(doc(as(A), "deliveryJobs", `o_multi_${A}`)));
  await assertFails(updateDoc(doc(as(A), "deliveryJobs", `o_multi_${A}`), { status: "Delivered" }));
  await assertFails(setDoc(doc(as(A), "deliveryJobs", "fake"), { orderId: "o_sole", vendorId: A, status: "Delivered" }));
});
await check("D2 itemRequests: seller cannot write (refunds / stages server-only)", async () => {
  await assertFails(updateDoc(doc(as(A), "itemRequests", "ir1"), { status: "REFUNDED" }));
  await assertSucceeds(getDoc(doc(as(A), "itemRequests", "ir1")));
});

// ---------- unchanged neighbours ----------
await check("U1 customer may still cancel their own Pending order", () =>
  assertSucceeds(updateDoc(order(BUYER, "o_sole_pending", "buyer1@example.com"), { status: "Cancelled", updatedAt: serverTimestamp() })));
await check("U2 admin may still update an order (admin access unchanged)", () =>
  assertSucceeds(updateDoc(order("adminUid", "o_sole_delivered", ADMIN_EMAIL), { paymentStatus: "Paid" })));
await check("U3 seller may still READ an order that carries their items (unchanged; server projection is future work)", () =>
  assertSucceeds(getDoc(order(A, "o_multi"))));

// Leave the shared emulator clean for whichever suite runs next.
await env.clearFirestore();
await env.cleanup();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
