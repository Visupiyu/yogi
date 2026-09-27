/*
 * LOCAL-ONLY Firestore RULES test (emulator) — seller withdrawals.
 * A Paid withdrawal is final: its status can never move again, what was paid
 * and to whom (amount, vendorId, vendorEmail) is frozen, and it cannot be
 * deleted — any of those would drop it out of lib/vendorPayable.ts's
 * committed total and make the same money payable twice. The existing admin
 * transitions between Pending, Approved and Rejected are unchanged, sellers
 * still cannot create or update withdrawals, and reads are unchanged.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/withdrawals/rules.test.mts"
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

const SELLER = "seller_wd";
const SELLER_EMAIL = "seller_wd@example.com";
const base = (status: string) => ({
  vendorId: SELLER, vendorEmail: SELLER_EMAIL, vendorName: "WD Traders", payoutNumber: "PO-TEST",
  amount: 500, status, createdAt: new Date("2026-09-01T00:00:00Z"),
});

async function seed(id: string, status: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "withdrawals", id), base(status));
  });
}
const adminDb = () => env.authenticatedContext("adminUid", { email: "adminyogimart@gmail.com", email_verified: true }).firestore();
const sellerDb = () => env.authenticatedContext(SELLER, { email: SELLER_EMAIL, email_verified: true }).firestore();
const asAdmin = (id: string) => doc(adminDb(), "withdrawals", id);
const asSeller = (id: string) => doc(sellerDb(), "withdrawals", id);
async function statusOf(id: string) {
  let s: unknown;
  await env.withSecurityRulesDisabled(async (ctx) => { s = (await getDoc(doc(ctx.firestore(), "withdrawals", id))).data()?.status; });
  return s;
}

await env.clearFirestore();

// ---------- existing transitions still work ----------
await seed("w_p1", "Pending");
await check("W1  admin Pending -> Approved allowed", () => assertSucceeds(updateDoc(asAdmin("w_p1"), { status: "Approved" })));
await seed("w_p2", "Pending");
await check("W2  admin Pending -> Rejected allowed", () => assertSucceeds(updateDoc(asAdmin("w_p2"), { status: "Rejected" })));
await seed("w_a1", "Approved");
await check("W3  admin Approved -> Rejected allowed", () => assertSucceeds(updateDoc(asAdmin("w_a1"), { status: "Rejected" })));
await seed("w_a2", "Approved");
await check("W4  admin Approved -> Pending allowed", () => assertSucceeds(updateDoc(asAdmin("w_a2"), { status: "Pending" })));
await seed("w_r1", "Rejected");
await check("W5  admin Rejected -> Pending allowed (unchanged behaviour)", () => assertSucceeds(updateDoc(asAdmin("w_r1"), { status: "Pending" })));
await seed("w_del", "Rejected");
await check("W6  admin can still delete a non-Paid withdrawal", () => assertSucceeds(deleteDoc(asAdmin("w_del"))));

// ---------- Paid is final ----------
await seed("w_paid", "Paid");
await check("W7  admin Paid -> Rejected DENIED", () => assertFails(updateDoc(asAdmin("w_paid"), { status: "Rejected" })));
await check("W8  admin Paid -> Pending DENIED", () => assertFails(updateDoc(asAdmin("w_paid"), { status: "Pending" })));
await check("W9  admin Paid -> Approved DENIED", () => assertFails(updateDoc(asAdmin("w_paid"), { status: "Approved" })));
await check("W10 admin removing status from a Paid withdrawal DENIED", async () => {
  const { deleteField } = await import("firebase/firestore");
  await assertFails(updateDoc(asAdmin("w_paid"), { status: deleteField() }));
});
await check("W11 admin changing a Paid withdrawal's amount DENIED", () => assertFails(updateDoc(asAdmin("w_paid"), { amount: 1 })));
await check("W12 admin changing a Paid withdrawal's vendorId / vendorEmail DENIED", async () => {
  await assertFails(updateDoc(asAdmin("w_paid"), { vendorId: "someone_else" }));
  await assertFails(updateDoc(asAdmin("w_paid"), { vendorEmail: "other@example.com" }));
});
await check("W13 admin deleting a Paid withdrawal DENIED", () => assertFails(deleteDoc(asAdmin("w_paid"))));
await check("W14 Paid stays Paid: re-writing status Paid with a non-money note is allowed", () =>
  assertSucceeds(updateDoc(asAdmin("w_paid"), { status: "Paid", adminNote: "bank ref checked" })));
await check("W15 after all of the above the withdrawal is still Paid", async () => {
  const s = await statusOf("w_paid");
  if (s !== "Paid") throw new Error(`status is ${String(s)}`);
});

// ---------- sellers unchanged ----------
await seed("w_s1", "Pending");
await check("W16 seller cannot update their own withdrawal (status)", () => assertFails(updateDoc(asSeller("w_s1"), { status: "Paid" })));
await check("W17 seller cannot create a withdrawal (server route only)", () =>
  assertFails(setDoc(doc(sellerDb(), "withdrawals", "w_new"), base("Pending"))));
await check("W18 seller can still read their own withdrawal (by vendorEmail)", () => assertSucceeds(getDoc(asSeller("w_paid"))));
await check("W19 admin can still read a Paid withdrawal", () => assertSucceeds(getDoc(asAdmin("w_paid"))));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} withdrawal rules checks passed`);
if (fail > 0) process.exitCode = 1;
