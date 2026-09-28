/*
 * LOCAL-ONLY Firestore RULES test (emulator) — delivery-proof finality.
 * Proves that the assigned delivery partner can still attach or replace
 * orders.proofImage on the way INTO Delivered and on every re-attempt
 * (Delivery Failed -> Out For Delivery -> Delivered), but can no longer
 * change or remove it once the order is already Delivered — while admin,
 * buyer and seller permissions and every other delivery-partner write are
 * unchanged. Loads the repository's firestore.rules into the emulator and
 * uses synthetic documents only.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-delivery \
 *     "npx tsx scripts/test/delivery-proof/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp, deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostPort)) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not a local emulator. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const [host, port] = hostPort.split(":");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-delivery",
  firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host, port: Number(port) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const PROOF_FINAL = "https://example.invalid/delivery-proof/rider1/final.jpg";
const base = {
  userId: "buyer1",
  vendorIds: ["seller1"],
  paymentMethod: "COD",
  paymentStatus: "Pending",
  deliveryPartnerId: "dp1",
  deliveryNotes: "",
};

async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "deliveryPartners", "dp1"), { uid: "rider1", name: "Rider One" });
    await setDoc(doc(db, "deliveryPartners", "dp2"), { uid: "rider2", name: "Rider Two" });
    await setDoc(doc(db, "orders", "o_ofd"), { ...base, status: "Out For Delivery", proofImage: "", deliveredAt: null });
    await setDoc(doc(db, "orders", "o_failed"), {
      ...base, status: "Delivery Failed", proofImage: "https://example.invalid/delivery-proof/rider1/attempt1.jpg", deliveredAt: null,
    });
    await setDoc(doc(db, "orders", "o_retry"), { ...base, status: "Out For Delivery", proofImage: "", deliveredAt: null });
    await setDoc(doc(db, "orders", "o_delivered"), {
      ...base, status: "Delivered", proofImage: PROOF_FINAL, deliveredAt: Timestamp.fromMillis(1_700_000_000_000),
    });
    await setDoc(doc(db, "orders", "o_pending"), { ...base, status: "Pending", proofImage: "", deliveredAt: null });
  });
}

const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const order = (uid: string, id: string, email?: string) => doc(as(uid, email), "orders", id);
const ADMIN = "adminyogimart@gmail.com";

await reseed();

// ---- Proof is attached on the way INTO Delivered ----
await check("1  partner: Out For Delivery -> Delivered with proofImage added — ALLOWED", () =>
  assertSucceeds(updateDoc(order("rider1", "o_ofd"), {
    status: "Delivered", proofImage: "https://example.invalid/delivery-proof/rider1/new.jpg",
    deliveryNotes: "Handed to customer", deliveredAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })));

// ---- Re-attempts keep working ----
await check("2  partner: Delivery Failed -> Out For Delivery with a new proofImage — ALLOWED", () =>
  assertSucceeds(updateDoc(order("rider1", "o_failed"), {
    status: "Out For Delivery", proofImage: "https://example.invalid/delivery-proof/rider1/attempt2.jpg",
    deliveredAt: null, updatedAt: serverTimestamp(),
  })));
await check("2b partner: full retry cycle OFD -> Failed -> OFD -> Delivered, new proof each step — ALLOWED", async () => {
  const ref = () => order("rider1", "o_retry");
  await assertSucceeds(updateDoc(ref(), {
    status: "Delivery Failed", proofImage: "https://example.invalid/delivery-proof/rider1/r1.jpg", deliveredAt: null, updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(ref(), {
    status: "Out For Delivery", proofImage: "https://example.invalid/delivery-proof/rider1/r2.jpg", deliveredAt: null, updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(ref(), {
    status: "Delivered", proofImage: "https://example.invalid/delivery-proof/rider1/r3.jpg", deliveredAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
});

// ---- Final once Delivered ----
await check("3  partner: Delivered order, proofImage changed — DENIED (was allowed)", () =>
  assertFails(updateDoc(order("rider1", "o_delivered"), {
    proofImage: "https://example.invalid/delivery-proof/rider1/swapped.jpg", updatedAt: serverTimestamp(),
  })));
await check("4  partner: Delivered order, proofImage removed — DENIED (was allowed)", () =>
  assertFails(updateDoc(order("rider1", "o_delivered"), { proofImage: deleteField(), updatedAt: serverTimestamp() })));
await check("4b partner: Delivered order, proofImage blanked — DENIED (was allowed)", () =>
  assertFails(updateDoc(order("rider1", "o_delivered"), { proofImage: "", updatedAt: serverTimestamp() })));
await check("5  partner: Delivered order, notes-only update (proofImage unchanged) — still ALLOWED", () =>
  assertSucceeds(updateDoc(order("rider1", "o_delivered"), { deliveryNotes: "Left with neighbour", updatedAt: serverTimestamp() })));
await check("5b partner: Delivered order, same proofImage re-sent with notes — still ALLOWED", () =>
  assertSucceeds(updateDoc(order("rider1", "o_delivered"), {
    deliveryNotes: "Signed by customer", proofImage: PROOF_FINAL, updatedAt: serverTimestamp(),
  })));
await check("5c partner: Delivered order, deliveredAt re-stamp — still DENIED (unchanged rule)", () =>
  assertFails(updateDoc(order("rider1", "o_delivered"), { deliveredAt: serverTimestamp(), updatedAt: serverTimestamp() })));

// ---- Admin unchanged ----
await check("6  admin: Delivered order proofImage change — still ALLOWED", () =>
  assertSucceeds(updateDoc(order("adminUid", "o_delivered", ADMIN), {
    proofImage: "https://example.invalid/delivery-proof/admin-corrected.jpg", updatedAt: serverTimestamp(),
  })));

// ---- Other actors unchanged ----
await reseed();
await check("7  unrelated partner: cannot deliver someone else's order — DENIED", () =>
  assertFails(updateDoc(order("rider2", "o_ofd"), {
    status: "Delivered", proofImage: "https://example.invalid/x.jpg", deliveredAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })));
await check("7b unrelated partner: cannot change proofImage on someone else's order — DENIED", () =>
  assertFails(updateDoc(order("rider2", "o_ofd"), { proofImage: "https://example.invalid/x.jpg", updatedAt: serverTimestamp() })));
await check("8  buyer: cannot change proofImage — DENIED", () =>
  assertFails(updateDoc(order("buyer1", "o_delivered"), { proofImage: "https://example.invalid/x.jpg" })));
await check("8b seller: cannot change proofImage — DENIED", () =>
  assertFails(updateDoc(order("seller1", "o_delivered"), { proofImage: "https://example.invalid/x.jpg", updatedAt: serverTimestamp() })));
// Seller Order & Fulfillment hardening: a Delivered order is closed to seller
// edits (and a multi-seller order never takes a seller's order-level write).
await check("8c seller: tracking update on a Delivered order — now DENIED (order closed)", () =>
  assertFails(updateDoc(order("seller1", "o_delivered"), { trackingNumber: "TRK123", updatedAt: serverTimestamp() })));
// Customer Account hardening: cancelling goes through app/api/cancel-order
// only (stock, rewards, coupons and the seller's notice are handled there).
await check("8d buyer: direct cancel of own Pending order — now DENIED (app/api/cancel-order only)", () =>
  assertFails(updateDoc(order("buyer1", "o_pending"), { status: "Cancelled", updatedAt: serverTimestamp() })));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} delivery-proof rules checks passed`);
if (fail > 0) process.exitCode = 1;
