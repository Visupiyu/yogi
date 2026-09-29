/*
 * LOCAL-ONLY Firestore RULES test (emulator) — B2 containment.
 *
 * Orders can no longer be deleted by any client, admin included, and the
 * archive marker (archived, archivedAt, archivedBy, archiveReason) is
 * server-only: it is written by app/api/admin/orders/[id]/archive with the
 * Admin SDK. This proves that:
 *   - no customer, vendor, stranger or admin browser can delete an order;
 *   - no client, admin browser included, can set, change or clear the marker;
 *   - the legitimate client order access that remains (owner/admin reads,
 *     admin status updates) still works, on archived orders too.
 * The archive route itself is exercised by scripts/test/order-containment/run.mts.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/order-containment/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

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

const C = "cust_owner";
const S = "stranger";
const V = "vendor_v1";
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const emailOf = (uid: string) => `${uid}@example.com`;
const as = (uid: string) => env.authenticatedContext(uid, { email: emailOf(uid), email_verified: true }).firestore();
const admin = () => env.authenticatedContext("adminUid", { email: ADMIN_EMAIL, email_verified: true }).firestore();

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "users", C), { uid: C, role: "customer", email: emailOf(C) });
  await setDoc(doc(f, "users", S), { uid: S, role: "customer", email: emailOf(S) });
  await setDoc(doc(f, "vendors", V), { uid: V, status: "Approved" });
  const order = { userId: C, vendorIds: [V], status: "Confirmed", finalTotal: 900, rewardValue: 0, items: [{ id: "p1", vendorId: V, price: 900, quantity: 1 }] };
  await setDoc(doc(f, "orders", "o_live"), order);
  await setDoc(doc(f, "orders", "o_arch"), { ...order, archived: true, archivedAt: new Date(), archivedBy: "adminUid", archiveReason: "test" });
});

const Cdb = as(C);
const Sdb = as(S);
const Vdb = as(V);
const ADb = admin();

// ================= delete =================
await check("D1 customer cannot delete their own order (live or archived)", async () => {
  await assertFails(deleteDoc(doc(Cdb, "orders", "o_live")));
  await assertFails(deleteDoc(doc(Cdb, "orders", "o_arch")));
});
await check("D2 vendor cannot delete an order carrying their items", async () => {
  await assertFails(deleteDoc(doc(Vdb, "orders", "o_live")));
});
await check("D3 another signed-in user and a signed-out client cannot delete an order", async () => {
  await assertFails(deleteDoc(doc(Sdb, "orders", "o_live")));
  await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), "orders", "o_live")));
});
await check("D4 admin browser cannot delete an order (live or archived) — archive route instead", async () => {
  await assertFails(deleteDoc(doc(ADb, "orders", "o_live")));
  await assertFails(deleteDoc(doc(ADb, "orders", "o_arch")));
});

// ================= archive marker =================
await check("M1 customer, vendor and stranger cannot archive an order (any marker field)", async () => {
  for (const db of [Cdb, Vdb, Sdb]) {
    await assertFails(updateDoc(doc(db, "orders", "o_live"), { archived: true }));
    await assertFails(updateDoc(doc(db, "orders", "o_live"), { archived: true, archivedAt: serverTimestamp(), archivedBy: "x", archiveReason: "x" }));
  }
});
await check("M2 admin browser cannot set any archive field directly", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archived: true }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archivedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archivedBy: "adminUid" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archiveReason: "x" }));
  await assertFails(setDoc(doc(ADb, "orders", "o_live"), { archived: true }, { merge: true }));
});
await check("M3 admin browser cannot un-archive, re-stamp or strip the marker", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archived: false }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archived: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archivedBy: "someoneElse" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archiveReason: deleteField() }));
});
await check("M4 no client can create an order that is born archived", async () => {
  await assertFails(setDoc(doc(Cdb, "orders", "o_new"), { userId: C, status: "Pending", archived: true, items: [] }));
  await assertFails(setDoc(doc(ADb, "orders", "o_new"), { userId: C, status: "Pending", archived: true, items: [] }));
});
await check("M5 a customer cannot forge an order_archived audit entry", async () => {
  await assertFails(addDoc(collection(Cdb, "audit_logs"), { actorUid: C, action: "order_archived", targetId: "o_live", createdAt: serverTimestamp() }));
});

// ================= legitimate access preserved =================
await check("L1 the owner and admin can still read the live and the archived order; a stranger cannot", async () => {
  await assertSucceeds(getDoc(doc(Cdb, "orders", "o_live")));
  await assertSucceeds(getDoc(doc(Cdb, "orders", "o_arch")));
  await assertSucceeds(getDoc(doc(ADb, "orders", "o_arch")));
  await assertFails(getDoc(doc(Sdb, "orders", "o_arch")));
});
await check("L2 admin browser status updates still work, on archived orders too (marker untouched)", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_live"), { status: "Packed" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_arch"), { status: "Packed" }));
});

console.log(`\n${pass}/${pass + fail} order-containment rules checks passed`);
await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
