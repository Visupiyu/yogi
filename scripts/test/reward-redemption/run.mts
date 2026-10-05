/*
 * YOMICO Phase 6 L2 — Reward Point checkout redemption.
 *
 * Covers: eligibility (₹100+ qualifying purchase, referral-only denied),
 * server-side amounts (never client balance), partial / exact / insufficient /
 * never-negative, cross-user, replay, concurrency, the online points hold,
 * seller economics (YOMICO funds the points), return refunds as usable points,
 * and cancellation accounting.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * Never touches production, never reads the real service account, never calls
 * the real Razorpay API (the fake from ../mobile-variant is used).
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/reward-redemption/run.mts"
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
    if (process.env.REDEEM_HARNESS_REEXEC === "1") {
      console.error("REFUSING TO RUN: `razorpay` still resolves to the real package.");
      process.exit(2);
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repo = path.resolve(here, "../../..");
    console.log("[reward-redemption] re-running with --tsconfig scripts/test/mobile-variant/tsconfig.harness.json (fake Razorpay)");
    const child = spawnSync(process.execPath, [
      path.join(repo, "node_modules/tsx/dist/cli.mjs"), "--tsconfig",
      path.join(repo, "scripts/test/mobile-variant/tsconfig.harness.json"), fileURLToPath(import.meta.url),
    ], { stdio: "inherit", cwd: repo, env: { ...process.env, REDEEM_HARNESS_REEXEC: "1" } });
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
const { finalizeOnlineOrder, onlineOrderIdFor } = await import("../../../lib/onlineOrder.ts");
const { computeVendorShare } = await import("../../../lib/vendorEarnings.ts");
const { POST: cancelOrder } = await import("../../../app/api/cancel-order/route.ts");
const { POST: itemTransition } = await import("../../../app/api/item-request/transition/route.ts");
const { POST: returnStatus } = await import("../../../app/api/admin/returns/[id]/status/route.ts");
const { POST: signupRewards } = await import("../../../app/api/signup-rewards/route.ts");
const { planPointsMovements, PointsShortfallError } = await import("../../../lib/points/pointsLedger.ts");
const { buildLedger } = await import("../../../lib/account/accountViews.ts");
const { control } = await import("../mobile-variant/control.mjs");
const { GET: rewardInfo } = await import("../../../app/api/account/reward-redemption/route.ts");
const { POST: releaseHold } = await import("../../../app/api/release-points-hold/route.ts");
const { refundableForOrderIndex } = await import("../../../lib/itemRequests.ts");
const { redeemableValue, spendablePoints, activeHeldPoints } = await import("../../../lib/rewards/redemption.ts");
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
  "itemRequests", "returns", "sellerOrders", "vendors", "pointsHolds"];
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
const CHEAP = "prod_pts_pen";
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
  await db.collection("products").doc(CHEAP).set({
    name: "Points Pen", title: "Points Pen", sellingPrice: 200, mrp: 250, stock: 1000, sales: 0,
    active: true, vendorId: VENDOR, vendorName: "Points Traders",
  });
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true, createdAt: Timestamp.now() });
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
async function codOrder(uid: string, redeemPoints: boolean, extra: Record<string, unknown> = {}, productId = PRODUCT, key = nextKey()) {
  const res = await webPlaceOrder(req("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", items: [{ id: productId, qty: 1 }], idempotencyKey: key, redeemPoints, ...extra }, uid));
  return { status: res.status, json: await json(res) };
}
const orderDoc = async (id: string) => (await db.collection("orders").doc(id).get()).data() as any;
async function onlineIntent(uid: string, redeemPoints: boolean, extra: Record<string, unknown> = {}) {
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", { ...BODY, items: [{ id: PRODUCT, qty: 1 }], redeemPoints, ...extra }, uid));
  const j = await json(res);
  const intent = j.id ? ((await db.collection("paymentIntents").doc(j.id).get()).data() as any) : null;
  return { status: res.status, error: j.error as string | undefined, razorpayOrderId: j.id as string, intent };
}
const finalizeIntent = (i: { razorpayOrderId: string; intent: any }, paymentId: string, source = "browser") =>
  finalizeOnlineOrder({ razorpayPaymentId: paymentId, razorpayOrderId: i.razorpayOrderId, intent: i.intent, capturedAmountPaise: i.intent.expectedAmountPaise, source });
const holdDoc = async (uid: string) => { const s = await db.collection("pointsHolds").doc(uid).get(); return s.exists ? (s.data() as any) : null; };
const eligibleUser = (uid: string, points: number) =>
  setUser(uid, { rewardPoints: points, rewardsEligibleAt: Timestamp.now(), rewardsEligibleOrderId: "o_prev" });
const ledgerRedeemRows = async (uid: string) => (await rowsFor(uid)).filter((r) => r.kind === "checkout_redeem");
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
  const stockOf = async (id = PRODUCT) => ((await db.collection("products").doc(id).get()).data() as any).stock;

  // ============ R0. the pure rules ============
  {
    const base = { eligible: true, spendable: 300, subtotal: 1000, couponDiscount: 0, shipping: 0 };
    const cheap = { eligible: true, spendable: 1000, subtotal: 200, couponDiscount: 0, shipping: 49 };
    const held = Timestamp.fromMillis(Date.now() + 60000);
    const expired = Timestamp.fromMillis(Date.now() - 1000);
    record("R0 pure rules: ineligible = 0; partial; capped at item value after coupon; always leaves ₹1; points never pay shipping; holds subtract; expired/garbage holds ignored; balance never negative",
      redeemableValue({ ...base, eligible: false }) === 0 &&
        redeemableValue(base) === 300 &&
        redeemableValue({ ...base, spendable: 5000 }) === 999 &&
        redeemableValue({ ...base, spendable: 5000, couponDiscount: 100 }) === 899 &&
        redeemableValue(cheap) === 200 &&
        redeemableValue({ ...base, spendable: -4 }) === 0 &&
        spendablePoints(300, activeHeldPoints({ points: 100, expiresAt: held }, Date.now())) === 200 &&
        spendablePoints(300, activeHeldPoints({ points: 100, expiresAt: expired }, Date.now())) === 300 &&
        spendablePoints(50, 400) === 0 && spendablePoints(NaN, 0) === 0 && spendablePoints(-9, 0) === 0 &&
        activeHeldPoints({ points: "x" }, Date.now()) === 0 && activeHeldPoints(null, Date.now()) === 0,
      "");
  }

  // ============ R1. eligible customer: partial / exact / zero-payable cap ============
  {
    await clearRateLimits();
    const P = "r1_partial";
    await eligibleUser(P, 40);
    const r = await codOrder(P, true);
    const o = r.json?.orderId ? await orderDoc(r.json.orderId) : null;
    const lr = r.json?.orderId ? await row(`redeem_${r.json.orderId}`) : null;
    record("R1a partial redemption: 40 points on ₹1000 (free shipping) -> pay ₹960, redeem row −40 (40 -> 0), rewardFundedBy yomico",
      r.status === 200 && o?.rewardValue === 40 && o?.finalTotal === 960 && o?.rewardFundedBy === "yomico" && isV2(lr, "checkout_redeem", -40, 40, 0) && (await balance(P)) === 0,
      `status=${r.status} finalTotal=${o?.finalTotal} balance=${await balance(P)}`);

    await clearRateLimits();
    const E = "r1_exact";
    await eligibleUser(E, 250);
    const re = await codOrder(E, true);
    const oe = re.json?.orderId ? await orderDoc(re.json.orderId) : null;
    record("R1b exact balance: 250 of 250 points -> pay ₹750, balance exactly 0 (never negative)",
      re.status === 200 && oe?.rewardValue === 250 && oe?.finalTotal === 750 && (await balance(E)) === 0, `balance=${await balance(E)}`);

    await clearRateLimits();
    const Z = "r1_big";
    await eligibleUser(Z, 5000);
    const rz = await codOrder(Z, true);
    const oz = rz.json?.orderId ? await orderDoc(rz.json.orderId) : null;
    record("R1c large balance (5000) on ₹1000: points cover at most ₹999 — ₹1 always stays payable (no zero-payable order); 4001 points remain",
      rz.status === 200 && oz?.rewardValue === 999 && oz?.finalTotal === 1 && (await balance(Z)) === 4001, `finalTotal=${oz?.finalTotal} balance=${await balance(Z)}`);

    await clearRateLimits();
    const S = "r1_ship";
    await eligibleUser(S, 1000);
    const rs = await codOrder(S, true, {}, CHEAP);
    const os = rs.json?.orderId ? await orderDoc(rs.json.orderId) : null;
    record("R1d points never pay shipping: ₹200 item + ₹49 delivery with 1000 points -> 200 applied, customer still pays the ₹49 delivery",
      rs.status === 200 && os?.rewardValue === 200 && os?.shippingCharge === 49 && os?.finalTotal === 49 && (await balance(S)) === 800, `finalTotal=${os?.finalTotal}`);
  }

  // ============ R2. eligibility ============
  {
    await clearRateLimits();
    const R = "r2_referral";
    await setUser(R, { rewardPoints: 300, referralCode: "YOGI900001", totalReferrals: 4 });
    const ordersBefore = (await db.collection("orders").get()).size;
    const rr = await codOrder(R, true);
    const ri = await onlineIntent(R, true);
    record("R2a referral-only customer holding 300 points: COD and online redemption refused (403), no order, no intent, no hold, balance and ledger untouched",
      rr.status === 403 && ri.status === 403 && (await db.collection("orders").get()).size === ordersBefore && !ri.intent &&
        !(await holdDoc(R)) && (await balance(R)) === 300 && (await rowsFor(R)).length === 0, `${rr.status}/${ri.status}`);

    // ₹99 purchase does not qualify; ₹100 does (the existing lib/rewardCreditServer rule)
    await clearRateLimits();
    const Q99 = "r2_q99";
    await setUser(Q99, { rewardPoints: 0 });
    await eligibleOrder("ord_q99", Q99, 99);
    await creditOneOrder("ord_q99", { uid: null, isAdmin: true });
    await db.collection("users").doc(Q99).update({ rewardPoints: 50 });
    const q99 = await codOrder(Q99, true);
    const stamp99 = !!((await db.collection("users").doc(Q99).get()).data() as any)?.rewardsEligibleAt;

    await clearRateLimits();
    const Q100 = "r2_q100";
    await setUser(Q100, { rewardPoints: 0 });
    await eligibleOrder("ord_q100", Q100, 100);
    await creditOneOrder("ord_q100", { uid: null, isAdmin: true });
    const stamp100 = !!((await db.collection("users").doc(Q100).get()).data() as any)?.rewardsEligibleAt;
    const q100 = await codOrder(Q100, true);
    const o100 = q100.json?.orderId ? await orderDoc(q100.json.orderId) : null;
    record("R2b qualifying purchase: a ₹99 purchase earns no eligibility (redeem refused 403); a ₹100 purchase stamps eligibility and its 1 earned point can be redeemed",
      !stamp99 && q99.status === 403 && stamp100 && q100.status === 200 && o100?.rewardValue === 1 && o100?.finalTotal === 999,
      `q99=${q99.status} stamp99=${stamp99} q100=${q100.status} stamp100=${stamp100} rewardValue=${o100?.rewardValue}`);

    await clearRateLimits();
    const N = "r2_none";
    await eligibleUser(N, 0);
    const none = await codOrder(N, true);
    const ordersN = (await db.collection("orders").where("userId", "==", N).get()).size;
    record("R2c eligible customer with 0 points: redemption refused (409), no order, no ledger row",
      none.status === 409 && ordersN === 0 && (await rowsFor(N)).length === 0, `status=${none.status}`);
  }

  // ============ R3. client input is never trusted; cross-user ============
  {
    await clearRateLimits();
    const A = "r3_a", B = "r3_b";
    await eligibleUser(A, 300);
    await eligibleUser(B, 700);
    const forged = await codOrder(A, true, { rewardValue: 9999, rewardPoints: 9999, points: 9999, pointsToRedeem: 9999, userId: B, uid: B, rewardBalance: 9999, discountAmount: 9999, finalTotal: 1, rewardsEligible: true });
    const o = forged.json?.orderId ? await orderDoc(forged.json.orderId) : null;
    record("R3a forged body (rewardValue/points/userId/uid/balance/finalTotal) is ignored: A spends only A's own 300, order belongs to A, B's 700 and ledger untouched",
      forged.status === 200 && o?.userId === `${A}` && o?.rewardValue === 300 && o?.finalTotal === 700 && (await balance(A)) === 0 &&
        (await balance(B)) === 700 && (await rowsFor(B)).length === 0, `rewardValue=${o?.rewardValue} A=${await balance(A)} B=${await balance(B)}`);

    // redeemPoints must be literally true (a string/number is not a redemption)
    await clearRateLimits();
    const C = "r3_c";
    await eligibleUser(C, 300);
    const soft = await codOrder(C, "yes" as any);
    const so = soft.json?.orderId ? await orderDoc(soft.json.orderId) : null;
    record("R3b only the boolean true redeems: a truthy string does not spend points",
      soft.status === 200 && so?.rewardValue === 0 && (await balance(C)) === 300, `rewardValue=${so?.rewardValue}`);
  }

  // ============ R4. replay and concurrency ============
  {
    await clearRateLimits();
    const U = "r4_replay";
    await eligibleUser(U, 300);
    const key1 = nextKey();
    const first = await codOrder(U, true, {}, PRODUCT, key1);
    await clearRateLimits();
    const second = await codOrder(U, true, {}, PRODUCT, key1);
    record("R4a double-submit (same idempotency key): ONE order, ONE redeem row, balance deducted once",
      first.status === 200 && second.status === 200 && second.json?.alreadyPlaced === true && second.json?.orderId === first.json?.orderId &&
        (await ledgerRedeemRows(U)).length === 1 && (await balance(U)) === 0 &&
        (await db.collection("orders").where("userId", "==", U).get()).size === 1,
      `balance=${await balance(U)}`);

    await clearRateLimits();
    const P = "r4_parallel";
    await eligibleUser(P, 300);
    const stockBefore = await stockOf();
    const outs = await Promise.all(Array.from({ length: 5 }, () => codOrder(P, true)));
    const okCount = outs.filter((o) => o.status === 200).length;
    record("R4b concurrency: 5 parallel redeeming orders against 300 points -> exactly ONE succeeds, four are refused (409), balance 0 (never negative), one redeem row, stock moved once",
      okCount === 1 && outs.filter((o) => o.status === 409).length === 4 && (await balance(P)) === 0 && (await ledgerRedeemRows(P)).length === 1 &&
        (await stockOf()) === stockBefore - 1,
      `statuses=${outs.map((o) => o.status).join("/")} balance=${await balance(P)}`);

    // a stale pricing pass cannot overspend: balance moves between pricing and commit
    await clearRateLimits();
    const T = "r4_stale";
    await eligibleUser(T, 300);
    await db.collection("users").doc(T).update({ rewardPoints: 100 });
    const stale = await codOrder(T, true);
    const to = stale.json?.orderId ? await orderDoc(stale.json.orderId) : null;
    record("R4c balance is read live: 100 points -> only 100 applied (never the 300 once seen)",
      stale.status === 200 && to?.rewardValue === 100 && (await balance(T)) === 0, `rewardValue=${to?.rewardValue}`);
  }

  // ============ R5. online: points hold, atomic finalization ============
  {
    await clearRateLimits();
    const U = "r5_online";
    await eligibleUser(U, 300);
    const i = await onlineIntent(U, true);
    const hold = await holdDoc(U);
    record("R5a online create-order with points: intent priced ₹700 (70000 paise, rewardValue 300, redeemPoints true), 300 points RESERVED (hold bound to the Razorpay order), balance not yet moved",
      i.status === 200 && i.intent?.pricing?.rewardValue === 300 && i.intent?.expectedAmountPaise === 70000 && i.intent?.redeemPoints === true &&
        hold?.points === 300 && hold?.razorpayOrderId === i.razorpayOrderId && (await balance(U)) === 300 && (await ledgerRedeemRows(U)).length === 0,
      `status=${i.status} hold=${JSON.stringify(hold && { p: hold.points, o: hold.razorpayOrderId === i.razorpayOrderId })}`);

    await clearRateLimits();
    const second = await onlineIntent(U, true);
    const cod = await codOrder(U, true);
    record("R5b while points are on hold: a second online redemption and a COD redemption are both refused (409) — no second discount can be priced on the same 300",
      second.status === 409 && cod.status === 409 && !second.intent && (await balance(U)) === 300, `${second.status}/${cod.status} "${second.error ?? ""}"`);

    await clearRateLimits();
    const info = await rewardInfo(new Request("http://x/api/account/reward-redemption", { headers: { authorization: `Bearer test:${U}:${U}@example.com:true` } }));
    const infoJson = await json(info);
    record("R5c checkout display endpoint: eligible, balance 300, held 300, spendable 0 while the hold is active",
      info.status === 200 && infoJson.eligible === true && infoJson.balance === 300 && infoJson.held === 300 && infoJson.spendable === 0, JSON.stringify(infoJson));

    const fin = await finalizeIntent(i, "pay_r5_a");
    const orderId = onlineOrderIdFor("pay_r5_a");
    const o = await orderDoc(orderId);
    const lr = await row(`redeem_${orderId}`);
    record("R5d finalization: ONE order (₹700 paid, rewardValue 300, rewardFundedBy yomico, sellerEarning ₹1000), redeem row −300 (300 -> 0) atomic with it, hold deleted",
      fin.kind === "created" && o?.finalTotal === 700 && o?.rewardValue === 300 && o?.rewardFundedBy === "yomico" && o?.sellerEarning === 1000 && o?.rewardShortfall === undefined &&
        isV2(lr, "checkout_redeem", -300, 300, 0) && (await balance(U)) === 0 && !(await holdDoc(U)),
      `kind=${fin.kind} finalTotal=${o?.finalTotal} balance=${await balance(U)} hold=${!!(await holdDoc(U))}`);

    const [a, b] = await Promise.all([finalizeIntent(i, "pay_r5_a", "webhook"), finalizeIntent(i, "pay_r5_b", "webhook")]);
    record("R5e replay / duplicate payments on the same intent: still ONE normal order and ONE redemption (balance stays 0, never negative)",
      (await ledgerRedeemRows(U)).length === 1 && (await balance(U)) === 0 &&
        (await db.collection("orders").where("userId", "==", U).get()).docs.filter((d) => !d.get("duplicateIntentPayment")).length === 1,
      `${a.kind}/${b.kind}`);

    // concurrent claims
    await clearRateLimits();
    const C = "r5_conc";
    await eligibleUser(C, 300);
    control.reset();
    const both = await Promise.all([
      webCreateOrder(req("http://x/api/create-order", { ...BODY, items: [{ id: PRODUCT, qty: 1 }], redeemPoints: true }, C)),
      webCreateOrder(req("http://x/api/create-order", { ...BODY, items: [{ id: PRODUCT, qty: 1 }], redeemPoints: true }, C)),
    ]);
    const statuses = both.map((r) => r.status).sort();
    const intents = (await db.collection("paymentIntents").where("uid", "==", C).get()).size;
    record("R5f concurrency: two parallel online redemptions of the same 300 points -> exactly one payment is created (200 + 409), one intent",
      statuses[0] === 200 && statuses[1] === 409 && intents === 1, `statuses=${statuses.join("/")} intents=${intents}`);

    // release on dismiss, wrong order id / other user cannot release
    await clearRateLimits();
    const D = "r5_dismiss";
    await eligibleUser(D, 300);
    const di = await onlineIntent(D, true);
    const relReq = (uid: string, id: string) => releaseHold(req("http://x/api/release-points-hold", { razorpayOrderId: id }, uid));
    const wrongId = await json(await relReq(D, "order_not_mine"));
    const otherUser = await json(await relReq("r5_someone_else", di.razorpayOrderId));
    const stillHeld = !!(await holdDoc(D));
    const right = await json(await relReq(D, di.razorpayOrderId));
    await clearRateLimits();
    const again = await onlineIntent(D, true);
    record("R5g dismissing the payment window releases the hold: a wrong order id or another customer releases nothing; the right one frees the points and a retry prices again",
      wrongId.released === false && otherUser.released === false && stillHeld && right.released === true && again.status === 200 && again.intent?.pricing?.rewardValue === 300 && (await balance(D)) === 300,
      JSON.stringify({ wrongId, otherUser, right, again: again.status }));

    // expiry never strands points
    await clearRateLimits();
    const X = "r5_expiry";
    await eligibleUser(X, 300);
    await onlineIntent(X, true);
    await db.collection("pointsHolds").doc(X).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await clearRateLimits();
    const afterExpiry = await onlineIntent(X, true);
    record("R5h an expired hold stops blocking: a new redemption is priced and held again",
      afterExpiry.status === 200 && afterExpiry.intent?.pricing?.rewardValue === 300, `status=${afterExpiry.status}`);

    // payment cannot start -> hold released
    await clearRateLimits();
    const F = "r5_rzpfail";
    await eligibleUser(F, 300);
    control.reset();
    control.ordersCreate = async () => { throw new Error("razorpay down"); };
    const failed = await webCreateOrder(req("http://x/api/create-order", { ...BODY, items: [{ id: PRODUCT, qty: 1 }], redeemPoints: true }, F));
    control.reset();
    record("R5i Razorpay order creation fails -> the reserved points are released, balance untouched",
      failed.status >= 400 && !(await holdDoc(F)) && (await balance(F)) === 300 && (await ledgerRedeemRows(F)).length === 0, `status=${failed.status}`);
  }

  // ============ R6. seller economics ============
  {
    await clearRateLimits();
    const K = "r6_plain", L = "r6_points";
    await setUser(K, { rewardPoints: 0 });
    await eligibleUser(L, 300);
    const plain = await codOrder(K, false);
    const pts = await codOrder(L, true);
    const po = await orderDoc(plain.json.orderId);
    const lo = await orderDoc(pts.json.orderId);
    const ps = computeVendorShare(po, VENDOR);
    const ls = computeVendorShare(lo, VENDOR);
    record("R6a seller economics unchanged: with 300 points redeemed the seller's raw subtotal, net subtotal, commission and earning equal the no-points order (₹1000 / ₹1000 / ₹0 / ₹1000); customer pays ₹700 vs ₹1000",
      JSON.stringify(ps) === JSON.stringify(ls) && ls?.vendorEarning === 1000 && ls?.vendorCommission === 0 && lo.finalTotal === 700 && po.finalTotal === 1000 &&
        lo.commission === 0 && lo.sellerEarning === 1000 && lo.commissionAmount === po.commissionAmount,
      JSON.stringify({ ps, ls }));

    await clearRateLimits();
    const M = "r6_coupon", N = "r6_coupon_points";
    await setUser(M, { rewardPoints: 0 });
    await eligibleUser(N, 300);
    const cplain = await codOrder(M, false, { couponCode: "SAVE10" });
    const cpts = await codOrder(N, true, { couponCode: "SAVE10" });
    const co = await orderDoc(cplain.json.orderId);
    const cn = await orderDoc(cpts.json.orderId);
    const cs = computeVendorShare(co, VENDOR);
    const ns = computeVendorShare(cn, VENDOR);
    // H3: the coupon is YOMICO's cost as well, so with a coupon AND points the
    // seller bears neither — earning ₹1000, YOMICO coupon share ₹100 recorded.
    const legacyCoupon = { ...co }; delete (legacyCoupon as any).couponFundedBy;
    const legacyCouponShare = computeVendorShare(legacyCoupon, VENDOR);
    record("R6b coupon + points: the seller bears NEITHER (H3: coupon YOMICO-funded; net ₹1000, earning ₹1000, YOMICO coupon share ₹100) — identical with and without points; customer pays ₹600 vs ₹900; the same order without the H3 stamp keeps the legacy ₹900",
      JSON.stringify(cs) === JSON.stringify(ns) && ns?.vendorNetSubtotal === 1000 && ns?.vendorEarning === 1000 && ns?.yomicoCouponShare === 100 &&
        co.couponFundedBy === "yomico" && cn.couponFundedBy === "yomico" &&
        cn.finalTotal === 600 && co.finalTotal === 900 && cn.rewardValue === 300 &&
        legacyCouponShare?.vendorEarning === 900 && legacyCouponShare?.yomicoCouponShare === 0,
      JSON.stringify({ cs, ns, cn: cn.finalTotal, legacy: legacyCouponShare }));

    const legacy = { ...lo }; delete (legacy as any).rewardFundedBy;
    const legacyShare = computeVendorShare(legacy, VENDOR);
    record("R6c historical orders (rewardValue but no rewardFundedBy stamp) keep their old payout rule — the seller share is still reduced by rewardValue",
      legacyShare?.vendorEarning === 700, JSON.stringify(legacyShare));
  }

  // ============ R7. return refunds are usable points ============
  {
    await clearRateLimits();
    const U = "r7_return";
    await eligibleUser(U, 0);
    await db.collection("orders").doc("r7_order").set({ userId: U, status: "Delivered", items: [] });
    await db.collection("returns").doc("ret_r7").set({ userId: U, userEmail: `${U}@example.com`, orderId: "r7_order", refundAmount: 250, status: "Approved" });
    const rr = await returnCall("ret_r7", "Refunded");
    const refundRow = await row("refundreturn_ret_r7");
    await clearRateLimits();
    const info = await json(await rewardInfo(new Request("http://x/api/account/reward-redemption", { headers: { authorization: `Bearer test:${U}:${U}@example.com:true` } })));
    await clearRateLimits();
    const use = await codOrder(U, true);
    const uo = use.json?.orderId ? await orderDoc(use.json.orderId) : null;
    record("R7a return refund -> usable points: +250 refund row, checkout shows 250 spendable, and redeeming them takes ₹250 off the next order (pay ₹750)",
      rr.status === 200 && isV2(refundRow, "refund_return", 250, 0, 250) && info.spendable === 250 && info.eligible === true &&
        use.status === 200 && uo?.rewardValue === 250 && uo?.finalTotal === 750 && (await balance(U)) === 0,
      JSON.stringify({ rr: rr.status, info, use: use.status, final: uo?.finalTotal }));

    const refundShare = refundableForOrderIndex(uo, 0);
    const legacyOrder = { ...uo }; delete (legacyOrder as any).rewardFundedBy;
    record("R7b returning an item bought partly with points refunds what the customer tendered (₹750 cash + 250 points = ₹1000 as points), bounded by the item value; an unstamped legacy order is unchanged (₹750)",
      refundShare === 1000 && refundableForOrderIndex(legacyOrder, 0) === 750, `stamped=${refundShare} legacy=${refundableForOrderIndex(legacyOrder, 0)}`);
  }

  // ============ R8. cancellation accounting ============
  {
    await clearRateLimits();
    const U = "r8_cod_cancel";
    await eligibleUser(U, 300);
    const placed = await codOrder(U, true);
    const orderId = placed.json.orderId as string;
    const afterPlace = await balance(U);
    await clearRateLimits();
    const outs = await Promise.all(Array.from({ length: 3 }, () => cancelOrder(req("http://x/api/cancel-order", { orderId }, U))));
    const restore = await row(`cancelrestore_${orderId}`);
    const rows = (await rowsFor(U)).filter((r) => r.kind === "cancel_restore");
    record("R8a cancelling a COD order that used points restores exactly the 300 deducted (0 -> 300, one cancelrestore row); three parallel cancels restore once; no points from nothing",
      afterPlace === 0 && outs.every((r) => r.status === 200) && isV2(restore, "cancel_restore", 300, 0, 300) && rows.length === 1 && (await balance(U)) === 300 &&
        (await rowsFor(U)).reduce((sum, r) => sum + (r.delta || 0), 0) === 0,
      `afterPlace=${afterPlace} statuses=${outs.map((r) => r.status).join("/")} balance=${await balance(U)}`);

    await clearRateLimits();
    const W = "r8_online_cancel";
    await eligibleUser(W, 300);
    const i = await onlineIntent(W, true);
    await finalizeIntent(i, "pay_r8_online");
    const oid = onlineOrderIdFor("pay_r8_online");
    await clearRateLimits();
    const c = await cancelOrder(req("http://x/api/cancel-order", { orderId: oid }, W));
    const o = await orderDoc(oid);
    const rrow = await row(`cancelrestore_${oid}`);
    record("R8b cancelling a paid online order that used points: the 300 points come back (0 -> 300) and the cash refund due is only what was charged (₹700), never the points value",
      c.status === 200 && isV2(rrow, "cancel_restore", 300, 0, 300) && o?.refundAmountDue === 700 && (await balance(W)) === 300,
      `cancel=${c.status} refundDue=${o?.refundAmountDue} balance=${await balance(W)}`);
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
