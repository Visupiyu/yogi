/*
 * LOCAL-ONLY Firestore RULES test (emulator) — couponRedemptions.
 * Proves that no client can create a coupon redemption (every legitimate
 * claim is written server-side with the Admin SDK, which bypasses rules), so
 * nobody can pre-create couponRedemptions/{otherUid}_{CODE} to block another
 * customer's coupon — while the existing read, update and delete behaviour
 * (including the owner releasing the claim of a cancelled order) is
 * unchanged. Loads the repository's firestore.rules into the emulator and uses
 * synthetic documents only.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-coupon-rules \
 *     "npx tsx scripts/test/coupons/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostPort)) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not a local emulator. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const [host, port] = hostPort.split(":");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-coupon-rules",
  firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host, port: Number(port) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const claim = (userId: string, code: string, orderId: string) =>
  ({ userId, userEmail: `${userId}@example.com`, code, orderId, createdAt: new Date(1_700_000_000_000) });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "orders", "o_confirmed"), { userId: "alice", status: "Confirmed", vendorIds: ["seller1"] });
  await setDoc(doc(db, "orders", "o_cancelled"), { userId: "alice", status: "Cancelled", vendorIds: ["seller1"] });
  await setDoc(doc(db, "couponRedemptions", "alice_SAVE10"), claim("alice", "SAVE10", "o_confirmed"));
  await setDoc(doc(db, "couponRedemptions", "alice_OFF20"), claim("alice", "OFF20", "o_cancelled"));
  await setDoc(doc(db, "couponRedemptions", "legacyRandomId1"), claim("alice", "OLD5", "o_confirmed"));
});

const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const admin = () => as("adminUid", "adminyogimart@gmail.com");
const red = (db: ReturnType<typeof anon>, id: string) => doc(db, "couponRedemptions", id);

// ============ CREATE — server-only ============
await check("C1 signed-out client CANNOT create a redemption", () =>
  assertFails(setDoc(red(anon(), "alice_NEW1"), claim("alice", "NEW1", "o_confirmed"))));
await check("C2 signed-in client CANNOT create its OWN redemption (was allowed)", () =>
  assertFails(setDoc(red(as("alice"), "alice_NEW2"), claim("alice", "NEW2", "o_confirmed"))));
await check("C3 signed-in client CANNOT create ANOTHER user's deterministic id with its own userId (was allowed — the blocking attack)", () =>
  assertFails(setDoc(red(as("bob"), "alice_NEW3"), claim("bob", "NEW3", "o_confirmed"))));
await check("C4 signed-in client CANNOT create another user's redemption as that user", () =>
  assertFails(setDoc(red(as("bob"), "alice_NEW4"), claim("alice", "NEW4", "o_confirmed"))));
await check("C5 signed-in client CANNOT create a random-id redemption (was allowed)", () =>
  assertFails(setDoc(red(as("bob"), "randomId2"), claim("bob", "NEW5", "o_confirmed"))));
await check("C6 admin CLIENT SDK create also refused (admin claims go through the server too)", () =>
  assertFails(setDoc(red(admin(), "alice_NEW6"), claim("alice", "NEW6", "o_confirmed"))));
await check("C7 server path (Admin SDK bypasses rules — modelled with rules disabled) can still create", () =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "couponRedemptions", "alice_SERVER"), claim("alice", "SERVER", "o_confirmed"));
    const snap = await getDoc(doc(ctx.firestore(), "couponRedemptions", "alice_SERVER"));
    if (!snap.exists()) throw new Error("server-side create did not persist");
  }));

// ============ READ — unchanged ============
await check("R1 owner reads own deterministic redemption", () => assertSucceeds(getDoc(red(as("alice"), "alice_SAVE10"))));
await check("R2 owner runs the checkout pre-check query (userId + code)", () =>
  assertSucceeds(getDocs(query(collection(as("alice"), "couponRedemptions"), where("userId", "==", "alice"), where("code", "==", "SAVE10")))));
await check("R3 owner may probe their OWN not-yet-existing id", () => assertSucceeds(getDoc(red(as("alice"), "alice_NEVER"))));
await check("R4 owner reads a legacy random-id redemption by stored userId", () =>
  assertSucceeds(getDoc(red(as("alice"), "legacyRandomId1"))));
await check("R5 another user CANNOT read someone's redemption", () => assertFails(getDoc(red(as("bob"), "alice_SAVE10"))));
await check("R6 another user CANNOT probe someone's not-yet-existing id", () => assertFails(getDoc(red(as("bob"), "alice_NEVER"))));
await check("R7 signed-out client CANNOT read", () => assertFails(getDoc(red(anon(), "alice_SAVE10"))));
await check("R8 admin can read", () => assertSucceeds(getDoc(red(admin(), "alice_SAVE10"))));

// ============ UPDATE — unchanged (admin only) ============
await check("U1 owner CANNOT update a redemption", () => assertFails(updateDoc(red(as("alice"), "alice_SAVE10"), { orderId: "o_other" })));
await check("U2 another user CANNOT update a redemption", () => assertFails(updateDoc(red(as("bob"), "alice_SAVE10"), { orderId: "o_other" })));
await check("U3 admin can update a redemption", () => assertSucceeds(updateDoc(red(admin(), "alice_SAVE10"), { note: "reviewed" })));

// ============ DELETE — unchanged ============
await check("D1 owner CANNOT delete the claim of a non-cancelled order", () => assertFails(deleteDoc(red(as("alice"), "alice_SAVE10"))));
await check("D2 another user CANNOT delete someone's cancelled-order claim", () => assertFails(deleteDoc(red(as("bob"), "alice_OFF20"))));
await check("D3 owner CAN release the claim of their cancelled order", () => assertSucceeds(deleteDoc(red(as("alice"), "alice_OFF20"))));
await check("D4 admin can delete a redemption", () => assertSucceeds(deleteDoc(red(admin(), "legacyRandomId1"))));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} coupon redemption rules checks passed`);
if (fail > 0) process.exitCode = 1;
