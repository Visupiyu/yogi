/*
 * LOCAL-ONLY Firestore RULES test (emulator) — seller withdrawals (B2).
 *
 * Withdrawals are SERVER-WRITTEN ONLY. No browser — admin included — may
 * create, update or delete one: Paid is reached only through
 * app/api/settle-withdrawal and the review transitions only through
 * app/api/review-withdrawal (both Admin SDK, covered by
 * scripts/test/withdrawals/run.mts). Covers direct Pending/Approved -> Paid,
 * amount / vendor identity / payoutNumber tampering, paidAt / paidBy /
 * settlementAuditId forgery, unsafe transitions (Rejected -> Pending, Paid ->
 * anything), deletes, sellers, and that reads are unchanged.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/withdrawals/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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

async function seed(id: string, status: string, extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "withdrawals", id), { ...base(status), ...extra });
  });
}
const adminDb = () => env.authenticatedContext("adminUid", { email: "adminyogimart@gmail.com", email_verified: true }).firestore();
const sellerDb = () => env.authenticatedContext(SELLER, { email: SELLER_EMAIL, email_verified: true }).firestore();
const asAdmin = (id: string) => doc(adminDb(), "withdrawals", id);
const asSeller = (id: string) => doc(sellerDb(), "withdrawals", id);
async function stored(id: string) {
  let d: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => { d = (await getDoc(doc(ctx.firestore(), "withdrawals", id))).data(); });
  return d;
}
const PAID_FIELDS = { status: "Paid", paidAt: new Date(), paidBy: "adminUid" };

await env.clearFirestore();

// ---------- direct Paid transitions denied ----------
await seed("w_p", "Pending");
await seed("w_a", "Approved");
await check("W1  admin direct Pending -> Paid DENIED", () => assertFails(updateDoc(asAdmin("w_p"), { status: "Paid" })));
await check("W2  admin direct Pending -> Paid with paidAt/paidBy DENIED", () => assertFails(updateDoc(asAdmin("w_p"), PAID_FIELDS)));
await check("W3  admin direct Approved -> Paid DENIED", () => assertFails(updateDoc(asAdmin("w_a"), { status: "Paid" })));
await check("W4  admin direct Approved -> Paid with paidAt/paidBy DENIED", () => assertFails(updateDoc(asAdmin("w_a"), PAID_FIELDS)));
await check("W5  admin set(merge) Paid DENIED", () => assertFails(setDoc(asAdmin("w_a"), { status: "Paid" }, { merge: true })));
await check("W6  seller direct Pending -> Paid DENIED", () => assertFails(updateDoc(asSeller("w_p"), { status: "Paid" })));

// ---------- identity / financial / idempotency field tampering denied ----------
for (const [label, patch] of [
  ["amount", { amount: 1 }],
  ["amount (as string)", { amount: "500" }],
  ["vendorId", { vendorId: "someone_else" }],
  ["vendorEmail", { vendorEmail: "other@example.com" }],
  ["vendorName", { vendorName: "Other Traders" }],
  ["payoutNumber", { payoutNumber: "PO-OTHER" }],
  ["createdAt", { createdAt: new Date() }],
] as const) {
  await check(`W7  admin changing ${label} on a Pending withdrawal DENIED`, () => assertFails(updateDoc(asAdmin("w_p"), patch)));
  await check(`W8  seller changing ${label} on their own withdrawal DENIED`, () => assertFails(updateDoc(asSeller("w_p"), patch)));
}

// ---------- paidAt / paidBy / audit-link forgery denied ----------
await seed("w_paid", "Paid", { paidAt: new Date("2026-09-02T00:00:00Z"), paidBy: "realAdmin", settlementAuditId: "audit_1" });
for (const [label, patch] of [
  ["paidAt", { paidAt: new Date() }],
  ["paidBy", { paidBy: "attacker" }],
  ["settlementAuditId", { settlementAuditId: "forged" }],
  ["paidAt removal", { paidAt: deleteField() }],
] as const) {
  await check(`W9  admin changing ${label} on a Paid withdrawal DENIED`, () => assertFails(updateDoc(asAdmin("w_paid"), patch)));
}
await check("W10 admin pre-stamping paidAt/paidBy on a Pending withdrawal DENIED", () =>
  assertFails(updateDoc(asAdmin("w_p"), { paidAt: new Date(), paidBy: "adminUid" })));
await check("W10b admin adding a non-money note to a Paid withdrawal DENIED (server-only now)", () =>
  assertFails(updateDoc(asAdmin("w_paid"), { adminNote: "bank ref checked" })));

// ---------- unsafe / any direct status transitions denied ----------
await seed("w_r", "Rejected");
await check("W11 admin Rejected -> Pending DENIED (would re-reserve without balance validation)", () =>
  assertFails(updateDoc(asAdmin("w_r"), { status: "Pending" })));
await check("W12 admin Rejected -> Approved DENIED", () => assertFails(updateDoc(asAdmin("w_r"), { status: "Approved" })));
await check("W13 admin Rejected -> Paid DENIED", () => assertFails(updateDoc(asAdmin("w_r"), { status: "Paid" })));
await check("W14 admin Paid -> Rejected / Pending / Approved DENIED", async () => {
  for (const s of ["Rejected", "Pending", "Approved"]) await assertFails(updateDoc(asAdmin("w_paid"), { status: s }));
});
await check("W15 admin removing status DENIED", () => assertFails(updateDoc(asAdmin("w_p"), { status: deleteField() })));
await check("W16 admin direct Pending -> Approved / Rejected DENIED (moved to app/api/review-withdrawal)", async () => {
  await assertFails(updateDoc(asAdmin("w_p"), { status: "Approved" }));
  await assertFails(updateDoc(asAdmin("w_p"), { status: "Rejected" }));
});

// ---------- create / delete denied ----------
await check("W17 seller cannot create a withdrawal", () => assertFails(setDoc(doc(sellerDb(), "withdrawals", "w_new"), base("Pending"))));
await check("W18 admin cannot create a withdrawal (e.g. a pre-Paid one)", () =>
  assertFails(setDoc(doc(adminDb(), "withdrawals", "w_new2"), { ...base("Paid"), ...PAID_FIELDS })));
await check("W19 admin cannot overwrite a withdrawal with set()", () => assertFails(setDoc(asAdmin("w_p"), base("Paid"))));
await check("W20 admin cannot delete a Pending / Rejected / Paid withdrawal", async () => {
  for (const id of ["w_p", "w_r", "w_paid"]) await assertFails(deleteDoc(asAdmin(id)));
});

// ---------- nothing changed; reads unchanged ----------
await check("W21 after all of the above every withdrawal is exactly as seeded", async () => {
  const p = await stored("w_p"), a = await stored("w_a"), r = await stored("w_r"), paid = await stored("w_paid");
  if (p?.status !== "Pending" || p?.amount !== 500 || p?.vendorId !== SELLER || "paidAt" in (p || {})) throw new Error(`w_p ${JSON.stringify(p)}`);
  if (a?.status !== "Approved" || r?.status !== "Rejected") throw new Error(`a=${a?.status} r=${r?.status}`);
  if (paid?.status !== "Paid" || paid?.paidBy !== "realAdmin" || paid?.settlementAuditId !== "audit_1") throw new Error(`paid ${JSON.stringify(paid)}`);
});
await check("W22 seller can still read their own withdrawal (by vendorEmail)", () => assertSucceeds(getDoc(asSeller("w_paid"))));
await check("W23 admin can still read a withdrawal", () => assertSucceeds(getDoc(asAdmin("w_paid"))));
await check("W24 another seller cannot read it", () =>
  assertFails(getDoc(doc(env.authenticatedContext("other_seller", { email: "other@example.com", email_verified: true }).firestore(), "withdrawals", "w_p"))));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} withdrawal rules checks passed`);
if (fail > 0) process.exitCode = 1;
