/*
 * YOMICO Rewards Stage A (A1–A3) — points ledger, old-style return refunds and
 * referral eligibility.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * Never touches production, never reads the real service account (a throwaway
 * key is generated), never calls the real Razorpay API: `razorpay` must
 * resolve to ../mobile-variant/razorpay-fake.mjs via
 * ../mobile-variant/tsconfig.harness.json — started without it, this file
 * re-runs itself with it.
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/points-ledger/run.mts"
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}

// ---- `razorpay` must be the local fake ----
{
  const { default: RazorpayCtor } = (await import("razorpay")) as any;
  const probe = new RazorpayCtor({ key_id: "rzp_test_PROBE", key_secret: "probe" });
  if ("customers" in probe || "refunds" in probe) {
    if (process.env.POINTS_HARNESS_REEXEC === "1") {
      console.error("REFUSING TO RUN: `razorpay` still resolves to the real package.");
      process.exit(2);
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repo = path.resolve(here, "../../..");
    console.log("[points-ledger] re-running with --tsconfig scripts/test/mobile-variant/tsconfig.harness.json (fake Razorpay)");
    const child = spawnSync(process.execPath, [
      path.join(repo, "node_modules/tsx/dist/cli.mjs"), "--tsconfig",
      path.join(repo, "scripts/test/mobile-variant/tsconfig.harness.json"), fileURLToPath(import.meta.url),
    ], { stdio: "inherit", cwd: repo, env: { ...process.env, POINTS_HARNESS_REEXEC: "1" } });
    process.exit(child.status ?? 1);
  }
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
delete process.env.RESEND_API_KEY;
delete process.env.GEMINI_API_KEY;

// Fake Identity Toolkit: token "test:<uid>:<email>:<emailVerified>". Every
// account "was created" at harness start unless overridden per uid below
// (null = the lookup reports no creation time).
const HARNESS_START = Date.now();
const authCreatedAt = new Map<string, number | null>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try { idToken = JSON.parse(init?.body ?? "{}").idToken ?? ""; } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    const created = authCreatedAt.has(parts[1]) ? authCreatedAt.get(parts[1]) : HARNESS_START;
    return new Response(JSON.stringify({ users: [{
      localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true",
      ...(created === null ? {} : { createdAt: String(created) }),
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("api.resend.com") || url.includes("generativelanguage")) throw new Error("TEST HARNESS: external call attempted");
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { creditOneOrder } = await import("../../../lib/rewardCreditServer.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { finalizeOnlineOrder } = await import("../../../lib/onlineOrder.ts");
const { POST: cancelOrder } = await import("../../../app/api/cancel-order/route.ts");
const { POST: itemTransition } = await import("../../../app/api/item-request/transition/route.ts");
const { POST: returnStatus } = await import("../../../app/api/admin/returns/[id]/status/route.ts");
const { POST: signupRewards } = await import("../../../app/api/signup-rewards/route.ts");
const { planPointsMovements, PointsShortfallError } = await import("../../../lib/points/pointsLedger.ts");
const { buildLedger } = await import("../../../lib/account/accountViews.ts");
const { control } = await import("../mobile-variant/control.mjs");
const { FieldValue, Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["products", "orders", "cart", "paymentIntents", "coupons", "couponRedemptions", "counters",
  "rateLimits", "settings", "notifications", "users", "rewardTransactions", "deliveryJobs", "unmatchedPayments",
  "itemRequests", "returns", "sellerOrders", "vendors"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }
const clearRateLimits = () => db.recursiveDelete(db.collection("rateLimits"));

const ADMIN = "admin_uid";
const ADMIN_EMAIL = "adminyogimart@gmail.com";
function req(url: string, body: unknown, uid: string, email = uid === ADMIN ? ADMIN_EMAIL : `${uid}@example.com`, verified = true) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${email}:${verified}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

const VENDOR = "vendor_pts_1";
const PRODUCT = "prod_pts_kettle";
const BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };
let key = 0;
const nextKey = () => `ptskey${++key}${Date.now()}`;
const daysAgo = (n: number) => Timestamp.fromMillis(Date.now() - n * 86400000);

async function seed() {
  await db.collection("settings").doc("global").set({ commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  await db.collection("products").doc(PRODUCT).set({
    name: "Points Kettle", title: "Points Kettle", sellingPrice: 1000, mrp: 1500, stock: 1000, sales: 0,
    active: true, vendorId: VENDOR, vendorName: "Points Traders",
  });
}
const balance = async (uid: string) => Number(((await db.collection("users").doc(uid).get()).data() as any)?.rewardPoints ?? NaN);
const row = async (id: string) => (await db.collection("rewardTransactions").doc(id).get()).data() as any;
const rowsFor = async (uid: string) => (await db.collection("rewardTransactions").where("userId", "==", uid).get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
const setUser = (uid: string, data: Record<string, unknown>) =>
  db.collection("users").doc(uid).set({ uid, role: "customer", email: `${uid}@example.com`, ...data });
const isV2 = (r: any, kind: string, delta: number, before: number, after: number) =>
  !!r && r.v === 2 && r.kind === kind && r.delta === delta && r.balanceBefore === before && r.balanceAfter === after &&
  r.points === Math.abs(delta) && !!r.createdAt;

async function eligibleOrder(id: string, uid: string, finalTotal: number) {
  await db.collection("orders").doc(id).set({
    userId: uid, userEmail: `${uid}@example.com`, status: "Delivered", paymentStatus: "Paid",
    rewardPointsStatus: "pending", finalTotal, deliveredAt: daysAgo(10), createdAt: daysAgo(12),
  });
}
async function codOrder(uid: string, redeemPoints: boolean) {
  const res = await webPlaceOrder(req("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", items: [{ id: PRODUCT, qty: 1 }], idempotencyKey: nextKey(), redeemPoints }, uid));
  return { status: res.status, json: await json(res) };
}
async function webIntent(uid: string) {
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", { ...BODY, items: [{ id: PRODUCT, qty: 1 }], redeemPoints: true }, uid));
  const j = await json(res);
  const intent = j.id ? (await db.collection("paymentIntents").doc(j.id).get()).data() as any : null;
  return { status: res.status, razorpayOrderId: j.id as string, intent };
}
const finalize = (i: { razorpayOrderId: string; intent: any }, paymentId: string, source = "browser") =>
  finalizeOnlineOrder({ razorpayPaymentId: paymentId, razorpayOrderId: i.razorpayOrderId, intent: i.intent, capturedAmountPaise: i.intent.expectedAmountPaise, source });
const returnCall = async (id: string, status: string, uid = ADMIN) => {
  const res = await returnStatus(req(`http://x/api/admin/returns/${id}/status`, { status }, uid), { params: Promise.resolve({ id }) });
  return { status: res.status, json: await json(res) };
};
const referral = async (uid: string, verified = true) => {
  const res = await signupRewards(req("http://x/api/signup-rewards", {}, uid, `${uid}@example.com`, verified));
  return { status: res.status, json: await json(res) };
};

async function main() {
  await clearAll();
  await seed();

  // ============ 0. the pure calculation ============
  {
    const a = planPointsMovements(10, [
      { kind: "cancel_restore", id: "r", requested: 5 },
      { kind: "cancel_reverse", id: "v", requested: -30, allowShortfall: true },
    ]);
    let threw = false;
    try { planPointsMovements(10, [{ kind: "checkout_redeem", id: "x", requested: -11 }]); } catch (e) { threw = e instanceof PointsShortfallError; }
    record("0  helper: movements apply in order, a reversal floors at 0 with an explicit shortfall; a debit without allowShortfall throws",
      a[0].balanceAfter === 15 && a[1].delta === -15 && a[1].shortfall === 15 && a[1].balanceAfter === 0 && threw,
      JSON.stringify(a));
  }

  // ============ 1. purchase earning ============
  {
    const U = "earn_1";
    await setUser(U, { rewardPoints: 7 });
    await eligibleOrder("ord_earn_1", U, 1234);
    const first = await creditOneOrder("ord_earn_1", { uid: null, isAdmin: true });
    const r = await row("earned_ord_earn_1");
    const again = await creditOneOrder("ord_earn_1", { uid: null, isAdmin: true });
    const rows = await rowsFor(U);
    record("1  purchase earning: +12 on ₹1234 — exactly one v2 row earned_{orderId} (delta +12, before 7, after 19); replay credits nothing",
      first.credited === true && isV2(r, "purchase_earned", 12, 7, 19) && r.type === "Earned" && r.orderId === "ord_earn_1" && r.orderTotal === 1234 &&
        again.credited === false && rows.length === 1 && (await balance(U)) === 19,
      `balance=${await balance(U)} rows=${rows.length} replay=${JSON.stringify(again)}`);

    // 8a concurrency — five parallel credits of one order
    const P = "earn_par";
    await setUser(P, { rewardPoints: 0 });
    await eligibleOrder("ord_earn_par", P, 5000);
    const outs = await Promise.all(Array.from({ length: 5 }, () => creditOneOrder("ord_earn_par", { uid: null, isAdmin: true })));
    record("8a concurrency: 5 parallel purchase credits of one order -> exactly one credit (+50) and one ledger row",
      outs.filter((o) => o.credited).length === 1 && (await balance(P)) === 50 && (await rowsFor(P)).length === 1,
      `credited=${outs.filter((o) => o.credited).length} balance=${await balance(P)}`);

    // 9a ledger failure — the fixed-id row already exists: the whole credit rolls back
    const F = "earn_fail";
    await setUser(F, { rewardPoints: 3 });
    await eligibleOrder("ord_earn_fail", F, 1000);
    await db.collection("rewardTransactions").doc("earned_ord_earn_fail").set({ userId: "someone_else", type: "Earned", points: 1 });
    let err = "";
    try { await creditOneOrder("ord_earn_fail", { uid: null, isAdmin: true }); } catch (e) { err = String((e as Error).message).slice(0, 60); }
    const o = (await db.collection("orders").doc("ord_earn_fail").get()).data() as any;
    record("9a ledger write cannot complete (fixed id taken) -> transaction fails: balance unchanged, order still pending",
      !!err && (await balance(F)) === 3 && o.rewardPointsStatus === "pending", `error="${err}" balance=${await balance(F)} status=${o.rewardPointsStatus}`);
  }

  // ============ 2. COD spending ============
  {
    await clearRateLimits();
    const U = "cod_1";
    await setUser(U, { rewardPoints: 300 });
    const r = await codOrder(U, true);
    const orderId = r.json?.orderId;
    const lr = orderId ? await row(`redeem_${orderId}`) : null;
    const rows = await rowsFor(U);
    record("2  COD spending: exactly one v2 redeem row redeem_{orderId} (delta −300, 300 -> 0), atomic with the order",
      r.status === 200 && isV2(lr, "checkout_redeem", -300, 300, 0) && lr.type === "Redeemed" && lr.orderId === orderId &&
        rows.length === 1 && (await balance(U)) === 0,
      `status=${r.status} rows=${rows.length} balance=${await balance(U)} err="${r.json?.error ?? ""}"`);

    // 9b ledger failure on COD: redeem_{orderId} pre-seeded -> no order, no balance change, no stock change
    await clearRateLimits();
    const F = "cod_fail";
    await setUser(F, { rewardPoints: 100 });
    const k = nextKey();
    await db.collection("rewardTransactions").doc(`redeem_${F}_${k}`).set({ userId: "x", type: "Redeemed", points: 1 });
    const stockBefore = ((await db.collection("products").doc(PRODUCT).get()).data() as any).stock;
    const res = await webPlaceOrder(req("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", items: [{ id: PRODUCT, qty: 1 }], idempotencyKey: k, redeemPoints: true }, F));
    const stockAfter = ((await db.collection("products").doc(PRODUCT).get()).data() as any).stock;
    const orderExists = (await db.collection("orders").doc(`${F}_${k}`).get()).exists;
    record("9b COD ledger write cannot complete -> the order, stock and balance all roll back",
      res.status >= 400 && !orderExists && (await balance(F)) === 100 && stockBefore === stockAfter,
      `status=${res.status} order=${orderExists} balance=${await balance(F)} stock ${stockBefore}->${stockAfter}`);
  }

  // ============ 3. online spending ============
  {
    await clearRateLimits();
    const U = "online_1";
    await setUser(U, { rewardPoints: 250 });
    const i = await webIntent(U);
    const [a, b] = await Promise.all([finalize(i, "pay_on_1a", "browser"), finalize(i, "pay_on_1b", "webhook")]);
    const normal = (await db.collection("orders").where("userId", "==", U).get()).docs.filter((d) => !d.get("duplicateIntentPayment"));
    const orderId = normal[0]?.id;
    const lr = orderId ? await row(`redeem_${orderId}`) : null;
    const rows = await rowsFor(U);
    record("3  online spending: one v2 redeem row (−250, 250 -> 0) atomic with finalization; 8d two parallel payments for one intent -> ONE order, ONE redemption",
      i.status === 200 && normal.length === 1 && isV2(lr, "checkout_redeem", -250, 250, 0) && !lr.shortfall &&
        rows.length === 1 && (await balance(U)) === 0,
      `kinds=${a.kind}/${b.kind} normal=${normal.length} rows=${rows.length} balance=${await balance(U)}`);

    // shortfall: the balance fell between intent and capture
    await clearRateLimits();
    const S = "online_short";
    await setUser(S, { rewardPoints: 500 });
    const s = await webIntent(S);
    await db.collection("users").doc(S).update({ rewardPoints: 200 });
    await finalize(s, "pay_short_1");
    const so = (await db.collection("orders").where("userId", "==", S).get()).docs[0];
    const sr = so ? await row(`redeem_${so.id}`) : null;
    record("3b online shortfall: deducts what exists (200 -> 0), row records requested −500 and shortfall 300; order keeps rewardShortfall 300 + needsReview",
      !!sr && sr.delta === -200 && sr.requested === -500 && sr.shortfall === 300 && sr.balanceAfter === 0 &&
        so.get("rewardShortfall") === 300 && so.get("needsReview") === true && (await balance(S)) === 0,
      JSON.stringify({ delta: sr?.delta, requested: sr?.requested, shortfall: sr?.shortfall, rewardShortfall: so?.get("rewardShortfall") }));

    // ---- H1: cancelling an online order restores only what was deducted ----
    // 3c. FULLY shortfall-covered: nothing was deducted, so nothing may come back.
    await clearRateLimits();
    const Z = "online_full_short";
    await setUser(Z, { rewardPoints: 500 });
    const z = await webIntent(Z);
    await db.collection("users").doc(Z).update({ rewardPoints: 0 });   // spent elsewhere before capture
    await finalize(z, "pay_full_short_1");
    const zo = (await db.collection("orders").where("userId", "==", Z).get()).docs[0];
    const zr = zo ? await row(`redeem_${zo.id}`) : null;
    await db.collection("users").doc(Z).update({ rewardPoints: 30 });  // unrelated balance at cancel time
    const zc = await cancelOrder(req("http://x/api/cancel-order", { orderId: zo?.id }, Z));
    const zRestore = zo ? await row(`cancelrestore_${zo.id}`) : null;
    record("3c H1: a FULLY shortfall-covered online order (0 of 500 deducted) cannot create points when cancelled — balance stays 30, no restore movement",
      !!zo && zr?.delta === 0 && zr?.shortfall === 500 && zo.get("rewardValue") === 500 && zo.get("rewardShortfall") === 500 &&
        zc.status === 200 && (await balance(Z)) === 30 && !zRestore,
      `cancel=${zc.status} balance=${await balance(Z)} restoreRow=${!!zRestore}`);

    // 3d. PARTIAL shortfall (the 3b order: 200 of 500 deducted): restores exactly 200.
    await clearRateLimits();
    const sc = await cancelOrder(req("http://x/api/cancel-order", { orderId: so?.id }, S));
    const sRestore = so ? await row(`cancelrestore_${so.id}`) : null;
    record("3d H1: a PARTIALLY shortfall-covered online order restores exactly what was deducted (+200: 0 -> 200), not rewardValue 500",
      sc.status === 200 && isV2(sRestore, "cancel_restore", 200, 0, 200) && (await balance(S)) === 200,
      `cancel=${sc.status} balance=${await balance(S)} restore=${sRestore?.delta}`);

    // 3e. Order placed before the ledger moved into the transaction (no v2
    // redeem row): falls back to rewardValue − rewardShortfall.
    await clearRateLimits();
    const G = "online_legacy_short";
    await setUser(G, { rewardPoints: 300 });
    const g = await webIntent(G);
    await db.collection("users").doc(G).update({ rewardPoints: 100 });
    await finalize(g, "pay_legacy_short_1");
    const go = (await db.collection("orders").where("userId", "==", G).get()).docs[0];
    if (go) await db.collection("rewardTransactions").doc(`redeem_${go.id}`).delete();
    const gc = await cancelOrder(req("http://x/api/cancel-order", { orderId: go?.id }, G));
    const gRestore = go ? await row(`cancelrestore_${go.id}`) : null;
    record("3e H1: without a v2 redeem row (pre-ledger order), restore = rewardValue 300 − rewardShortfall 200 = +100",
      !!go && go.get("rewardShortfall") === 200 && gc.status === 200 && gRestore?.delta === 100 && (await balance(G)) === 100,
      `cancel=${gc.status} balance=${await balance(G)} restore=${gRestore?.delta}`);
  }

  // ============ 4. cancellation ============
  {
    await clearRateLimits();
    const U = "cancel_1";
    await setUser(U, { rewardPoints: 100 });
    const placed = await codOrder(U, true);                     // spends 100 -> 0, finalTotal 900
    const orderId = placed.json?.orderId as string;
    // make it a LEGACY order (credited at creation) so the reversal applies
    await db.collection("orders").doc(orderId).update({ rewardPointsStatus: FieldValue.delete() });
    const outs = await Promise.all(Array.from({ length: 4 }, () => cancelOrder(req("http://x/api/cancel-order", { orderId }, U))));
    const restore = await row(`cancelrestore_${orderId}`);
    const reverse = await row(`cancelreverse_${orderId}`);
    const rows = (await rowsFor(U)).filter((r) => r.id.startsWith("cancel"));
    record("4  cancellation: restore then reverse, fixed ids — cancelrestore (+100: 0 -> 100) and cancelreverse (−9: 100 -> 91); 8c four parallel cancels -> one of each",
      outs.every((r) => r.status === 200) && isV2(restore, "cancel_restore", 100, 0, 100) && isV2(reverse, "cancel_reverse", -9, 100, 91) &&
        rows.length === 2 && (await balance(U)) === 91,
      `statuses=${outs.map((r) => r.status).join("/")} rows=${rows.length} balance=${await balance(U)}`);

    // 10. never negative: the reversal is larger than the balance
    await clearRateLimits();
    const N = "cancel_short";
    await setUser(N, { rewardPoints: 0 });
    const p2 = await codOrder(N, false);                        // finalTotal 1000 -> earned 10
    const id2 = p2.json?.orderId as string;
    await db.collection("orders").doc(id2).update({ rewardPointsStatus: FieldValue.delete() });
    await db.collection("users").doc(N).update({ rewardPoints: 3 });
    const c2 = await cancelOrder(req("http://x/api/cancel-order", { orderId: id2 }, N));
    const rv = await row(`cancelreverse_${id2}`);
    record("10 never negative: reversing 10 from a balance of 3 leaves 0 and records delta −3, requested −10, shortfall 7",
      c2.status === 200 && (await balance(N)) === 0 && rv?.delta === -3 && rv?.requested === -10 && rv?.shortfall === 7 &&
        rv?.balanceBefore === 3 && rv?.balanceAfter === 0 && rv?.points === 3,
      JSON.stringify({ balance: await balance(N), delta: rv?.delta, shortfall: rv?.shortfall }));
  }

  // ============ 5. item refund ============
  {
    await clearRateLimits();
    const U = "irefund_1";
    await setUser(U, { rewardPoints: 10 });
    await db.collection("itemRequests").doc("ir_pts_1").set({
      type: "return", status: "REFUND_PENDING", userId: U, userEmail: `${U}@example.com`, orderId: "some_order",
      productId: PRODUCT, vendorId: VENDOR, item: { qty: 1, name: "Points Kettle" }, refund: { amount: 450 }, history: [],
    });
    const r1 = await itemTransition(req("http://x/api/item-request/transition", { requestId: "ir_pts_1", toStatus: "REFUNDED" }, ADMIN));
    const r2 = await itemTransition(req("http://x/api/item-request/transition", { requestId: "ir_pts_1", toStatus: "REFUNDED" }, ADMIN));
    const lr = await row("refunditem_ir_pts_1");
    const rows = await rowsFor(U);
    record("5  item refund: exactly one refund_item row refunditem_{requestId} (+450: 10 -> 460); a repeat is refused",
      r1.status === 200 && r2.status !== 200 && isV2(lr, "refund_item", 450, 10, 460) && lr.type === "Refund" && lr.requestId === "ir_pts_1" &&
        rows.length === 1 && (await balance(U)) === 460,
      `first=${r1.status} repeat=${r2.status} rows=${rows.length} balance=${await balance(U)}`);
  }

  // ============ 6. old-style return refund (server route) ============
  {
    await clearRateLimits();
    const U = "oret_1";
    await setUser(U, { rewardPoints: 5 });
    await db.collection("returns").doc("ret_pts_1").set({ userId: U, userEmail: `${U}@example.com`, refundAmount: 250, status: "Approved" });
    const denied = await returnCall("ret_pts_1", "Refunded", "not_admin");
    const a = await returnCall("ret_pts_1", "Refunded");
    const b = await returnCall("ret_pts_1", "Approved");
    const c = await returnCall("ret_pts_1", "Refunded");
    const lr = await row("refundreturn_ret_pts_1");
    const ret = (await db.collection("returns").doc("ret_pts_1").get()).data() as any;
    const rows = await rowsFor(U);
    record("6  old-style return: a non-admin is refused; one refund_return row (+250: 5 -> 255); Refunded -> Approved -> Refunded pays ONCE",
      denied.status === 403 && a.status === 200 && b.status === 200 && c.status === 200 && isV2(lr, "refund_return", 250, 5, 255) &&
        lr.returnId === "ret_pts_1" && ret.pointsCredited === true && ret.status === "Refunded" && rows.length === 1 && (await balance(U)) === 255,
      `statuses ${denied.status}/${a.status}/${b.status}/${c.status} credited ${a.json?.creditedPoints}/${c.json?.creditedPoints} rows=${rows.length} balance=${await balance(U)}`);

    // legacy: already Refunded before the flag existed
    const L = "oret_legacy";
    await setUser(L, { rewardPoints: 40 });
    await db.collection("returns").doc("ret_legacy_1").set({ userId: L, refundAmount: 100, status: "Refunded" });
    await returnCall("ret_legacy_1", "Approved");
    const flagged = (await db.collection("returns").doc("ret_legacy_1").get()).data() as any;
    await returnCall("ret_legacy_1", "Refunded");
    // legacy: a matching "Refund" ledger row carries the returnId
    await db.collection("returns").doc("ret_legacy_2").set({ userId: L, refundAmount: 70, status: "Approved" });
    await db.collection("rewardTransactions").add({ returnId: "ret_legacy_2", userId: L, type: "Refund", points: 70 });
    await returnCall("ret_legacy_2", "Refunded");
    record("6b legacy returns: a Refunded return is flagged on its next change and never re-paid; a legacy Refund row with its returnId also blocks a credit",
      flagged.pointsCredited === true && flagged.pointsCreditedLegacy === true && (await balance(L)) === 40 &&
        !(await row("refundreturn_ret_legacy_1")) && !(await row("refundreturn_ret_legacy_2")),
      `balance=${await balance(L)} flagged=${flagged.pointsCredited}`);

    // parallel Refunded calls
    const P = "oret_par";
    await setUser(P, { rewardPoints: 0 });
    await db.collection("returns").doc("ret_par").set({ userId: P, refundAmount: 90, status: "Approved" });
    const outs = await Promise.all(Array.from({ length: 5 }, () => returnCall("ret_par", "Refunded")));
    record("6c five parallel 'Refunded' calls -> exactly one credit (+90) and one row",
      outs.every((o) => o.status === 200) && (await balance(P)) === 90 && (await rowsFor(P)).length === 1,
      `credited=${outs.map((o) => o.json?.creditedPoints).join(",")} balance=${await balance(P)}`);
  }

  // ============ 7. referrals ============
  {
    await clearRateLimits();
    const R = "ref_R";
    await setUser(R, { rewardPoints: 20, referralCode: "YOGI900001", totalReferrals: 0 });

    // welcome + referrer, exactly once
    await setUser("ref_n1", { rewardPoints: 0, referredBy: "YOGI900001" });
    const g = await referral("ref_n1");
    const again = await referral("ref_n1");
    const w = await row("referral_ref_n1");
    const rr = await row("referrer_ref_n1");
    record("7a referral: welcome (+50: 0 -> 50) and referrer (+100: 20 -> 120) as v2 rows on the fixed ids, exactly once",
      g.json?.result === "granted" && again.json?.result === "already" && isV2(w, "referral_welcome", 50, 0, 50) && w.userId === "ref_n1" &&
        isV2(rr, "referral_referrer", 100, 20, 120) && rr.userId === R && rr.type === "Referral Bonus" &&
        (await balance("ref_n1")) === 50 && (await balance(R)) === 120,
      `${g.json?.result}/${again.json?.result} R=${await balance(R)}`);

    // unlimited + concurrency: 12 more referrals of the same referrer, in parallel
    const ids = Array.from({ length: 12 }, (_, i) => `ref_m${i}`);
    for (const id of ids) await setUser(id, { rewardPoints: 0, referredBy: "YOGI900001" });
    const outs = await Promise.all(ids.map((id) => referral(id)));
    const rUser = (await db.collection("users").doc(R).get()).data() as any;
    const referrerRows = (await rowsFor(R)).filter((r) => r.kind === "referral_referrer");
    const chain = referrerRows.map((r) => [r.balanceBefore, r.balanceAfter]).sort((x, y) => x[0] - y[0]);
    const chained = chain.every((c, i) => c[1] === c[0] + 100 && (i === 0 || c[0] === chain[i - 1][1]));
    record("7b unlimited direct referrals + 8b concurrency: 12 parallel referrals all paid (13 total, no cap); referrer rows chain 120 -> 1320 with no lost update",
      outs.every((o) => o.json?.result === "granted") && rUser.rewardPoints === 1320 && rUser.totalReferrals === 13 && referrerRows.length === 13 && chained,
      `results=${[...new Set(outs.map((o) => o.json?.result))].join(",")} R=${rUser.rewardPoints} total=${rUser.totalReferrals} rows=${referrerRows.length} chained=${chained}`);

    // parallel attempts by ONE referred customer
    await setUser("ref_p", { rewardPoints: 0, referredBy: "YOGI900001" });
    const par = await Promise.all(Array.from({ length: 5 }, () => referral("ref_p")));
    record("8b' five parallel attempts by one referred customer -> one grant, the rest 'already'",
      par.filter((p) => p.json?.result === "granted").length === 1 && (await balance("ref_p")) === 50 && (await balance(R)) === 1420,
      par.map((p) => p.json?.result).join(","));

    // blocked referrer: neither paid, not settled; paid after unblock
    await setUser("ref_B", { rewardPoints: 0, referralCode: "YOGI900002", status: "Blocked" });
    await setUser("ref_nb", { rewardPoints: 0, referredBy: "YOGI900002" });
    const blocked = await referral("ref_nb");
    const nbAfter = (await db.collection("users").doc("ref_nb").get()).data() as any;
    const blockedState = { nb: nbAfter.rewardPoints, B: await balance("ref_B"), stamp: !!nbAfter.signupRewardsGrantedAt, rows: !!(await row("referral_ref_nb")) || !!(await row("referrer_ref_nb")) };
    await db.collection("users").doc("ref_B").update({ status: "Active" });
    const unblocked = await referral("ref_nb");
    record("7c blocked REFERRER: neither side paid, referral left unsettled (no stamp, no rows); paid once the referrer is unblocked",
      blocked.json?.result === "blocked" && blockedState.nb === 0 && blockedState.B === 0 && !blockedState.stamp && !blockedState.rows &&
        unblocked.json?.result === "granted" && (await balance("ref_nb")) === 50 && (await balance("ref_B")) === 100,
      `${blocked.json?.result} -> ${unblocked.json?.result} ${JSON.stringify(blockedState)}`);

    // blocked referred customer
    await setUser("ref_nb2", { rewardPoints: 0, referredBy: "YOGI900001", status: "Blocked" });
    const rBefore = await balance(R);
    const b2 = await referral("ref_nb2");
    record("7d blocked REFERRED customer: neither side paid, not settled",
      b2.json?.result === "blocked" && (await balance("ref_nb2")) === 0 && (await balance(R)) === rBefore &&
        !((await db.collection("users").doc("ref_nb2").get()).data() as any).signupRewardsGrantedAt && !(await row("referral_ref_nb2")),
      String(b2.json?.result));

    // not a new customer: Auth account created 2 hours before the profile
    authCreatedAt.set("ref_old", Date.now() - 2 * 3600 * 1000);
    await setUser("ref_old", { rewardPoints: 0, referredBy: "YOGI900001", referralCode: "YOGI900003" });
    const oldBefore = (await db.collection("users").doc("ref_old").get());
    const old = await referral("ref_old");
    const oldAfter = (await db.collection("users").doc("ref_old").get());
    record("7e not a new customer (profile created 2h after the Auth account): not-eligible, nothing paid, profile NOT modified, not settled",
      old.json?.result === "not-eligible" && JSON.stringify(oldBefore.data()) === JSON.stringify(oldAfter.data()) &&
        oldBefore.updateTime?.isEqual(oldAfter.updateTime!) === true && !(await row("referral_ref_old")) && (await balance(R)) === rBefore,
      String(old.json?.result));

    // Auth creation time missing -> needs-review, fail closed
    authCreatedAt.set("ref_notime", null);
    await setUser("ref_notime", { rewardPoints: 0, referredBy: "YOGI900001", referralCode: "YOGI900004" });
    const nt = await referral("ref_notime");
    record("7f Auth creation time unknown: needs-review, nothing paid, not settled",
      nt.json?.result === "needs-review" && (await balance("ref_notime")) === 0 &&
        !((await db.collection("users").doc("ref_notime").get()).data() as any).signupRewardsGrantedAt, String(nt.json?.result));

    // self, unknown, duplicate code
    await setUser("ref_self", { rewardPoints: 0, referralCode: "YOGI900005", referredBy: "YOGI900005" });
    await setUser("ref_unknown", { rewardPoints: 0, referredBy: "YOGI000999" });
    await setUser("ref_dupA", { rewardPoints: 0, referralCode: "YOGI900006" });
    await setUser("ref_dupB", { rewardPoints: 0, referralCode: "YOGI900006" });
    await setUser("ref_dup", { rewardPoints: 0, referredBy: "YOGI900006" });
    const self = await referral("ref_self");
    const unknown = await referral("ref_unknown");
    const dup = await referral("ref_dup");
    const u = async (id: string) => (await db.collection("users").doc(id).get()).data() as any;
    record("7g self-referral and unknown code: nothing paid (settled); a code held by two accounts: needs-review, nothing paid, not settled",
      self.json?.result === "no-referral" && !!(await u("ref_self")).signupRewardsGrantedAt && (await u("ref_self")).rewardPoints === 0 &&
        unknown.json?.result === "no-referral" && !!(await u("ref_unknown")).signupRewardsGrantedAt &&
        dup.json?.result === "needs-review" && !(await u("ref_dup")).signupRewardsGrantedAt &&
        (await u("ref_dupA")).rewardPoints === 0 && (await u("ref_dupB")).rewardPoints === 0,
      `${self.json?.result}/${unknown.json?.result}/${dup.json?.result}`);

    // unverified email: unchanged behaviour
    await setUser("ref_unv", { rewardPoints: 0, referredBy: "YOGI900001" });
    const unv = await referral("ref_unv", false);
    record("7h unverified email: pending-verification, nothing paid (unchanged behaviour)",
      unv.json?.result === "pending-verification" && (await balance("ref_unv")) === 0, String(unv.json?.result));
  }

  // ============ 11. wallet view ============
  {
    const rows = [
      { id: "earned_o1", data: { v: 2, kind: "purchase_earned", type: "Earned", points: 12, delta: 12, createdAt: daysAgo(1) } },
      { id: "cancelreverse_o2", data: { v: 2, kind: "cancel_reverse", type: "Cancelled - Points Reversed", points: 3, delta: -3, shortfall: 7, createdAt: daysAgo(2) } },
      { id: "redeem_o3", data: { v: 2, kind: "checkout_redeem", type: "Redeemed", points: 0, delta: 0, shortfall: 50, createdAt: daysAgo(3) } },
      { id: "adj_1", data: { v: 2, kind: "adjustment", type: "Adjustment", points: 5, delta: -5, createdAt: daysAgo(4) } },
      { id: "legacy_red", data: { type: "Redeemed", points: 20, createdAt: daysAgo(5) } },
      { id: "legacy_ref", data: { type: "Referral Bonus", points: 100, createdAt: daysAgo(6) } },
    ];
    const view = buildLedger(rows as any, new Map());
    const byLabel = view.map((e: any) => [e.kind, e.points]);
    record("11 wallet view: v2 rows use the signed delta on the existing kinds (earned +12, reversed −3, redeem 0, adjustment −5 as 'other'); legacy rows keep the label mapping (Redeemed −20, Referral +100); keys unchanged",
      JSON.stringify(byLabel) === JSON.stringify([["earned", 12], ["cancellation-reversed", -3], ["redeemed", 0], ["other", -5], ["redeemed", -20], ["referral", 100]]) &&
        view.every((e: any) => JSON.stringify(Object.keys(e)) === JSON.stringify(["id", "kind", "label", "points", "orderNumber", "createdAt"])),
      JSON.stringify(byLabel));
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(3);
});
