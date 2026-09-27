/*
 * LOCAL-ONLY Firestore RULES test (emulator) — seller settlement snapshot.
 * The money figures on a sellerOrders record (vendorSubtotal, vendorCommission,
 * vendorEarning and sellerDeliveryCharge — this seller's share of the order's
 * ONE delivery cost) are written only by the server (Admin SDK) at
 * confirmation. Neither the seller nor an admin client may change, add or
 * remove them; the seller's shipping fields and admin non-money edits still work.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/seller-settlement/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteField, doc, setDoc, updateDoc } from "firebase/firestore";

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

const SELLER = "seller_rules_settle";
const RECORD = {
  orderId: "o1", vendorId: SELLER, items: [{ id: "p", qty: 1, price: 300 }],
  itemFulfilment: { k0: { status: "Confirmed" } }, itemCount: 1,
  vendorSubtotal: 300, vendorCommission: 0, vendorEarning: 300, sellerDeliveryCharge: 27,
  customerName: "Buyer", deliveryDate: null, confirmedAt: new Date(), deliveryDeadlineAt: new Date(), createdAt: new Date(),
};
const { sellerDeliveryCharge: _legacy, ...LEGACY_RECORD } = RECORD;
void _legacy;

async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "sellerOrders", "o1_" + SELLER), RECORD);
    await setDoc(doc(ctx.firestore(), "sellerOrders", "o0_" + SELLER), LEGACY_RECORD);
  });
}
const seller = (id = "o1_" + SELLER) => doc(env.authenticatedContext(SELLER).firestore(), "sellerOrders", id);
const admin = (id = "o1_" + SELLER) =>
  doc(env.authenticatedContext("adminUid", { email: "adminyogimart@gmail.com", email_verified: true }).firestore(), "sellerOrders", id);

await reseed();
await check("R1 seller may still record shipping (trackingNumber, courierPartner, shipmentWeightKg)", () =>
  assertSucceeds(updateDoc(seller(), { trackingNumber: "TRK1", courierPartner: "X", shipmentWeightKg: 1.2, updatedAt: new Date() })));
await check("R2 seller CANNOT change sellerDeliveryCharge", () => assertFails(updateDoc(seller(), { sellerDeliveryCharge: 0 })));
await check("R3 seller CANNOT change vendorCommission / vendorEarning / vendorSubtotal", async () => {
  await assertFails(updateDoc(seller(), { vendorCommission: 5 }));
  await assertFails(updateDoc(seller(), { vendorEarning: 9999 }));
  await assertFails(updateDoc(seller(), { vendorSubtotal: 9999 }));
});
await check("R4 admin CANNOT change sellerDeliveryCharge (snapshot is server-only)", () => assertFails(updateDoc(admin(), { sellerDeliveryCharge: 49 })));
await check("R5 admin CANNOT change vendorCommission (commission stays ₹0) / vendorEarning / vendorSubtotal", async () => {
  await assertFails(updateDoc(admin(), { vendorCommission: 30 }));
  await assertFails(updateDoc(admin(), { vendorEarning: 1 }));
  await assertFails(updateDoc(admin(), { vendorSubtotal: 1 }));
});
await check("R6 admin CANNOT delete sellerDeliveryCharge, nor ADD one to a legacy record", async () => {
  await assertFails(updateDoc(admin(), { sellerDeliveryCharge: deleteField() }));
  await assertFails(updateDoc(admin("o0_" + SELLER), { sellerDeliveryCharge: 10 }));
});
await check("R7 admin non-money edit still ALLOWED (courierPartner, sellerNotes)", () =>
  assertSucceeds(updateDoc(admin(), { courierPartner: "Y", sellerNotes: "checked" })));
await check("R8 admin itemFulfilment edit still DENIED (unchanged behaviour)", () =>
  assertFails(updateDoc(admin(), { itemFulfilment: { k0: { status: "Delivered" } } })));
await check("R9 nobody creates a sellerOrders record from the client", async () => {
  await assertFails(setDoc(seller("o9_" + SELLER), RECORD));
  await assertFails(setDoc(admin("o9_" + SELLER), RECORD));
});
await check("R10 another seller cannot touch the record", () =>
  assertFails(updateDoc(doc(env.authenticatedContext("other_seller").firestore(), "sellerOrders", "o1_" + SELLER), { trackingNumber: "x" })));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} seller-settlement rules checks passed`);
if (fail > 0) process.exitCode = 1;
