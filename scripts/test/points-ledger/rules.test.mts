/*
 * LOCAL-ONLY Firestore RULES test (emulator) — Rewards Stage A4.
 *
 * Reward balances, the points ledger, referral reward state, order reward
 * state and the old-style return credit flag are SERVER-ONLY (lib/points on
 * the Admin SDK, which bypasses rules). This proves that:
 *   - customers cannot create, change, delete or forge any of it;
 *   - admin browser writes cannot move points or ledger rows either;
 *   - the legitimate client writes that remain (signup / Customer App
 *     profile creation, profile edits, admin Block/Unblock, admin order and
 *     return screens) still work;
 *   - alternate document paths (subcollections, look-alike collections)
 *     grant nothing.
 * The server flows themselves are exercised by scripts/test/points-ledger/run.mts.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/points-ledger/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where,
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

const M = "mallory";   // attacker customer
const A = "alice";     // another customer
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const emailOf = (uid: string) => `${uid}@example.com`;
const as = (uid: string, email = emailOf(uid)) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const admin = () => env.authenticatedContext("adminUid", { email: ADMIN_EMAIL, email_verified: true }).firestore();

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "users", M), { uid: M, role: "customer", email: emailOf(M), name: "Mal", rewardPoints: 50, totalReferrals: 1, referralCode: "YOGI111111", referredBy: "YOGI222222", signupRewardsGrantedAt: new Date(), rewardsEligibleAt: new Date(), rewardsEligibleOrderId: "o_done" });
  await setDoc(doc(f, "users", A), { uid: A, role: "customer", email: emailOf(A), name: "Alice", rewardPoints: 10, totalReferrals: 0, referralCode: "YOGI222222", status: "Active" });
  await setDoc(doc(f, "rewardTransactions", `earned_o_mal`), { v: 2, kind: "purchase_earned", userId: M, userEmail: emailOf(M), type: "Earned", points: 5, delta: 5, balanceBefore: 45, balanceAfter: 50, orderId: "o_mal", createdAt: new Date() });
  await setDoc(doc(f, "rewardTransactions", `redeem_o_alice`), { v: 2, kind: "checkout_redeem", userId: A, userEmail: emailOf(A), type: "Redeemed", points: 5, delta: -5, balanceBefore: 15, balanceAfter: 10, orderId: "o_alice", createdAt: new Date() });
  await setDoc(doc(f, "orders", "o_mal"), { userId: M, status: "Pending", finalTotal: 900, rewardValue: 100, rewardShortfall: 100, rewardPointsStatus: "pending", items: [] });
  await setDoc(doc(f, "orders", "o_done"), { userId: M, status: "Delivered", finalTotal: 900, rewardValue: 0, rewardPointsStatus: "credited", rewardPointsCredited: 9, items: [] });
  await setDoc(doc(f, "returns", "ret_mal"), { userId: M, userEmail: emailOf(M), orderId: "o_done", refundAmount: 100, status: "Refunded", pointsCredited: true, pointsCreditedAt: new Date() });
  await setDoc(doc(f, "returns", "ret_legacy"), { userId: M, userEmail: emailOf(M), orderId: "o_done", refundAmount: 100, status: "Refunded" });
  await setDoc(doc(f, "itemRequests", "ir_mal"), { userId: M, type: "return", status: "REFUNDED", refund: { amount: 100, credited: true } });
});

const Mdb = as(M);
const ADb = admin();

// ================= customer: balance =================
await check("B1 customer cannot increase, change, zero or delete their own rewardPoints", async () => {
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardPoints: 99999 }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardPoints: increment(1) }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardPoints: 0 }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardPoints: deleteField() }));
  await assertFails(setDoc(doc(Mdb, "users", M), { rewardPoints: 100000 }, { merge: true }));
});
await check("B2 customer cannot change another customer's balance or profile", async () => {
  await assertFails(updateDoc(doc(Mdb, "users", A), { rewardPoints: 0 }));
  await assertFails(updateDoc(doc(Mdb, "users", A), { name: "x" }));
});
await check("B3 a self-created profile cannot open with a balance, referral count, own code or settled stamp", async () => {
  const N = as("newbie1");
  const base = { uid: "newbie1", role: "customer", email: emailOf("newbie1"), name: "N" };
  await assertFails(setDoc(doc(N, "users", "newbie1"), { ...base, rewardPoints: 100 }));
  await assertFails(setDoc(doc(N, "users", "newbie1"), { ...base, totalReferrals: 3 }));
  await assertFails(setDoc(doc(N, "users", "newbie1"), { ...base, referralCode: "YOGI999999" }));
  await assertFails(setDoc(doc(N, "users", "newbie1"), { ...base, signupRewardsGrantedAt: new Date() }));
});

// ================= customer: referral state =================
await check("R1 customer cannot forge referral reward state (stamp set/cleared, referredBy re-pointed, own code rewritten, referral count raised)", async () => {
  await assertFails(updateDoc(doc(Mdb, "users", M), { signupRewardsGrantedAt: deleteField() }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { signupRewardsGrantedAt: new Date() }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { referredBy: "YOGI333333" }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { referralCode: "YOGI222222" }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { totalReferrals: 50 }));
});

// ================= customer: ledger =================
await check("L1 customer cannot create ledger rows — random id, own fixed id, or a forged v2 referral/redeem row", async () => {
  await assertFails(addDoc(collection(Mdb, "rewardTransactions"), { userId: M, userEmail: emailOf(M), type: "Earned", points: 1000 }));
  await assertFails(setDoc(doc(Mdb, "rewardTransactions", `referral_${M}`), { v: 2, kind: "referral_welcome", userId: M, type: "Referral Bonus", points: 50, delta: 50 }));
  await assertFails(setDoc(doc(Mdb, "rewardTransactions", `redeem_o_mal`), { v: 2, kind: "checkout_redeem", userId: M, type: "Redeemed", points: 0, delta: 0 }));
  await assertFails(setDoc(doc(Mdb, "rewardTransactions", `referrer_x`), { userId: A, type: "Referral Bonus", points: 100 }));
});
await check("L2 customer cannot modify or delete their own ledger rows", async () => {
  await assertFails(updateDoc(doc(Mdb, "rewardTransactions", "earned_o_mal"), { points: 500, delta: 500 }));
  await assertFails(setDoc(doc(Mdb, "rewardTransactions", "earned_o_mal"), { userId: M, points: 500 }));
  await assertFails(deleteDoc(doc(Mdb, "rewardTransactions", "earned_o_mal")));
});
await check("L3 ledger reads unchanged: owner reads own rows; not another customer's", async () => {
  await assertSucceeds(getDoc(doc(Mdb, "rewardTransactions", "earned_o_mal")));
  await assertSucceeds(getDocs(query(collection(Mdb, "rewardTransactions"), where("userId", "==", M))));
  await assertFails(getDoc(doc(Mdb, "rewardTransactions", "redeem_o_alice")));
});

await check("L4 pointsHolds (checkout points reserve) is server-only: a customer cannot read, create, change or delete it", async () => {
  await assertFails(getDoc(doc(Mdb, "pointsHolds", M)));
  await assertFails(setDoc(doc(Mdb, "pointsHolds", M), { uid: M, points: 0, expiresAt: new Date() }));
  await assertFails(setDoc(doc(Mdb, "pointsHolds", A), { uid: A, points: 999999, expiresAt: new Date(Date.now() + 1e9) }));
  await assertFails(deleteDoc(doc(Mdb, "pointsHolds", M)));
});

// ================= customer: order / return / item-request reward state =================
await check("O1 customer cannot write order reward state (rewardValue, rewardShortfall, rewardPointsStatus, credited)", async () => {
  await assertFails(updateDoc(doc(Mdb, "orders", "o_mal"), { rewardShortfall: 0 }));
  await assertFails(updateDoc(doc(Mdb, "orders", "o_done"), { rewardPointsStatus: "pending" }));
});
await check("O2 customer cannot write return credit flags or item-request refund credit", async () => {
  await assertFails(updateDoc(doc(Mdb, "returns", "ret_mal"), { pointsCredited: false }));
  await assertFails(updateDoc(doc(Mdb, "itemRequests", "ir_mal"), { "refund.credited": false }));
});

// ================= admin browser: cannot move points either =================
await check("A1 admin browser cannot create, edit or delete ledger rows (server-only, immutable)", async () => {
  await assertFails(addDoc(collection(ADb, "rewardTransactions"), { userId: A, type: "Adjustment", points: 10 }));
  await assertFails(setDoc(doc(ADb, "rewardTransactions", "adjustment_x"), { userId: A, v: 2, kind: "adjustment", delta: 10 }));
  await assertFails(updateDoc(doc(ADb, "rewardTransactions", "earned_o_mal"), { points: 1 }));
  await assertFails(deleteDoc(doc(ADb, "rewardTransactions", "earned_o_mal")));
});
await check("A2 admin browser cannot write a balance or referral state", async () => {
  await assertFails(updateDoc(doc(ADb, "users", A), { rewardPoints: 5000 }));
  await assertFails(updateDoc(doc(ADb, "users", A), { totalReferrals: 9 }));
  await assertFails(updateDoc(doc(ADb, "users", M), { signupRewardsGrantedAt: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "users", M), { referredBy: "YOGI000000" }));
  await assertFails(updateDoc(doc(ADb, "users", A), { referralCode: "YOGI555555" }));
});
await check("A3 admin browser cannot write order reward state", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_mal"), { rewardShortfall: 0 }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_mal"), { rewardValue: 500 }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_done"), { rewardPointsStatus: "pending" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_done"), { rewardPointsCredited: 900 }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_mal"), { rewardPointsCreditedAt: new Date() }));
});
await check("A4 admin browser cannot change a return's status or its points-credit flag (server route only)", async () => {
  await assertFails(updateDoc(doc(ADb, "returns", "ret_mal"), { pointsCredited: false }));
  await assertFails(updateDoc(doc(ADb, "returns", "ret_mal"), { pointsCredited: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "returns", "ret_legacy"), { status: "Approved" }));
  await assertFails(updateDoc(doc(ADb, "returns", "ret_legacy"), { pointsCredited: true }));
});

// ================= rewards eligibility (first qualifying purchase) =================
await check("E1 customer cannot CREATE a profile carrying rewardsEligibleAt / rewardsEligibleOrderId", async () => {
  const N = as("newbie4");
  const base = { uid: "newbie4", role: "customer", email: emailOf("newbie4"), name: "N" };
  await assertFails(setDoc(doc(N, "users", "newbie4"), { ...base, rewardsEligibleAt: new Date() }));
  await assertFails(setDoc(doc(N, "users", "newbie4"), { ...base, rewardsEligibleOrderId: "o_x" }));
  await assertFails(setDoc(doc(N, "users", "newbie4"), { ...base, rewardsEligibleAt: new Date(), rewardsEligibleOrderId: "o_x" }));
});
await check("E2 customer cannot add, modify or delete their eligibility stamp", async () => {
  const Adb = as(A);
  await assertFails(updateDoc(doc(Adb, "users", A), { rewardsEligibleAt: new Date() }));
  await assertFails(updateDoc(doc(Adb, "users", A), { rewardsEligibleOrderId: "o_alice" }));
  await assertFails(setDoc(doc(Adb, "users", A), { rewardsEligibleAt: new Date() }, { merge: true }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardsEligibleAt: new Date(0) }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardsEligibleOrderId: "o_other" }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardsEligibleAt: deleteField() }));
  await assertFails(updateDoc(doc(Mdb, "users", M), { rewardsEligibleOrderId: deleteField() }));
});
await check("E3 admin browser cannot add, modify or delete an eligibility stamp", async () => {
  await assertFails(updateDoc(doc(ADb, "users", A), { rewardsEligibleAt: new Date() }));
  await assertFails(updateDoc(doc(ADb, "users", A), { rewardsEligibleOrderId: "o_alice" }));
  await assertFails(updateDoc(doc(ADb, "users", M), { rewardsEligibleAt: new Date(0) }));
  await assertFails(updateDoc(doc(ADb, "users", M), { rewardsEligibleOrderId: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "users", M), { rewardsEligibleAt: deleteField() }));
});
await check("E4 a stamped customer can still edit ordinary profile fields; admin can still Block/Unblock them", async () => {
  await assertSucceeds(updateDoc(doc(Mdb, "users", M), { name: "Mallory M", phone: "9000000000" }));
  await assertSucceeds(updateDoc(doc(ADb, "users", M), { status: "Blocked" }));
  await assertSucceeds(updateDoc(doc(ADb, "users", M), { status: "Active" }));
});

// ================= legitimate client writes still work =================
await check("OK1 web signup profile and Customer App registration profile can still be created (referredBy allowed at creation)", async () => {
  const W = as("newbie2");
  await assertSucceeds(setDoc(doc(W, "users", "newbie2"), { uid: "newbie2", name: "N", email: emailOf("newbie2"), phone: "9999999999", role: "customer", rewardPoints: 0, referredBy: "YOGI222222", totalReferrals: 0, createdAt: new Date() }));
  const C = as("newbie3");
  await assertSucceeds(setDoc(doc(C, "users", "newbie3"), { uid: "newbie3", name: "N", email: "Newbie3@Example.com ", mobile: "9999999999", role: "customer", createdAt: serverTimestamp() }));
});
await check("OK2 customer can still edit their own profile fields (web and Customer App)", async () => {
  await assertSucceeds(updateDoc(doc(Mdb, "users", M), { name: "Mallory", phone: "9876543210" }));
  await assertSucceeds(updateDoc(doc(Mdb, "users", M), { name: "Mal", mobile: "9876543210" }));
});
await check("OK3 admin can still Block/Unblock a customer and read balances and ledger", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "users", A), { status: "Blocked" }));
  await assertSucceeds(updateDoc(doc(ADb, "users", A), { status: "Active" }));
  await assertSucceeds(getDoc(doc(ADb, "users", A)));
  await assertSucceeds(getDoc(doc(ADb, "rewardTransactions", "redeem_o_alice")));
});
await check("OK4 admin order screen writes still work (review, refund, shipping fields); a direct status write is refused (H1)", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_mal"), { status: "Confirmed" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_mal"), { needsReview: false, reviewedAt: serverTimestamp(), reviewedBy: "adminUid" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_mal"), { refundStatus: "Processing" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_mal"), { courierName: "Blue", trackingNumber: "T1", expectedDelivery: "2026-10-01" }));
});
await check("OK5 admin refunds screen field edits still work (pickup partner/date)", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "returns", "ret_mal"), { pickupPartner: "Ravi" }));
  await assertSucceeds(updateDoc(doc(ADb, "returns", "ret_mal"), { pickupDate: "2026-10-02" }));
});

// ================= alternate document paths grant nothing =================
await check("P1 no privilege escalation through subcollections or look-alike collections (customer)", async () => {
  await assertFails(setDoc(doc(Mdb, "users", M, "rewardTransactions", "x"), { points: 1000 }));
  await assertFails(setDoc(doc(Mdb, "users", M, "wallet", "balance"), { rewardPoints: 1000 }));
  await assertFails(setDoc(doc(Mdb, "rewardTransactions", "earned_o_mal", "sub", "x"), { points: 1000 }));
  await assertFails(setDoc(doc(Mdb, "rewardRedemptions", "x"), { userId: M, points: 100 }));
  await assertFails(setDoc(doc(Mdb, "rewardCatalog", "x"), { name: "TV", points: 1 }));
  await assertFails(setDoc(doc(Mdb, "pointsWallet", M), { balance: 1000 }));
  await assertFails(setDoc(doc(Mdb, "paymentIntents", "order_x"), { uid: M, pricing: { rewardValue: 0 } }));
  await assertFails(setDoc(doc(Mdb, "couponRedemptions", `${M}_SAVE10`), { userId: M }));
  await assertFails(getDoc(doc(Mdb, "users", M, "rewardTransactions", "x")));
});
await check("P2 ...and nothing for an admin browser either (server-owned paths)", async () => {
  await assertFails(setDoc(doc(ADb, "users", A, "rewardTransactions", "x"), { points: 1000 }));
  await assertFails(setDoc(doc(ADb, "rewardRedemptions", "x"), { userId: A, points: 100 }));
  await assertFails(setDoc(doc(ADb, "paymentIntents", "order_x"), { uid: A }));
});

await env.clearFirestore();
await env.cleanup();
console.log(`\n${pass}/${pass + fail} points-ledger (A4) rules checks passed`);
process.exit(fail ? 1 : 0);
