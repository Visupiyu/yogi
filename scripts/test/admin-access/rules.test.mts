/*
 * LOCAL-ONLY RULES test (Firestore + Storage emulators) — L6 admin access.
 *
 * isAdmin() = verified email AND (owner account OR an active adminRoles/{uid}
 * record). Proves:
 *   - the owner account keeps full admin access (no lock-out);
 *   - an active, server-written adminRoles grant is honoured by Firestore AND
 *     Storage rules; an inactive / non-"admin" / unverified one is not;
 *   - no client — customer, seller, or an admin browser — can create, change or
 *     delete adminRoles (self-escalation impossible);
 *   - users/{uid}.role / isAdmin fields and the legacy adminUsers directory
 *     grant nothing;
 *   - ordinary customer/seller access is unchanged.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore,storage --project demo-yomico-test \
 *     "npx tsx scripts/test/admin-access/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadString } from "firebase/storage";

const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const stHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!fsHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(fsHost) || !stHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(stHost)) {
  console.error("REFUSING TO RUN: the Firestore and Storage emulators must both be local. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const [fh, fp] = fsHost.split(":");
const [sh, sp] = stHost.split(":");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-test",
  firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host: fh, port: Number(fp) },
  storage: { rules: fs.readFileSync(path.join(REPO, "storage.rules"), "utf8"), host: sh, port: Number(sp) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const OWNER_EMAIL = "adminyogimart@gmail.com";
const ctx = (uid: string, email: string, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified });
const owner = ctx("owner_uid", OWNER_EMAIL);
const granted = ctx("staff_ok", "staff_ok@example.com");
const revoked = ctx("staff_revoked", "staff_revoked@example.com");
const wrongRole = ctx("staff_wrongrole", "staff_wrongrole@example.com");
const unverifiedGranted = ctx("staff_unverified", "staff_unverified@example.com", false);
const customer = ctx("cust_1", "cust_1@example.com");
const seller = ctx("seller_1", "seller_1@example.com");
const forger = ctx("forger", "forger@example.com");
const legacyStaff = ctx("legacy_staff", "legacy@example.com");

await env.clearFirestore();
await env.clearStorage();
await env.withSecurityRulesDisabled(async (c) => {
  const f = c.firestore();
  const role = (uid: string, extra: Record<string, unknown>) =>
    setDoc(doc(f, "adminRoles", uid), { uid, email: `${uid}@example.com`, role: "admin", active: true, grantedByUid: "owner_uid", ...extra });
  await role("staff_ok", {});
  await role("staff_revoked", { active: false });
  await role("staff_wrongrole", { role: "viewer" });
  await role("staff_unverified", {});
  await setDoc(doc(f, "users", "forger"), { uid: "forger", role: "admin", isAdmin: true });
  await setDoc(doc(f, "adminUsers", "legacy1"), { name: "Legacy", email: "legacy@example.com", role: "Admin", status: "Active" });
  await setDoc(doc(f, "vendors", "seller_1"), { uid: "seller_1", status: "Approved" });
  await setDoc(doc(f, "orders", "o1"), { userId: "cust_1", vendorIds: ["seller_1"], status: "Confirmed", finalTotal: 500, rewardValue: 0, items: [] });
  await setDoc(doc(f, "audit_logs", "a1"), { action: "x", actorUid: "owner_uid" });
  await setDoc(doc(f, "settings", "global"), { freeShippingThreshold: 499 });
  await uploadString(ref(c.storage(), "delivery-kyc/rider_1/id.png"), "png-bytes", "raw", { contentType: "image/png" });
});

// ---- owner: never locked out ----
await check("A1 owner reads admin-only collections (audit_logs, adminUsers, adminRoles)", async () => {
  const f = owner.firestore();
  await assertSucceeds(getDoc(doc(f, "audit_logs", "a1")));
  await assertSucceeds(getDocs(collection(f, "adminUsers")));
  await assertSucceeds(getDocs(collection(f, "adminRoles")));
});
await check("A2 owner can still update orders and settings (existing admin writes intact)", async () => {
  const f = owner.firestore();
  await assertSucceeds(updateDoc(doc(f, "orders", "o1"), { adminNote: "ok" }));
  await assertSucceeds(setDoc(doc(f, "settings", "global"), { freeShippingThreshold: 599 }, { merge: true }));
});
await check("A3 owner with an UNVERIFIED email is not admin", async () => {
  await assertFails(getDoc(doc(ctx("owner_uid", OWNER_EMAIL, false).firestore(), "audit_logs", "a1")));
});

// ---- granted admin ----
await check("B1 active adminRoles grant -> admin in Firestore rules", async () => {
  const f = granted.firestore();
  await assertSucceeds(getDoc(doc(f, "audit_logs", "a1")));
  await assertSucceeds(updateDoc(doc(f, "orders", "o1"), { adminNote: "granted" }));
});
await check("B2 active grant -> admin in Storage rules (cross-service)", async () => {
  await assertSucceeds(getBytes(ref(granted.storage(), "delivery-kyc/rider_1/id.png")));
});
await check("B3 revoked / wrong-role / unverified grants -> not admin", async () => {
  await assertFails(getDoc(doc(revoked.firestore(), "audit_logs", "a1")));
  await assertFails(getDoc(doc(wrongRole.firestore(), "audit_logs", "a1")));
  await assertFails(getDoc(doc(unverifiedGranted.firestore(), "audit_logs", "a1")));
  await assertFails(getBytes(ref(revoked.storage(), "delivery-kyc/rider_1/id.png")));
});

// ---- no self-escalation ----
await check("C1 customer cannot create an adminRoles record for themselves", async () => {
  await assertFails(setDoc(doc(customer.firestore(), "adminRoles", "cust_1"), { uid: "cust_1", role: "admin", active: true }));
});
await check("C2 seller cannot create an adminRoles record", async () => {
  await assertFails(setDoc(doc(seller.firestore(), "adminRoles", "seller_1"), { uid: "seller_1", role: "admin", active: true }));
});
await check("C3 revoked staff cannot re-activate their own record", async () => {
  await assertFails(updateDoc(doc(revoked.firestore(), "adminRoles", "staff_revoked"), { active: true }));
});
await check("C4 even admins (owner, granted) cannot write adminRoles from a browser", async () => {
  await assertFails(setDoc(doc(owner.firestore(), "adminRoles", "cust_1"), { uid: "cust_1", role: "admin", active: true }));
  await assertFails(deleteDoc(doc(owner.firestore(), "adminRoles", "staff_ok")));
  await assertFails(setDoc(doc(granted.firestore(), "adminRoles", "cust_1"), { uid: "cust_1", role: "admin", active: true }));
});
await check("C5 users/{uid}.role = 'admin' / isAdmin grants nothing", async () => {
  await assertFails(getDoc(doc(forger.firestore(), "audit_logs", "a1")));
  await assertFails(updateDoc(doc(forger.firestore(), "orders", "o1"), { adminNote: "forged" }));
});
await check("C6 a customer cannot set role:'admin' on their own users doc to gain access", async () => {
  await assertFails(setDoc(doc(customer.firestore(), "users", "cust_1"), { uid: "cust_1", role: "admin" }, { merge: true }));
  await assertFails(getDoc(doc(customer.firestore(), "audit_logs", "a1")));
});
await check("C7 a legacy adminUsers directory entry grants nothing", async () => {
  await assertFails(getDoc(doc(legacyStaff.firestore(), "audit_logs", "a1")));
  await assertFails(getDocs(collection(legacyStaff.firestore(), "adminUsers")));
});
await check("C8 non-admins cannot read adminRoles", async () => {
  await assertFails(getDoc(doc(customer.firestore(), "adminRoles", "staff_ok")));
  await assertFails(getDoc(doc(seller.firestore(), "adminRoles", "staff_ok")));
});

// ---- ordinary access unchanged ----
await check("D1 customer still reads own order (sellers read via sellerOrders, unchanged)", async () => {
  await assertSucceeds(getDoc(doc(customer.firestore(), "orders", "o1")));
  await assertFails(getDoc(doc(seller.firestore(), "orders", "o1")));
});
await check("D2 a stranger still cannot read the order", async () => {
  await assertFails(getDoc(doc(ctx("stranger", "s@example.com").firestore(), "orders", "o1")));
});

console.log(`\n${pass}/${pass + fail} passed`);
await env.cleanup();
if (fail > 0) process.exitCode = 1;
