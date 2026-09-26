/*
 * LOCAL-ONLY emulator regression harness — coupon evaluation + one-use-per-user
 * on web and mobile (lib/coupons/couponRules.ts).
 * ---------------------------------------------------------------------------
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (`razorpay` is aliased to the fake via
 * ../mobile-variant/tsconfig.harness.json), never reads the real service
 * account (a throwaway RSA key is generated). Auth is faked by intercepting
 * the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/coupons/run.mts"
 */
import crypto from "node:crypto";

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
    type: "service_account",
    project_id: PROJECT_ID,
    private_key_id: "test-key-id",
    private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`,
    client_id: "000000000000000000000",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.RAZORPAY_KEY_ID = "rzp_test_LOCALHARNESS";
process.env.RAZORPAY_KEY_SECRET = "test_secret_local_harness";

// Fake Firebase Auth: token "test:<uid>:<email>:<emailVerified>"
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try { idToken = JSON.parse(init?.body ?? "{}").idToken ?? ""; } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) {
      return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    }
    return new Response(
      JSON.stringify({ users: [{ localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true" }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { evaluateCoupon, normalizeCouponCode, couponRedemptionId } = await import("../../../lib/coupons/couponRules.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { finalizeOnlineOrder } = await import("../../../lib/onlineOrder.ts");
const { POST: cancelOrder } = await import("../../../app/api/cancel-order/route.ts");
const { control } = await import("../mobile-variant/control.mjs");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["products", "orders", "cart", "paymentIntents", "coupons", "couponRedemptions", "counters",
  "rateLimits", "settings", "notifications", "users", "rewardTransactions", "deliveryJobs", "unmatchedPayments"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

function req(url: string, body: unknown, uid: string) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${uid}@example.com:true`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

const VENDOR = "vendor_coupon_1";
const P_MOB = "prod_coupon_mobile";
const P_WEB = "prod_coupon_web";
const MOB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road", deliverySlot: "" };
const WEB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };
let key = 0;
const nextKey = () => `cpnkey${++key}${Date.now()}`;

async function seed() {
  await db.collection("settings").doc("global").set({ commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  // Two canonical admin-format coupons (exactly what app/admin/coupons writes), one inactive,
  // and one legacy mobile-only shape that the shared evaluator no longer honours.
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true, createdAt: Timestamp.now() });
  await db.collection("coupons").add({ code: "OFF20", discount: 20, active: false, createdAt: Timestamp.now() });
  await db.collection("coupons").add({ code: "OLDMOB", discountType: "percent", discountValue: 15, active: true });
  await db.collection("products").doc(P_MOB).set({ name: "Coupon Kettle", price: 1000, sellingPrice: 1000, mrp: 1500, gstPercent: 0, stock: 100, sales: 0, active: true, vendorId: VENDOR, vendorName: "Coupon Traders" });
  await db.collection("products").doc(P_WEB).set({ title: "Coupon Lamp", sellingPrice: 1000, mrp: 1500, stock: 100, sales: 0, active: true, vendorId: VENDOR, vendorName: "Coupon Traders", gstRate: 12 });
}
async function setCart(uid: string, quantity = 2) {
  const existing = await db.collection("cart").where("userId", "==", uid).get();
  for (const d of existing.docs) await d.ref.delete();
  await db.collection("cart").add({ userId: uid, savedForLater: false, productId: P_MOB, quantity, name: "Coupon Kettle", price: 1 });
}
const redemption = async (uid: string, code: string) => (await db.collection("couponRedemptions").doc(couponRedemptionId(uid, code)).get());
const orderById = async (id: string) => (await db.collection("orders").doc(id).get()).data() as any;
async function mobileCod(uid: string, extra: Record<string, unknown> = {}) {
  await setCart(uid);
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, idempotencyKey: nextKey(), ...extra }, uid));
  return { status: res.status, json: await json(res) };
}
async function mobileOnlineStart(uid: string, extra: Record<string, unknown> = {}) {
  await setCart(uid);
  control.reset();
  const res = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", { ...MOB_BODY, ...extra }, uid));
  const j = await json(res);
  const intent = j.razorpayOrderId ? (await db.collection("paymentIntents").doc(j.razorpayOrderId).get()).data() : null;
  return { status: res.status, json: j, intent: intent as any, rzpCalls: control.calls.ordersCreate };
}

async function main() {
  await clearAll();
  await seed();

  // ============ A. Shared evaluator (pure) ============
  const now = new Date("2026-09-26T12:00:00Z");
  const past = new Date("2026-01-01T00:00:00Z");
  const future = new Date("2027-01-01T00:00:00Z");
  const ev = (c: any, s = 2000) => evaluateCoupon(c, s, now);
  const cases: [string, boolean][] = [
    ["valid admin-format 10% of 2000 = 200", (() => { const r = ev({ code: "SAVE10", discount: 10, active: true }); return r.ok && r.discountAmount === 200 && r.percent === 10; })()],
    ["missing active rejected", !ev({ code: "X", discount: 10 }).ok],
    ["active:false rejected", !ev({ code: "X", discount: 10, active: false }).ok],
    ["active:'true' (string) rejected", !ev({ code: "X", discount: 10, active: "true" }).ok],
    ["discount > 100 rejected", !ev({ code: "X", discount: 101, active: true }).ok],
    ["discount 0 rejected", !ev({ code: "X", discount: 0, active: true }).ok],
    ["negative discount rejected", !ev({ code: "X", discount: -5, active: true }).ok],
    ["string discount rejected", !ev({ code: "X", discount: "10", active: true }).ok],
    ["expired rejected", (() => { const r = ev({ code: "X", discount: 10, active: true, expiresAt: past }); return !r.ok && r.reason === "expired"; })()],
    ["not-yet-expired accepted", ev({ code: "X", discount: 10, active: true, expiresAt: future }).ok],
    ["Firestore Timestamp expiry honoured", !ev({ code: "X", discount: 10, active: true, expiresAt: Timestamp.fromDate(past) }).ok],
    ["malformed expiresAt rejected (fail closed)", !ev({ code: "X", discount: 10, active: true, expiresAt: "soon" }).ok],
    ["minOrderValue not met rejected", (() => { const r = ev({ code: "X", discount: 10, active: true, minOrderValue: 5000 }); return !r.ok && r.reason === "min-order"; })()],
    ["minOrderValue met accepted", ev({ code: "X", discount: 10, active: true, minOrderValue: 1000 }).ok],
    ["maxDiscount caps (10% of 2000 capped to 150)", (() => { const r = ev({ code: "X", discount: 10, active: true, maxDiscount: 150 }); return r.ok && r.discountAmount === 150; })()],
    ["100% discount clamps to subtotal", (() => { const r = ev({ code: "X", discount: 100, active: true }); return r.ok && r.discountAmount === 2000; })()],
    ["legacy mobile-only {discountType,discountValue} rejected", !ev({ code: "OLDMOB", discountType: "percent", discountValue: 15, active: true }).ok],
    ["no coupon document -> invalid", !ev(null).ok],
    ["code normalised case-insensitively", normalizeCouponCode("  save10 ") === "SAVE10" && normalizeCouponCode("") === null && normalizeCouponCode("x".repeat(51)) === null && normalizeCouponCode(42) === null],
    ["web arithmetic preserved: 599 x 10% = 599*(10/100)", (() => { const r = evaluateCoupon({ code: "X", discount: 10, active: true }, 599, now); return r.ok && r.discountAmount === 599 * (10 / 100); })()],
  ];
  const failedA = cases.filter(([, ok]) => !ok).map(([n]) => n);
  record(`A  shared evaluator: ${cases.length} cases`, failedA.length === 0, failedA.length ? `FAILED: ${failedA.join(" | ")}` : "all pass");

  // ============ B. Mobile ============
  const M1 = "buyer_mob_1";
  {
    const r = await mobileCod(M1, { couponCode: "save10", discountAmount: 999999, discount: 999999 });
    const o = r.json.orderId ? await orderById(r.json.orderId) : null;
    const red = await redemption(M1, "SAVE10");
    record("B1 mobile COD: admin-format coupon (lower-case entry) gives 10% (200 of 2000); client discount ignored",
      r.status === 200 && o?.discountAmount === 200 && o?.discount === 200 && o?.total === 1800 && o?.paymentAmount === 1800 && o?.couponCode === "SAVE10",
      `status=${r.status} discountAmount=${o?.discountAmount} total=${o?.total} code=${o?.couponCode}`);
    record("B2 mobile COD: redemption stored as couponRedemptions/{uid}_SAVE10 with this orderId (same fields as web)",
      red.exists && red.data()?.orderId === r.json.orderId && red.data()?.userId === M1 && red.data()?.code === "SAVE10" && !!red.data()?.userEmail,
      `exists=${red.exists} orderId=${red.data()?.orderId}`);
    const again = await mobileCod(M1, { couponCode: "SAVE10" });
    const orders = (await db.collection("orders").where("userId", "==", M1).get()).size;
    record("B3 mobile COD: second use by the same customer rejected, no second order",
      again.status === 400 && /already used/i.test(again.json.error || "") && orders === 1, `status=${again.status} "${again.json.error}" orders=${orders}`);
  }
  {
    const r = await mobileCod("buyer_mob_inactive", { couponCode: "OFF20" });
    const legacy = await mobileCod("buyer_mob_legacy", { couponCode: "OLDMOB" });
    const unknown = await mobileCod("buyer_mob_unknown", { couponCode: "NOPE" });
    record("B4 mobile COD: inactive, legacy mobile-only and unknown coupons rejected (no order, no redemption)",
      r.status === 400 && legacy.status === 400 && unknown.status === 400 && (await db.collection("couponRedemptions").get()).size === 1,
      `inactive=${r.status} "${r.json.error}" legacy=${legacy.status} "${legacy.json.error}" unknown=${unknown.status}`);
  }
  // Concurrency: two simultaneous COD orders with the same coupon.
  {
    const C = "buyer_mob_race";
    await setCart(C);
    const [a, b] = await Promise.all([
      mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, couponCode: "SAVE10", idempotencyKey: nextKey() }, C)),
      mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, couponCode: "SAVE10", idempotencyKey: nextKey() }, C)),
    ]);
    const statuses = [a.status, b.status].sort();
    const orders = (await db.collection("orders").where("userId", "==", C).get()).docs.map((d) => d.data());
    const discounted = orders.filter((o: any) => Number(o.discountAmount) > 0).length;
    const reds = (await db.collection("couponRedemptions").where("userId", "==", C).get()).size;
    record("B5 concurrent mobile COD with the same coupon: exactly one discounted order and one redemption",
      statuses[0] === 200 && statuses[1] !== 200 && discounted === 1 && orders.length === 1 && reds === 1,
      `statuses=${statuses.join(",")} orders=${orders.length} discounted=${discounted} redemptions=${reds}`);
  }
  // The transactional guard itself: a claim the pre-check query cannot see
  // (its stored fields don't match) but sitting at the deterministic id —
  // only the in-transaction read of couponRedemptions/{uid}_{CODE} can stop it.
  {
    const T = "buyer_mob_txguard";
    await db.collection("couponRedemptions").doc(couponRedemptionId(T, "SAVE10")).set({ userId: "someone-else", code: "OTHER", orderId: "claimed-by-a-concurrent-order" });
    const r = await mobileCod(T, { couponCode: "SAVE10" });
    const orders = (await db.collection("orders").where("userId", "==", T).get()).size;
    record("B5b in-transaction guard: an existing deterministic claim refuses the order (409), no order written",
      r.status === 409 && /already been used/i.test(r.json.error || "") && orders === 0, `status=${r.status} "${r.json.error}" orders=${orders}`);
  }
  // Mobile ONLINE
  {
    const O = "buyer_online_1";
    const s = await mobileOnlineStart(O, { couponCode: "SAVE10", discountAmount: 999999 });
    record("B6 mobile ONLINE: admin-format coupon priced 200 on the intent; amount charged 1800; client discount ignored",
      s.status === 200 && s.intent?.discountAmount === 200 && s.intent?.couponCode === "SAVE10" && s.json.amount === 180000,
      `status=${s.status} intentDiscount=${s.intent?.discountAmount} amount=${s.json.amount}`);
    const fin = await finalizeMobileOnlineOrder({ razorpayPaymentId: "pay_cpn_1", razorpayOrderId: s.json.razorpayOrderId, intent: s.intent, capturedAmountPaise: s.intent.expectedAmountPaise, source: "mobile-app" });
    const o = await orderById("pay_cpn_1");
    const red = await redemption(O, "SAVE10");
    record("B7 mobile ONLINE finalize: order discounted, redemption claimed for this order, no review flag",
      fin.kind === "created" && o?.discountAmount === 200 && !o?.couponConflict && !o?.needsReview && red.exists && red.data()?.orderId === "pay_cpn_1",
      `kind=${fin.kind} conflict=${o?.couponConflict} redemptionOrder=${red.data()?.orderId}`);
    const second = await mobileOnlineStart(O, { couponCode: "SAVE10" });
    record("B8 mobile ONLINE: second use refused BEFORE any Razorpay order (no intent)",
      second.status === 400 && /already used/i.test(second.json.error || "") && second.rzpCalls === 0 && !second.intent,
      `status=${second.status} "${second.json.error}" rzpCalls=${second.rzpCalls}`);
  }
  {
    // Two payments started before either finalises (the established race): the
    // second finalisation is created but flagged couponConflict + needsReview.
    const R = "buyer_online_race";
    const s1 = await mobileOnlineStart(R, { couponCode: "SAVE10" });
    const s2 = await mobileOnlineStart(R, { couponCode: "SAVE10" });
    const f1 = await finalizeMobileOnlineOrder({ razorpayPaymentId: "pay_race_a", razorpayOrderId: s1.json.razorpayOrderId, intent: s1.intent, capturedAmountPaise: s1.intent.expectedAmountPaise, source: "mobile-app" });
    const f2 = await finalizeMobileOnlineOrder({ razorpayPaymentId: "pay_race_b", razorpayOrderId: s2.json.razorpayOrderId, intent: s2.intent, capturedAmountPaise: s2.intent.expectedAmountPaise, source: "webhook" });
    const a = await orderById("pay_race_a");
    const b = await orderById("pay_race_b");
    const red = await redemption(R, "SAVE10");
    const notes = (await db.collection("notifications").where("role", "==", "admin").get()).docs.map((d) => String(d.data().message || ""));
    record("B9 mobile ONLINE race: first claims; second created but couponConflict + needsReview, redemption unchanged, admin alerted",
      s1.status === 200 && s2.status === 200 && f1.kind === "created" && f2.kind === "created" &&
      !a?.couponConflict && b?.couponConflict === true && b?.needsReview === true && red.data()?.orderId === "pay_race_a" &&
      notes.some((m) => m.includes("already redeemed")),
      `a.conflict=${a?.couponConflict} b.conflict=${b?.couponConflict} b.review=${b?.needsReview} redemption=${red.data()?.orderId}`);
  }

  // ============ C. Web ============
  {
    const W = "buyer_web_1";
    const body = { ...WEB_BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", items: [{ id: P_WEB, qty: 2 }], couponCode: "SAVE10", discountAmount: 999999 };
    const r1 = await webPlaceOrder(req("http://x/api/place-order", { ...body, idempotencyKey: nextKey() }, W));
    const j1 = await json(r1);
    const o = j1.orderId ? await orderById(j1.orderId) : null;
    const red = await redemption(W, "SAVE10");
    record("C1 web COD: admin-format coupon still 10% (discount 200, finalTotal 1800), redemption claimed",
      r1.status === 200 && o?.discount === 200 && o?.finalTotal === 1800 && red.exists && red.data()?.orderId === j1.orderId,
      `status=${r1.status} discount=${o?.discount} finalTotal=${o?.finalTotal}`);
    const r2 = await webPlaceOrder(req("http://x/api/place-order", { ...body, idempotencyKey: nextKey() }, W));
    const j2 = await json(r2);
    record("C2 web COD: second use by the same customer still rejected", r2.status === 400 && /already used/i.test(j2.error || ""), `status=${r2.status} "${j2.error}"`);
    const r3 = await webPlaceOrder(req("http://x/api/place-order", { ...body, couponCode: "OLDMOB", idempotencyKey: nextKey() }, "buyer_web_legacy"));
    record("C3 web and mobile agree: legacy mobile-only coupon rejected on web too", r3.status === 400, `status=${r3.status} "${(await json(r3)).error}"`);
  }
  {
    // Existing web ONLINE conflict behaviour stays intact.
    const WR = "buyer_web_race";
    const start = async () => {
      control.reset();
      const res = await webCreateOrder(req("http://x/api/create-order", { ...WEB_BODY, items: [{ id: P_WEB, qty: 2 }], couponCode: "SAVE10" }, WR));
      const j = await json(res);
      return { status: res.status, id: j.id, intent: (await db.collection("paymentIntents").doc(j.id).get()).data() as any };
    };
    const s1 = await start();
    const s2 = await start();
    const f1 = await finalizeOnlineOrder({ razorpayPaymentId: "pay_web_a", razorpayOrderId: s1.id, intent: s1.intent, capturedAmountPaise: s1.intent.expectedAmountPaise, source: "browser" });
    const f2 = await finalizeOnlineOrder({ razorpayPaymentId: "pay_web_b", razorpayOrderId: s2.id, intent: s2.intent, capturedAmountPaise: s2.intent.expectedAmountPaise, source: "webhook" });
    const a = await orderById("pay_web_a");
    const b = await orderById("pay_web_b");
    record("C4 web ONLINE: coupon priced 200 at create-order; race still -> first claims, second couponConflict + needsReview",
      s1.status === 200 && s1.intent?.pricing?.couponDiscount === 200 && f1.kind === "created" && f2.kind === "created" &&
      !a?.couponConflict && b?.couponConflict === true && b?.needsReview === true && (await redemption(WR, "SAVE10")).data()?.orderId === "pay_web_a",
      `couponDiscount=${s1.intent?.pricing?.couponDiscount} a.conflict=${a?.couponConflict} b.conflict=${b?.couponConflict}`);
  }

  // ============ D. Cancellation releases the redemption ============
  {
    const X = "buyer_cancel_1";
    const first = await mobileCod(X, { couponCode: "SAVE10" });
    const before = await redemption(X, "SAVE10");
    const res = await cancelOrder(req("http://x/api/cancel-order", { orderId: first.json.orderId }, X));
    const cj = await json(res);
    const after = await redemption(X, "SAVE10");
    const cancelled = await orderById(first.json.orderId);
    record("D1 cancelling a mobile coupon order releases couponRedemptions/{uid}_SAVE10",
      first.status === 200 && before.exists && res.status === 200 && cancelled?.status === "Cancelled" && !after.exists,
      `order=${first.status} cancel=${res.status} ${cj.error || ""} status=${cancelled?.status} redemptionAfter=${after.exists}`);
    const again = await mobileCod(X, { couponCode: "SAVE10" });
    const o = again.json.orderId ? await orderById(again.json.orderId) : null;
    record("D2 the coupon can be used again after a valid cancellation",
      again.status === 200 && o?.discountAmount === 200 && (await redemption(X, "SAVE10")).data()?.orderId === again.json.orderId,
      `status=${again.status} discount=${o?.discountAmount}`);
  }

  await clearAll();
  const failed = results.filter((r) => !r.pass);
  console.log("\n=================== SUMMARY ===================");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("ALL COUPON SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
