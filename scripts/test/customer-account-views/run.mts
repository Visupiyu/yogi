/*
 * LOCAL-ONLY emulator regression harness — Customer account views (P2)
 * (app/api/account/{summary,returns,wallet,referrals}, lib/account/*,
 *  the /signup?ref= pre-fill and the /profile/wallet/analytics redirect).
 *
 * Firestore EMULATOR only. Never touches production, never calls Resend or
 * Gemini, never reads the real service account (a throwaway RSA key is
 * generated). Auth is faked by intercepting the Identity Toolkit fetch:
 * "test:<uid>:<email>:<emailVerified>".
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/customer-account-views/run.mts"
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}

const PROJECT_ID = "demo-yomico-test";
{
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    type: "service_account", project_id: PROJECT_ID, private_key_id: "test-key-id", private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`, client_id: "000000000000000000000",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.RAZORPAY_KEY_ID = "rzp_test_LOCALHARNESS";
process.env.RAZORPAY_KEY_SECRET = "test_secret_local_harness";
delete process.env.GEMINI_API_KEY;
delete process.env.RESEND_API_KEY;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try { idToken = JSON.parse(init?.body ?? "{}").idToken ?? ""; } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    return new Response(JSON.stringify({ users: [{ localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true" }] }),
      { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("generativelanguage") || url.includes("api.resend.com")) throw new Error("TEST HARNESS: external call attempted");
  return realFetch(input, init);
}) as typeof fetch;

const { Timestamp } = await import("firebase-admin/firestore");
const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { GET: summaryRoute } = await import("../../../app/api/account/summary/route.ts");
const { GET: returnsRoute } = await import("../../../app/api/account/returns/route.ts");
const { GET: walletRoute } = await import("../../../app/api/account/wallet/route.ts");
const { GET: referralsRoute } = await import("../../../app/api/account/referrals/route.ts");
const { POST: respondRoute } = await import("../../../app/api/item-request/respond/route.ts");
const { POST: signupRewards } = await import("../../../app/api/signup-rewards/route.ts");
const { POST: createReview } = await import("../../../app/api/reviews/route.ts");
const { creditOneOrder } = await import("../../../lib/rewardCreditServer.ts");
const V = await import("../../../lib/account/accountViews.ts");
const { ACCOUNT_WALLET_KEYS } = await import("../../../lib/account/accountServer.ts");

const db = getAdminDb();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["users", "orders", "itemRequests", "returns", "rewardTransactions", "notifications", "addresses", "rateLimits", "products", "counters", "productReviews"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }

const email = (uid: string) => `${uid}@example.com`;
async function get(
  route: (r: Request) => Promise<Response>,
  opts: { uid?: string | null; verified?: boolean; query?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.uid) headers.authorization = `Bearer test:${opts.uid}:${email(opts.uid)}:${opts.verified ?? true}`;
  const res = await route(new Request(`http://x/api/account${opts.query || ""}`, { headers }));
  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text };
}
async function post(route: (r: Request) => Promise<Response>, uid: string, body: unknown, verified = true) {
  const res = await route(new Request("http://x/api", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer test:${uid}:${email(uid)}:${verified}` },
    body: JSON.stringify(body),
  }));
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text };
}
const keys = (o: any) => Object.keys(o || {}).sort().join(",");
const expect = (k: readonly string[]) => [...k].sort().join(",");
const daysAgo = (n: number) => Timestamp.fromMillis(Date.now() - n * 86400000);

const A = "alice", B = "bob", BL = "blocked1", R = "capped1", N = "newbie1", SELLER = "sellerQQ";
const F1 = "friendPaidUid", F2 = "friendPendingUid", F3 = "friendDeferredUid";

// Strings that must never reach customer A's views.
const FORBIDDEN_FOR_A = [
  B, email(B), "ORD-B1", "Bob Private", BL, SELLER, "adminUidX", "riderUidX", "Ravi Rider", "pay_SECRET", "24AAAAA0000A1Z5",
  "needsReview", "userEmail", "vendorId", "vendorIds", "paymentConfirmed", "confirmedBy", "deliveryCost", "taxSnapshot",
  F1, F2, F3, "Friend One", "friend.one@example.com", "referrer_", "referral_",
];

async function seed() {
  const user = (uid: string, extra: Record<string, unknown> = {}) =>
    db.collection("users").doc(uid).set({ uid, role: "customer", email: email(uid), rewardPoints: 0, totalReferrals: 0, createdAt: daysAgo(100), ...extra });
  await user(A, { name: "Alice Real", phone: "9876543210", rewardPoints: 137, referralCode: "YOGI100001", totalReferrals: 2, referredBy: "YOGI200002", signupRewardsGrantedAt: daysAgo(90) });
  await user(B, { name: "Bob Private", rewardPoints: 5, referralCode: "YOGI200002", totalReferrals: 1 });
  await user(BL, { name: "Blocked", status: "Blocked", rewardPoints: 9 });
  await user(N, { name: "Newbie" });
  await user(R, { referralCode: "YOGI300003", totalReferrals: 10 });
  await user(F1, { name: "Friend One", email: "friend.one@example.com", referredBy: "YOGI100001", signupRewardsGrantedAt: daysAgo(3), createdAt: daysAgo(4) });
  await user(F2, { name: "Friend Two", referredBy: "YOGI100001", createdAt: daysAgo(2) });
  await user(F3, { name: "Friend Three", referredBy: "YOGI100001", createdAt: daysAgo(1) });

  const internal = {
    vendorIds: [SELLER], commission: 0, deliveryCost: 49, confirmedBy: "adminUidX", paymentConfirmedBy: "riderUidX",
    paymentConfirmedByName: "Ravi Rider", needsReview: false, razorpayPaymentId: "pay_SECRET",
    taxSnapshot: { sellers: { [SELLER]: { gstin: "24AAAAA0000A1Z5" } } }, userEmail: email(A),
  };
  const order = (id: string, data: Record<string, unknown>) =>
    db.collection("orders").doc(id).set({ userId: A, paymentMethod: "ONLINE", paymentStatus: "Paid", items: [{ id: "p1", name: "Steel Bottle", qty: 2, price: 250, vendorId: SELLER, image: "https://img/x.jpg" }], ...internal, ...data });
  await order("A_ord1", { orderNumber: "ORD-A1", status: "Delivered", rewardPointsStatus: "credited", finalTotal: 500, createdAt: daysAgo(3), deliveredAt: daysAgo(3) });
  await order("A_ord2", { orderNumber: "ORD-A2", status: "Delivered", rewardPointsStatus: "pending", finalTotal: 1000, createdAt: daysAgo(5), deliveredAt: daysAgo(2) });
  await order("A_ord3", { orderNumber: "ORD-A3", status: "Delivered", rewardPointsStatus: "pending", finalTotal: 1000, createdAt: daysAgo(40), deliveredAt: daysAgo(30) });
  await order("A_ord4", { orderNumber: "ORD-A4", status: "Delivered", rewardPointsStatus: "pending", finalTotal: 1000, createdAt: daysAgo(41), deliveredAt: daysAgo(30) });
  await order("A_ord5", { orderNumber: "ORD-A5", status: "Confirmed", rewardPointsStatus: "pending", finalTotal: 250, createdAt: daysAgo(1) });
  await order("A_ord6", { orderNumber: "ORD-A6", status: "Cancelled", finalTotal: 400, createdAt: daysAgo(2), refundStatus: "Refunded", refundAmountDue: 400, refundedAmount: 400, refundTransactionId: "rfnd_ABCDEF123456", refundRequestedAt: daysAgo(2), refundedAt: daysAgo(1) });
  await order("A_ord7", { orderNumber: "ORD-A7", status: "Cancelled", finalTotal: 250, createdAt: daysAgo(0.5), refundStatus: "Required", refundAmountDue: 250, refundRequestedAt: daysAgo(0.5) });
  await order("A_ord8", { orderNumber: "ORD-A8", status: "Delivered", finalTotal: 150, createdAt: daysAgo(50) });
  await db.collection("orders").doc("B_ord1").set({ userId: B, orderNumber: "ORD-B1", status: "Delivered", finalTotal: 999, items: [], createdAt: daysAgo(1), refundStatus: "Required", refundAmountDue: 999 });
  await db.collection("orders").doc("BL_ord1").set({ userId: BL, orderNumber: "ORD-BL1", status: "Delivered", finalTotal: 100, items: [], createdAt: daysAgo(1) });

  const ir = (id: string, data: Record<string, unknown>) =>
    db.collection("itemRequests").doc(id).set({ userId: A, userEmail: email(A), vendorId: SELLER, customerName: "Alice Real", needsReview: true, item: { name: "Steel Bottle", image: "https://img/x.jpg", qty: 1, unitPrice: 250, vendorId: SELLER }, reason: "Damaged", comments: "dent", ...data });
  await ir("A_ord3_i0_p1", {
    orderId: "A_ord3", type: "return", status: "PICKUP_PROPOSED", requestNumber: "RET0001", createdAt: daysAgo(10), updatedAt: daysAgo(1),
    pickup: { proposedAt: Timestamp.fromMillis(Date.now() + 86400000), proposedBy: "admin", customerResponse: "pending", counterCount: 1 },
    refund: { destination: "REWARD_POINTS", amount: 200, credited: false },
    history: [{ status: "REQUESTED", at: daysAgo(10), by: "customer" }, { status: "APPROVED", at: daysAgo(9), by: "admin" }, { status: "PICKUP_PROPOSED", at: daysAgo(1), by: "admin" }],
  });
  await ir("A_ord4_i0_p1", {
    orderId: "A_ord4", type: "return", status: "REFUNDED", requestNumber: "RET0002", createdAt: daysAgo(20),
    refund: { destination: "REWARD_POINTS", amount: 300, credited: true, creditedAt: daysAgo(5), refundNumber: "RFD0001" },
    history: [{ status: "REQUESTED", at: daysAgo(20), by: "customer" }, { status: "REFUNDED", at: daysAgo(5), by: "seller" }],
  });
  await ir("A_ord1_i0_p1", { orderId: "A_ord1", type: "replace", status: "SELLER_PREPARING", requestNumber: "REP0001", createdAt: daysAgo(2) });
  await db.collection("itemRequests").doc("B_ord1_i0").set({ userId: B, orderId: "B_ord1", type: "return", status: "PICKUP_PROPOSED", refund: { amount: 999 }, item: { name: "Bob Thing" } });

  // Legacy whole-order return owned only by email.
  await db.collection("returns").doc(`${A}_A_ord8`).set({ orderId: "A_ord8", userEmail: email(A), status: "Refunded", reason: "Wrong size", refundAmount: 150, refundTransactionId: "UTR998877665544", refundMethod: "Original Payment", createdAt: daysAgo(45) });

  const tx = (id: string, data: Record<string, unknown>) => db.collection("rewardTransactions").doc(id).set(data);
  await tx("earned_A_ord1", { userId: A, userEmail: email(A), type: "Earned", points: 5, orderId: "A_ord1", createdAt: daysAgo(3) });
  await tx("t_redeem", { userId: A, userEmail: email(A), type: "Redeemed", points: 20, orderId: "A_ord2", createdAt: daysAgo(5) });
  await tx("t_reversed", { userId: A, userEmail: email(A), type: "Cancelled - Points Reversed", points: 3, orderId: "A_ord6", createdAt: daysAgo(2) });
  await tx(`referrer_${F1}`, { userId: A, userEmail: email(A), type: "Referral Bonus", points: 100, createdAt: Timestamp.now() });
  await tx("legacy_referrer_row", { userId: A, type: "Referral Bonus", points: 100, createdAt: daysAgo(60) });
  await tx(`referral_${A}`, { userId: A, userEmail: email(A), type: "Referral Bonus", points: 50, createdAt: daysAgo(90) });
  await tx("legacy_email_refund", { userEmail: email(A), type: "Refund", points: 50, returnId: `${A}_A_ord8`, createdAt: daysAgo(44) });
  await tx("B_row", { userId: B, userEmail: email(B), type: "Earned", points: 7, createdAt: daysAgo(1) });
  for (let i = 0; i < 10; i++) await tx(`referrer_capfriend${i}`, { userId: R, type: "Referral Bonus", points: 100, createdAt: Timestamp.now() });

  await db.collection("notifications").add({ userId: A, role: "customer", read: false, title: "t", message: "m" });
  await db.collection("notifications").add({ userId: A, role: "customer", read: false, title: "t", message: "m" });
  await db.collection("notifications").add({ userId: A, role: "customer", read: true, title: "t", message: "m" });
  await db.collection("notifications").add({ userId: B, role: "customer", read: false, title: "t", message: "m" });
  await db.collection("addresses").add({ userId: A, name: "Alice", address: "1 Road" });
  await db.collection("addresses").add({ userEmail: email(A), fullName: "Alice", addressLine1: "2 Road" });
  // A doc that claims A's email but belongs to another uid is not A's.
  await db.collection("addresses").add({ userEmail: email(A), userId: B, fullName: "x" });
  await db.collection("addresses").add({ userId: B, name: "Bob" });
}

try {
  await clearAll();
  await seed();

  // ============ 1. Auth ============
  {
    const s = await Promise.all([get(summaryRoute), get(returnsRoute), get(walletRoute), get(referralsRoute)]);
    const bad = await get(summaryRoute, { headers: { authorization: "Bearer nope" } });
    record("1  signed-out (and a bad token) → 401 on all four account routes",
      s.every((x) => x.status === 401) && bad.status === 401, s.map((x) => x.status).join("/") + `/${bad.status}`);
  }

  // ============ 2. Dashboard ============
  const sum = await get(summaryRoute, { uid: A });
  {
    const b = sum.body;
    record("2  summary: EXACT top-level keys; order cards EXACT keys",
      sum.status === 200 && keys(b) === expect(V.ACCOUNT_SUMMARY_KEYS) &&
        b.orders.recent.every((c: any) => keys(c) === expect(V.ACCOUNT_ORDER_CARD_KEYS)) &&
        keys(b.profile) === "address,displayName,email,emailVerified,memberSince,phone" &&
        keys(b.actions) === "pickupSlotsToConfirm,refundsDue,verifyEmail",
      keys(b));
    record("3  summary figures: 8 orders (1 active, 5 delivered, 2 cancelled); balance = users.rewardPoints (137); pending 29; 1 pickup to confirm; 1 refund due; 2 open returns; 2 unread; 2 own addresses (not the one naming another uid); referral code + 2 paid",
      b.orders.total === 8 && b.orders.active === 1 && b.orders.delivered === 5 && b.orders.cancelled === 2 &&
        b.rewards.balance === 137 && b.rewards.pendingPoints === 29 && b.actions.pickupSlotsToConfirm === 1 &&
        b.actions.refundsDue === 1 && b.actions.verifyEmail === false && b.returns.open === 2 && b.notifications.unread === 2 &&
        b.addresses.saved === 2 && b.referrals.code === "YOGI100001" && b.referrals.paidReferrals === 2 &&
        b.profile.displayName === "Alice Real" && b.profile.email === email(A),
      JSON.stringify({ orders: { ...b.orders, recent: undefined }, rewards: b.rewards, actions: b.actions, returns: b.returns, n: b.notifications, a: b.addresses }));
    const recent = b.orders.recent;
    record("4  order cards: newest 3, labelled by ORDER NUMBER (never a truncated id), own item count/total",
      recent.map((c: any) => c.orderNumber).join(",") === "ORD-A7,ORD-A5,ORD-A6" &&
        recent.every((c: any) => c.orderId.startsWith("A_ord") && typeof c.statusLabel === "string") &&
        recent[1].itemCount === 2 && recent[1].total === 250 && recent[1].firstItem?.name === "Steel Bottle" &&
        !fs.readFileSync(path.join(REPO, "app/profile/page.tsx"), "utf8").includes(".slice(0, 8)"),
      recent.map((c: any) => `${c.orderNumber}:${c.statusLabel}`).join(" "));
    const unverified = await get(summaryRoute, { uid: A, verified: false });
    record("5  unverified email → 'verify your email' action", unverified.body.actions?.verifyEmail === true && unverified.body.profile?.emailVerified === false, "");
  }

  // ============ 3. Returns & refunds ============
  const ret = await get(returnsRoute, { uid: A });
  {
    const b = ret.body;
    const open = b.requests.find((r: any) => r.requestNumber === "RET0001");
    const done = b.requests.find((r: any) => r.requestNumber === "RET0002");
    const rep = b.requests.find((r: any) => r.requestNumber === "REP0001");
    record("6  returns: EXACT keys for requests, legacy returns and refunds",
      ret.status === 200 && keys(b) === "legacyReturns,refunds,requests" &&
        b.requests.every((r: any) => keys(r) === expect(V.RETURN_REQUEST_KEYS)) &&
        b.legacyReturns.every((r: any) => keys(r) === expect(V.LEGACY_RETURN_KEYS)) &&
        b.refunds.every((r: any) => keys(r) === expect(V.REFUND_VIEW_KEYS)) &&
        b.requests.length === 3 && b.legacyReturns.length === 1,
      `${b.requests.length} requests / ${b.legacyReturns.length} legacy / ${b.refunds.length} refunds`);
    record("7  request view: order NUMBER, labels/steps from lib/itemRequests, timeline by you/YOMICO/seller; replacement has no pickup/refund",
      open.orderNumber === "ORD-A3" && open.statusLabel === "Pickup time proposed" && open.step?.index === 3 && open.tone === "running" &&
        open.timeline.map((t: any) => t.by).join(",") === "you,YOMICO,YOMICO" &&
        done.refund.status === "credited" && done.refund.refundNumber === "RFD0001" && done.refund.amount === 300 &&
        rep.pickup === null && rep.refund === null && rep.type === "replace",
      JSON.stringify({ step: open.step, by: open.timeline.map((t: any) => t.by) }));

    const bySource = (s: string) => b.refunds.filter((r: any) => r.source === s);
    const item = bySource("item-return"), cancel = bySource("order-cancellation"), legacy = bySource("legacy-return");
    record("8  ONE refund timeline across all three sources: item returns (₹200 in progress, ₹300 refunded RFD0001), cancelled online orders (₹400 refunded · ref …123456, ₹250 due · no ref), legacy return (₹150 refunded as points · ref …665544)",
      item.length === 2 && cancel.length === 2 && legacy.length === 1 &&
        item.some((r: any) => r.amount === 200 && r.status === "processing") &&
        item.some((r: any) => r.amount === 300 && r.status === "completed" && r.reference === "RFD0001") &&
        cancel.some((r: any) => r.amount === 400 && r.status === "completed" && r.providerReference === "123456" && r.destination === "ORIGINAL_PAYMENT") &&
        cancel.some((r: any) => r.amount === 250 && r.status === "due" && r.providerReference === null) &&
        legacy[0].amount === 150 && legacy[0].status === "completed" && legacy[0].providerReference === "665544" && legacy[0].destination === "REWARD_POINTS",
      JSON.stringify(b.refunds.map((r: any) => [r.source, r.amount, r.status, r.providerReference])));

    // Pickup permissions must match app/api/item-request/respond.
    const before = open.pickup;
    const counter = await post(respondRoute, A, { requestId: open.id, action: "counter", counterAt: new Date(Date.now() + 2 * 86400000).toISOString() });
    const after = (await get(returnsRoute, { uid: A })).body.requests.find((r: any) => r.requestNumber === "RET0001").pickup;
    const again = await post(respondRoute, A, { requestId: open.id, action: "counter", counterAt: new Date(Date.now() + 3 * 86400000).toISOString() });
    const other = await post(respondRoute, B, { requestId: open.id, action: "accept" });
    const accept = await post(respondRoute, A, { requestId: open.id, action: "accept" });
    const final = (await get(returnsRoute, { uid: A })).body.requests.find((r: any) => r.requestNumber === "RET0001");
    const doneRespond = await post(respondRoute, A, { requestId: done.id, action: "accept" });
    record("9  pickup permissions match the respond route: canRespond while proposed; countersLeft 1 → counter OK → 0 → another counter refused (409); another customer 404; confirming OK → canRespond false; a finished return cannot respond (409)",
      before.canRespond === true && before.countersLeft === 1 && counter.status === 200 && after.countersLeft === 0 &&
        after.customerResponse === "countered" && again.status === 409 && other.status === 404 && accept.status === 200 &&
        final.pickup.canRespond === false && final.pickup.scheduledAt && done.pickup.canRespond === false && doneRespond.status === 409,
      `${counter.status}/${after.countersLeft}/${again.status}/${other.status}/${accept.status}/${doneRespond.status}`);
  }

  // ============ 4. Wallet ============
  const wal = await get(walletRoute, { uid: A });
  {
    const b = wal.body;
    const ledgerSum = b.ledger.reduce((s: number, e: any) => s + e.points, 0);
    record("10 wallet: EXACT keys; balance = users.rewardPoints (137) even though the history sums to something else; no lifetime totals",
      wal.status === 200 && keys(b) === expect(ACCOUNT_WALLET_KEYS) && b.balance === 137 && ledgerSum !== 137 &&
        b.ledger.every((e: any) => keys(e) === expect(V.LEDGER_ENTRY_KEYS)) && !("totals" in b),
      `balance ${b.balance}, history sum ${ledgerSum}`);
    const byLabel = (k: string) => b.ledger.filter((e: any) => e.kind === k);
    record("11 signed history: earned +, redeemed −, cancellation reversed −, refunds/referrals +; an email-only legacy row is included; order numbers resolved",
      byLabel("redeemed")[0]?.points === -20 && byLabel("cancellation-reversed")[0]?.points === -3 &&
        byLabel("earned")[0]?.points === 5 && byLabel("earned")[0]?.orderNumber === "ORD-A1" &&
        byLabel("refund").some((e: any) => e.points === 50) && byLabel("referral").length === 3 && b.ledger.length === 7,
      JSON.stringify(b.ledger.map((e: any) => [e.kind, e.points])));
    const p = b.pending;
    const held = Object.fromEntries(p.orders.map((o: any) => [o.orderNumber, `${o.heldBy}:${o.points}`]));
    record("12 pending points from lib/rewardCredit: 29 = ORD-A2 return window 10 + ORD-A3 open return 10 + ORD-A4 7 (₹300 refunded item excluded) + ORD-A5 not delivered 2; credited/cancelled/legacy orders not pending",
      p.points === 29 && held["ORD-A2"] === "return-window:10" && held["ORD-A3"] === "open-return:10" &&
        held["ORD-A4"] === "processing:7" && held["ORD-A5"] === "not-delivered:2" && Object.keys(held).length === 4 &&
        p.orders.find((o: any) => o.orderNumber === "ORD-A2").creditsAfter,
      JSON.stringify(held));
    const credited = await creditOneOrder("A_ord4", { uid: A, isAdmin: false });
    record("13 the credit job itself agrees: crediting ORD-A4 pays exactly the 7 points the wallet showed as pending",
      credited.credited === true && (credited as any).points === 7, JSON.stringify(credited));

    for (let i = 0; i < 55; i++) {
      await db.collection("rewardTransactions").doc(`bulk${i}`).set({ userId: A, type: "Earned", points: 1, createdAt: daysAgo(200 + i) });
    }
    const p1 = await get(walletRoute, { uid: A });
    const p2 = await get(walletRoute, { uid: A, query: `?cursor=${p1.body.nextCursor}` });
    const badCursor = await get(walletRoute, { uid: A, query: "?cursor=abc" });
    const ids = new Set([...p1.body.ledger, ...p2.body.ledger].map((e: any) => e.id));
    record("14 history pages 50 at a time (cursor), no overlap; a malformed cursor → 400",
      p1.body.ledger.length === 50 && p1.body.nextCursor === "50" && p2.body.ledger.length === 13 && p2.body.nextCursor === null &&
        ids.size === 63 && badCursor.status === 400,
      `${p1.body.ledger.length}+${p2.body.ledger.length}, cursor ${p1.body.nextCursor}, bad ${badCursor.status}`);
  }

  // ============ 5. Referrals ============
  {
    const r = await get(referralsRoute, { uid: A });
    const b = r.body;
    record("15 referrals: EXACT keys; anonymous history 'A friend' with join dates — F1 paid (+100), F2 and F3 pending — opaque ids",
      r.status === 200 && keys(b) === expect(V.ACCOUNT_REFERRALS_KEYS) &&
        b.history.every((h: any) => keys(h) === expect(V.REFERRAL_HISTORY_KEYS) && h.friend === "A friend" && h.date) &&
        b.history.length === 3 && b.history.filter((h: any) => h.status === "paid").length === 1 &&
        b.history.find((h: any) => h.status === "paid").points === 100 && b.history.filter((h: any) => h.status === "pending").length === 2,
      JSON.stringify(b.history.map((h: any) => [h.friend, h.status, h.points])));
    record("16 referral numbers: code, bonuses 100/50 (no monthly cap); totals 2 paid · 200 points; your own signup bonus paid",
      b.code === "YOGI100001" && b.bonuses.referrer === 100 && b.bonuses.welcome === 50 && !("monthlyCap" in b.bonuses) &&
        !("thisMonth" in b) && b.totals.paidReferrals === 2 && b.totals.pointsEarned === 200 &&
        b.yourSignup.referred === true && b.yourSignup.status === "paid",
      JSON.stringify({ bonuses: b.bonuses, totals: b.totals, you: b.yourSignup }));
    const many = await get(referralsRoute, { uid: R });
    record("17 no monthly cap: a referrer paid 10 times this month sees no cap or 'this month' limit",
      many.status === 200 && !("thisMonth" in many.body) && !("monthlyCap" in many.body.bonuses), JSON.stringify(many.body.bonuses));

    const before = await get(referralsRoute, { uid: N });
    const issue = await post(signupRewards, N, {});
    const after = await get(referralsRoute, { uid: N });
    record("18 a customer without a code sees null; the SERVER issues one (POST /api/signup-rewards); the GET itself never writes",
      before.body.code === null && issue.status === 200 && /^YOGI\d{6}$/.test(after.body.code) && after.body.code === issue.body.referralCode &&
        after.body.yourSignup.status === "none",
      `${before.body.code} -> ${after.body.code}`);
  }

  // ============ 6. Isolation, spoofing, leaks ============
  {
    const spoof = await get(summaryRoute, { uid: A, query: `?uid=${B}&email=${email(B)}&userId=${B}`, headers: { "x-user-id": B, "x-user-email": email(B) } });
    const spoofRet = await get(returnsRoute, { uid: A, query: `?uid=${B}`, headers: { "x-uid": B } });
    record("19 a uid/email in the query or headers is ignored — the caller still gets exactly their own account",
      JSON.stringify(spoof.body) === JSON.stringify((await get(summaryRoute, { uid: A })).body) &&
        spoof.body.rewards.balance === (await db.collection("users").doc(A).get()).get("rewardPoints") &&
        spoofRet.body.requests.length === 3,
      `${spoof.status}/${spoofRet.status}`);

    const aTexts = [
      (await get(summaryRoute, { uid: A })).text, (await get(returnsRoute, { uid: A })).text,
      (await get(walletRoute, { uid: A })).text, (await get(referralsRoute, { uid: A })).text,
    ].join("\n");
    const leaks = FORBIDDEN_FOR_A.filter((s) => aTexts.includes(s));
    record("20 nothing leaks into A's four views: no other customer's name/email/uid/order, no friend identity, no vendor/admin/rider ids or names, no payment ids, no GSTIN, no needsReview / internal field names, no ledger ids that embed a uid",
      leaks.length === 0, leaks.length ? `LEAKED: ${leaks.join(", ")}` : "clean");

    const bSum = await get(summaryRoute, { uid: B });
    const bRet = await get(returnsRoute, { uid: B });
    const bLeaks = ["ORD-A", "Alice", email(A), "RET000", "Steel Bottle", A + "_"].filter((s) => (bSum.text + bRet.text).includes(s));
    record("21 customer B sees only B: own order, own refund due, own return; nothing of A's",
      bSum.body.orders.total === 1 && bSum.body.rewards.balance === 5 && bSum.body.actions.refundsDue === 1 &&
        bRet.body.requests.length === 1 && bLeaks.length === 0,
      bLeaks.length ? `LEAKED: ${bLeaks.join(",")}` : "clean");
  }

  // ============ 7. Blocked customer, rate limits ============
  {
    const views = await Promise.all([summaryRoute, returnsRoute, walletRoute, referralsRoute].map((r) => get(r, { uid: BL })));
    const write = await post(createReview, BL, { productId: "p1", rating: 5, review: "x" });
    record("22 a BLOCKED customer can still READ their own dashboard, returns, wallet and referrals; writes stay blocked (review → 403)",
      views.every((v) => v.status === 200) && views[0].body.orders.total === 1 && views[2].body.balance === 9 && write.status === 403,
      views.map((v) => v.status).join("/") + ` write ${write.status}`);

    const now = Date.now();
    for (const ns of ["account-summary", "account-returns", "account-wallet", "account-referrals"]) {
      await db.collection("rateLimits").doc(`${ns}_${B}`).set({ windowStart: now, count: 60 });
    }
    const limited = await Promise.all([summaryRoute, returnsRoute, walletRoute, referralsRoute].map((r) => get(r, { uid: B })));
    const other = await get(summaryRoute, { uid: A });
    record("23 rate limit: the 61st call in 10 minutes → 429 on each route, for that customer only",
      limited.every((l) => l.status === 429) && other.status === 200, limited.map((l) => l.status).join("/"));
  }

  // ============ 8. Share link + redirect ============
  {
    const signup = fs.readFileSync(path.join(REPO, "app/signup/page.tsx"), "utf8");
    const referrals = fs.readFileSync(path.join(REPO, "app/profile/referrals/page.tsx"), "utf8");
    const analytics = fs.readFileSync(path.join(REPO, "app/profile/wallet/analytics/page.tsx"), "utf8");
    record("24 share link: the referrals page builds /signup?ref=CODE; signup pre-fills a well-formed ?ref= into the referral field (still only recorded as referredBy — bonuses decided on the server)",
      /\/signup\?ref=\$\{encodeURIComponent\(data\.code\)\}/.test(referrals) &&
        /get\("ref"\)/.test(signup) && /\^\[A-Z0-9\]\{4,32\}\$/.test(signup) && /setReferralCode\(code\)/.test(signup) &&
        !/setDoc\([^)]*referralCode:/.test(signup),
      "");
    record("25 /profile/wallet/analytics redirects to /profile/wallet (no charts, no Firestore reads)",
      /router\.replace\("\/profile\/wallet"\)/.test(analytics) && !/firebase\/firestore/.test(analytics), "");
    const pages = ["app/profile/page.tsx", "app/profile/refunds/page.tsx", "app/profile/wallet/page.tsx", "app/profile/referrals/page.tsx"];
    const direct = pages.filter((p) => /getDocs|getDoc\(|onSnapshot|collection\(db/.test(fs.readFileSync(path.join(REPO, p), "utf8")));
    record("26 the four account pages make no direct Firestore reads (only the dashboard's own-profile save remains, within firestore.rules)",
      direct.length === 0, direct.join(", ") || "clean");
  }
} catch (error) {
  record("harness", false, (error as Error).stack || String(error));
} finally {
  await clearAll().catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
