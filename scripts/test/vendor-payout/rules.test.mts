/*
 * LOCAL-ONLY Firestore RULES test (emulator) — vendor_payouts.
 * A payout is recorded ONLY by app/api/admin/record-payout through the Admin
 * SDK. No client — admin included — may create, edit or delete a payout
 * document (editing or deleting one would drop it out of lib/vendorPayable.ts's
 * committed total and make the same money payable twice). Reads are unchanged:
 * admin, and the seller the payout belongs to (the wallet query).
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/vendor-payout/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from "firebase/firestore";

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

const SELLER = "seller_vp";
const OTHER = "seller_vp_other";
const payout = (vendorId: string, amount = 500) => ({
  vendorId, vendorName: "VP Traders", payoutNumber: "PAYOUT000001", amount, status: "Paid",
  source: "admin_direct", createdAt: new Date("2026-09-01T00:00:00Z"),
});
async function seed(id: string, vendorId = SELLER) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "vendor_payouts", id), payout(vendorId));
  });
}
async function exists(id: string) {
  let e = false;
  await env.withSecurityRulesDisabled(async (ctx) => { e = (await getDoc(doc(ctx.firestore(), "vendor_payouts", id))).exists(); });
  return e;
}
const adminDb = () => env.authenticatedContext("adminUid", { email: "adminyogimart@gmail.com", email_verified: true }).firestore();
const sellerDb = () => env.authenticatedContext(SELLER, { email: `${SELLER}@example.com`, email_verified: true }).firestore();
const customerDb = () => env.authenticatedContext("customer_vp", { email: "customer_vp@example.com", email_verified: true }).firestore();
const anonDb = () => env.unauthenticatedContext().firestore();

await env.clearFirestore();
await seed("vp_1");
await seed("vp_other", OTHER);

// ---------- client writes denied, admin included ----------
await check("V1  admin client setDoc (create) DENIED", () => assertFails(setDoc(doc(adminDb(), "vendor_payouts", "vp_new"), payout(SELLER))));
await check("V2  admin client addDoc (create) DENIED", () => assertFails(addDoc(collection(adminDb(), "vendor_payouts"), payout(SELLER))));
await check("V3  admin client update (amount) DENIED", () => assertFails(updateDoc(doc(adminDb(), "vendor_payouts", "vp_1"), { amount: 1 })));
await check("V4  admin client update (vendorId / status) DENIED", () => assertFails(updateDoc(doc(adminDb(), "vendor_payouts", "vp_1"), { vendorId: OTHER, status: "Pending" })));
await check("V5  admin client overwrite (setDoc on existing) DENIED", () => assertFails(setDoc(doc(adminDb(), "vendor_payouts", "vp_1"), payout(SELLER, 1))));
await check("V6  admin client delete DENIED", () => assertFails(deleteDoc(doc(adminDb(), "vendor_payouts", "vp_1"))));
await check("V7  seller create own payout DENIED", () => assertFails(setDoc(doc(sellerDb(), "vendor_payouts", "vp_self"), payout(SELLER))));
await check("V8  seller update own payout DENIED", () => assertFails(updateDoc(doc(sellerDb(), "vendor_payouts", "vp_1"), { amount: 1 })));
await check("V9  seller delete own payout DENIED", () => assertFails(deleteDoc(doc(sellerDb(), "vendor_payouts", "vp_1"))));
await check("V10 customer / signed-out create DENIED", async () => {
  await assertFails(setDoc(doc(customerDb(), "vendor_payouts", "vp_c"), payout(SELLER)));
  await assertFails(setDoc(doc(anonDb(), "vendor_payouts", "vp_anon"), payout(SELLER)));
});
await check("V11 the payout still exists, unchanged, after every attempt", async () => {
  if (!(await exists("vp_1"))) throw new Error("vp_1 was removed");
  let amount: unknown;
  await env.withSecurityRulesDisabled(async (ctx) => { amount = (await getDoc(doc(ctx.firestore(), "vendor_payouts", "vp_1"))).data()?.amount; });
  if (amount !== 500) throw new Error(`amount changed to ${amount}`);
  if (await exists("vp_new") || await exists("vp_self") || await exists("vp_c") || await exists("vp_anon")) throw new Error("a client-created payout exists");
});

// ---------- reads unchanged ----------
await check("V12 admin read allowed (single doc and full list)", async () => {
  await assertSucceeds(getDoc(doc(adminDb(), "vendor_payouts", "vp_1")));
  await assertSucceeds(getDocs(collection(adminDb(), "vendor_payouts")));
});
await check("V13 seller reads own payout + the wallet query (where vendorId == own uid)", async () => {
  await assertSucceeds(getDoc(doc(sellerDb(), "vendor_payouts", "vp_1")));
  await assertSucceeds(getDocs(query(collection(sellerDb(), "vendor_payouts"), where("vendorId", "==", SELLER))));
});
await check("V14 seller cannot read another seller's payout or list all", async () => {
  await assertFails(getDoc(doc(sellerDb(), "vendor_payouts", "vp_other")));
  await assertFails(getDocs(collection(sellerDb(), "vendor_payouts")));
});
await check("V15 customer and signed-out reads DENIED", async () => {
  await assertFails(getDoc(doc(customerDb(), "vendor_payouts", "vp_1")));
  await assertFails(getDoc(doc(anonDb(), "vendor_payouts", "vp_1")));
});

// ---------- neighbouring rules untouched ----------
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "withdrawals", "w_pending"), {
    vendorId: SELLER, vendorEmail: `${SELLER}@example.com`, amount: 100, status: "Pending", createdAt: new Date(),
  });
  await setDoc(doc(ctx.firestore(), "withdrawals", "w_paid"), {
    vendorId: SELLER, vendorEmail: `${SELLER}@example.com`, amount: 100, status: "Paid", createdAt: new Date(),
  });
  await setDoc(doc(ctx.firestore(), "sellerOrders", `o1_${SELLER}`), {
    orderId: "o1", vendorId: SELLER, vendorSubtotal: 300, vendorCommission: 0, vendorEarning: 300,
    sellerDeliveryCharge: 27, itemFulfilment: {}, items: [],
  });
});
await check("V16 withdrawals unchanged: admin Pending -> Approved allowed; Paid stays final", async () => {
  await assertSucceeds(updateDoc(doc(adminDb(), "withdrawals", "w_pending"), { status: "Approved" }));
  await assertFails(updateDoc(doc(adminDb(), "withdrawals", "w_paid"), { status: "Rejected" }));
});
await check("V17 sellerOrders settlement freeze unchanged: admin cannot rewrite sellerDeliveryCharge / vendorEarning", async () => {
  await assertFails(updateDoc(doc(adminDb(), "sellerOrders", `o1_${SELLER}`), { sellerDeliveryCharge: 0 }));
  await assertFails(updateDoc(doc(adminDb(), "sellerOrders", `o1_${SELLER}`), { vendorEarning: 999 }));
});

await env.cleanup();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
