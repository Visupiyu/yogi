/*
 * LOCAL-ONLY emulator regression harness — seller settlement (Stage 1A/1B).
 * ---------------------------------------------------------------------------
 * Proves, through the real order, confirmation, payable and withdrawal code:
 *   - YOMICO commission is ₹0 / 0% on every order path, even when
 *     settings/global says commissionEnabled=true, commissionRate=0.10, and
 *     for orders with a missing, legacy or invalid commissionRate;
 *   - on a free-delivery order the ONE order-level delivery cost is split
 *     between the sellers by item value, stored on sellerOrders as
 *     sellerDeliveryCharge, and the shares add up to order.deliveryCost exactly;
 *   - paid-delivery orders charge sellers nothing for delivery;
 *   - seller payable = gross − seller-funded discount − 0 − delivery ± returns,
 *     and the seller API (wallet / payout report / dashboard / analytics),
 *     the withdrawal request, the admin payouts calculation, the admin home
 *     dashboard helper and the seller/admin AI tools all agree.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/seller-settlement/run.mts"
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
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { finalizeOnlineOrder } = await import("../../../lib/onlineOrder.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { POST: confirmOrder } = await import("../../../app/api/confirm-order/route.ts");
const { GET: sellerPayable } = await import("../../../app/api/seller/payable/route.ts");
const { POST: requestWithdrawal } = await import("../../../app/api/request-withdrawal/route.ts");
const { computeVendorShare } = await import("../../../lib/vendorEarnings.ts");
const { computeVendorEarningsBreakdown, computeVendorPayableBreakdown } = await import("../../../lib/vendorPayable.ts");
const { splitOrderDeliveryCost } = await import("../../../lib/deliveryRules.ts");
const { resolveCommissionRate } = await import("../../../lib/orderPricing.ts");
const { control } = await import("../mobile-variant/control.mjs");
const { sellerTools } = await import("../../../lib/ai/tools/sellerTools.ts");
const { adminTools } = await import("../../../lib/ai/tools/adminTools.ts");
const { computeEarningsBreakdownByVendor } = await import("../../../lib/vendorPayable.ts");
const { Timestamp } = await import("firebase-admin/firestore");
const { POST: cancelOrder } = await import("../../../app/api/cancel-order/route.ts");
const { refundableForOrderIndex } = await import("../../../lib/itemRequests.ts");
const { COUPON_FUNDED_BY_YOMICO } = await import("../../../lib/coupons/couponRules.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = [
  "cart", "paymentIntents", "orders", "sellerOrders", "products", "notifications", "unmatchedPayments",
  "vendors", "settings", "coupons", "couponRedemptions", "counters", "rateLimits", "withdrawals",
  "vendor_payouts", "itemRequests", "returns", "users", "deliveryJobs", "adminLogs",
];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const ADMIN_UID = "admin_settle_1";
function req(url: string, body: unknown, uid: string, method = "POST", email = `${uid}@example.com`) {
  return new Request(url, {
    method,
    headers: { authorization: `Bearer test:${uid}:${email}:true`, "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

const SELLER_A = "seller_settle_a";
const SELLER_B = "seller_settle_b";
const SELLER_C = "seller_settle_c";
// Products usable by BOTH web (title/sellingPrice) and mobile (name/price) pricing.
const PRODUCTS: Record<string, { vendorId: string; price: number }> = {
  p_a300: { vendorId: SELLER_A, price: 300 },
  p_b250: { vendorId: SELLER_B, price: 250 },
  p_a200: { vendorId: SELLER_A, price: 200 },
  p_c100: { vendorId: SELLER_C, price: 100 },
  p_a100: { vendorId: SELLER_A, price: 100 },
  p_b100: { vendorId: SELLER_B, price: 100 },
};
async function seed() {
  // The admin "turned commission on" — every assertion below proves it is ignored.
  await db.collection("settings").doc("global").set({
    commissionEnabled: true, commissionRate: 0.1,
    freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49,
  });
  for (const [id, p] of Object.entries(PRODUCTS)) {
    await db.collection("products").doc(id).set({
      title: `Item ${id}`, name: `Item ${id}`, price: p.price, sellingPrice: p.price, mrp: p.price * 2,
      gstRate: 0, gstPercent: 0, stock: 1000, sales: 0, active: true, vendorId: p.vendorId, vendorName: `Shop ${p.vendorId}`,
    });
  }
  for (const uid of [SELLER_A, SELLER_B, SELLER_C]) {
    await db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status: "Approved", kycStatus: "Approved" });
  }
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true });
}

const BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };
let n = 0;
const key = () => `settlekey${++n}x${Date.now()}`;
// Client-supplied money fields that must be IGNORED on every path (test 14).
const FORGED = { commissionRate: 0.5, commission: 999, commissionAmount: 999, sellerEarning: 1, sellerDeliveryCharge: 0, total: 1, finalTotal: 1 };

async function webCod(uid: string, items: { id: string; qty: number }[], extra: Record<string, unknown> = {}) {
  const res = await webPlaceOrder(req("http://x/api/place-order", {
    ...BODY, ...FORGED, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: key(), items, ...extra,
  }, uid));
  const j = await json(res);
  return { status: res.status, orderId: j.orderId as string, j };
}
async function webOnline(uid: string, items: { id: string; qty: number }[], extra: Record<string, unknown> = {}) {
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", { ...BODY, ...FORGED, items, ...extra }, uid));
  const j = await json(res);
  const intent = (await db.collection("paymentIntents").doc(j.id).get()).data() as any;
  const pid = `pay_settle_${++n}`;
  const r = await finalizeOnlineOrder({ razorpayPaymentId: pid, razorpayOrderId: j.id, intent, capturedAmountPaise: intent.expectedAmountPaise, source: "browser" });
  return { status: res.status, orderId: r.orderId, j };
}
async function setCart(uid: string, lines: { id: string; qty: number }[]) {
  for (const d of (await db.collection("cart").where("userId", "==", uid).get()).docs) await d.ref.delete();
  for (const l of lines) await db.collection("cart").add({ userId: uid, savedForLater: false, productId: l.id, quantity: l.qty, name: "x", price: 1, ...FORGED });
}
async function mobileCod(uid: string, lines: { id: string; qty: number }[], extra: Record<string, unknown> = {}) {
  await setCart(uid, lines);
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...BODY, ...FORGED, deliverySlot: "", idempotencyKey: key(), ...extra }, uid));
  const j = await json(res);
  return { status: res.status, orderId: j.orderId as string, j };
}
async function mobileOnline(uid: string, lines: { id: string; qty: number }[], extra: Record<string, unknown> = {}) {
  await setCart(uid, lines);
  control.reset();
  const res = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", { ...BODY, ...FORGED, deliverySlot: "", ...extra }, uid));
  const j = await json(res);
  const intent = (await db.collection("paymentIntents").doc(j.razorpayOrderId).get()).data() as any;
  const pid = `pay_settle_${++n}`;
  const r = await finalizeMobileOnlineOrder({ razorpayPaymentId: pid, razorpayOrderId: j.razorpayOrderId, intent, capturedAmountPaise: intent.expectedAmountPaise, source: "mobile-app" });
  return { status: res.status, orderId: r.orderId, j };
}
async function confirm(orderId: string) {
  const res = await confirmOrder(req("http://x/api/confirm-order", { orderId }, ADMIN_UID, "POST", ADMIN_EMAIL));
  return res.status;
}
async function deliverAndPay(orderId: string) {
  await db.collection("orders").doc(orderId).update({ status: "Delivered", paymentStatus: "Paid" });
}
async function order(orderId: string) { return (await db.collection("orders").doc(orderId).get()).data() as any; }
async function sellerRecord(orderId: string, vendorId: string) {
  return (await db.collection("sellerOrders").doc(`${orderId}_${vendorId}`).get()).data() as any;
}
async function api(uid: string) {
  const res = await sellerPayable(req("http://x/api/seller/payable", null, uid, "GET"));
  return { status: res.status, ...(await json(res)) };
}
// Everything the admin payouts screen loads (all collections), fed to the same shared function.
async function adminBreakdown(uid: string) {
  const [orders, itemRequests, returns, sellerOrders] = await Promise.all([
    db.collection("orders").get(), db.collection("itemRequests").get(),
    db.collection("returns").where("status", "==", "Refunded").get(), db.collection("sellerOrders").get(),
  ]);
  return computeVendorEarningsBreakdown({
    vendorUid: uid,
    orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })),
    itemRequests: itemRequests.docs.map((d) => d.data()),
    legacyReturns: returns.docs.map((d) => d.data()),
    sellerOrders: sellerOrders.docs.map((d) => d.data()),
  });
}
const zeroCommission = (o: any) => o?.commissionRate === 0 && o?.commissionAmount === 0 && (o?.commission === undefined || o?.commission === 0);

type Scenario = { label: string; place: () => Promise<{ status: number; orderId: string; j: any }> };

async function main() {
  await clearAll();
  await seed();

  // ================= 1. Web COD, paid delivery =================
  {
    const r = await webCod("buyer_s1", [{ id: "p_a200", qty: 1 }]);
    const o = await order(r.orderId);
    const c = await confirm(r.orderId);
    const so = await sellerRecord(r.orderId, SELLER_A);
    await deliverAndPay(r.orderId);
    const b = await adminBreakdown(SELLER_A);
    record("1  web COD, paid delivery: customer 200+49=249; commission 0/₹0; seller delivery charge 0; seller payable 200",
      r.status === 200 && o.finalTotal === 249 && o.shippingCharge === 49 && o.freeDeliveryApplied === false && zeroCommission(o) &&
      c === 200 && so?.sellerDeliveryCharge === 0 && so?.vendorCommission === 0 && b.adjustedEarnings === 200 && b.commission === 0,
      `status=${r.status} finalTotal=${o?.finalTotal} rate=${o?.commissionRate} amount=${o?.commissionAmount} soDelivery=${so?.sellerDeliveryCharge} payable=${b.adjustedEarnings}`);
  }
  await clearAll(); await seed();

  // ================= 2. Web online, free delivery, one seller =================
  {
    const r = await webOnline("buyer_s2", [{ id: "p_a300", qty: 2 }]);
    const o = await order(r.orderId);
    await confirm(r.orderId);
    const so = await sellerRecord(r.orderId, SELLER_A);
    await deliverAndPay(r.orderId);
    const b = await adminBreakdown(SELLER_A);
    record("2  web online, free delivery, one seller: customer 600; seller delivery charge ₹49 (the whole ONE cost); payable 551",
      o.finalTotal === 600 && o.shippingCharge === 0 && o.freeDeliveryApplied === true && o.deliveryCost === 49 && zeroCommission(o) &&
      so?.sellerDeliveryCharge === 49 && b.sellerDeliveryCharges === 49 && b.adjustedEarnings === 551,
      `finalTotal=${o?.finalTotal} soDelivery=${so?.sellerDeliveryCharge} payable=${b.adjustedEarnings}`);
  }
  await clearAll(); await seed();

  // ================= 3/4/5. Two sellers, free delivery — web online, mobile COD, mobile online =================
  const twoSellerLines = [{ id: "p_a300", qty: 1 }, { id: "p_b250", qty: 1 }];
  const paths: Scenario[] = [
    { label: "3  web online", place: () => webOnline("buyer_s3", twoSellerLines) },
    { label: "4  mobile COD", place: () => mobileCod("buyer_s4", twoSellerLines) },
    { label: "5  mobile online", place: () => mobileOnline("buyer_s5", twoSellerLines) },
    { label: "3b web COD", place: () => webCod("buyer_s3b", twoSellerLines) },
  ];
  for (const p of paths) {
    await clearAll(); await seed();
    const r = await p.place();
    const o = await order(r.orderId);
    await confirm(r.orderId);
    const soA = await sellerRecord(r.orderId, SELLER_A);
    const soB = await sellerRecord(r.orderId, SELLER_B);
    await deliverAndPay(r.orderId);
    const bA = await adminBreakdown(SELLER_A);
    const bB = await adminBreakdown(SELLER_B);
    const sum = (soA?.sellerDeliveryCharge ?? NaN) + (soB?.sellerDeliveryCharge ?? NaN);
    record(`${p.label}, free delivery, two sellers (₹300 + ₹250): ONE ₹49 split 27 + 22 = ₹49; commission ₹0; payables 273 / 228`,
      o.finalTotal === 550 && o.freeDeliveryApplied === true && o.deliveryCost === 49 && zeroCommission(o) &&
      soA?.sellerDeliveryCharge === 27 && soB?.sellerDeliveryCharge === 22 && sum === o.deliveryCost &&
      soA?.vendorCommission === 0 && soB?.vendorCommission === 0 &&
      bA.adjustedEarnings === 273 && bB.adjustedEarnings === 228 && bA.commission === 0 && bB.commission === 0,
      `status=${r.status} finalTotal=${o?.finalTotal} A=${soA?.sellerDeliveryCharge} B=${soB?.sellerDeliveryCharge} sum=${sum} payable A=${bA.adjustedEarnings} B=${bB.adjustedEarnings}`);
  }

  // ================= 6. Admin setting commissionEnabled=true, 0.10 =================
  {
    await clearAll(); await seed();
    const settings = (await db.collection("settings").doc("global").get()).data() as any;
    const orders = [
      await webCod("buyer_s6a", [{ id: "p_a300", qty: 2 }]),
      await webOnline("buyer_s6b", [{ id: "p_a300", qty: 2 }]),
      await mobileCod("buyer_s6c", [{ id: "p_a300", qty: 2 }]),
      await mobileOnline("buyer_s6d", [{ id: "p_a300", qty: 2 }]),
    ];
    const docs = await Promise.all(orders.map((r) => order(r.orderId)));
    for (const r of orders) await confirm(r.orderId);
    const records = await Promise.all(orders.map((r) => sellerRecord(r.orderId, SELLER_A)));
    record("6  settings commissionEnabled=true / 0.10: every path stamps commissionRate 0 + commissionAmount 0; sellerOrders vendorCommission 0; resolveCommissionRate ignores it",
      settings.commissionEnabled === true && settings.commissionRate === 0.1 && docs.every(zeroCommission) &&
      records.every((s) => s?.vendorCommission === 0) && resolveCommissionRate(settings) === 0,
      docs.map((d) => `${d?.paymentMethod}:${d?.commissionRate}/${d?.commissionAmount}/${d?.commission}`).join(" "));
  }

  // ================= 7/8. Missing, legacy and invalid commissionRate =================
  {
    const base = { items: [{ vendorId: SELLER_A, price: 1000, qty: 1 }], total: 1000, finalTotal: 1000, discount: 0, rewardValue: 0 };
    const missing = computeVendorShare({ ...base }, SELLER_A);
    record("7  order with MISSING commissionRate -> commission ₹0 (the old 10% fallback is gone)",
      missing?.vendorCommission === 0 && missing?.vendorEarning === 1000, JSON.stringify(missing));
    const odd = [0.1, 0.5, 1, -1, 5, "0.1", NaN, null, Infinity];
    const shares = odd.map((rate) => computeVendorShare({ ...base, commissionRate: rate as any }, SELLER_A));
    record("8  legacy / invalid commissionRate (0.1, 0.5, 1, -1, 5, '0.1', NaN, null, Infinity) -> seller commission ₹0 every time",
      shares.every((s) => s?.vendorCommission === 0 && s?.vendorEarning === 1000),
      shares.map((s) => s?.vendorCommission).join(","));

    // Real order whose stored rate is later "legacy": still ₹0 in payable.
    await clearAll(); await seed();
    const r = await webCod("buyer_s8", [{ id: "p_a200", qty: 1 }]);
    await confirm(r.orderId);
    await db.collection("orders").doc(r.orderId).update({ commissionRate: 0.1, status: "Delivered", paymentStatus: "Paid" });
    const b = await adminBreakdown(SELLER_A);
    record("8b a stored order with commissionRate 0.10 still yields seller commission ₹0 and full payable",
      b.commission === 0 && b.adjustedEarnings === 200, `commission=${b.commission} payable=${b.adjustedEarnings}`);
  }

  // ================= 9. Multi-seller rounding =================
  {
    const cases: [number, number[]][] = [
      [49, [300, 250]], [49, [100, 100, 100]], [49, [1, 1, 1, 1, 1, 1, 1]], [49, [999, 1]], [49, [333, 333, 334]],
      [49, [0, 500]], [60, [123.45, 67.89, 10]], [49.5, [100, 100]], [49, [500]], [1, [10, 10, 10]],
    ];
    const bad: string[] = [];
    for (const [cost, values] of cases) {
      const sellers = values.map((v, i) => ({ vendorId: `v${i}`, value: v }));
      const s = splitOrderDeliveryCost(cost, sellers);
      const sum = Math.round(Object.values(s).reduce((a, b) => a + b, 0) * 100) / 100;
      const zeroValueGetsZero = values.every((v, i) => v > 0 || s[`v${i}`] === 0);
      const wholeRupees = Number.isInteger(cost) ? Object.values(s).every(Number.isInteger) : true;
      if (sum !== cost || !zeroValueGetsZero || !wholeRupees) bad.push(`${cost}:${JSON.stringify(values)}=>${JSON.stringify(s)}`);
    }
    // Random property check.
    for (let t = 0; t < 500; t++) {
      const k = 1 + Math.floor(Math.random() * 6);
      const values = Array.from({ length: k }, () => Math.round(Math.random() * 2000) / (Math.random() < 0.5 ? 1 : 10));
      const s = splitOrderDeliveryCost(49, values.map((v, i) => ({ vendorId: `v${i}`, value: v })));
      const sum = Object.values(s).reduce((a, b) => a + b, 0);
      if (values.some((v) => v > 0) && sum !== 49) bad.push(`random ${JSON.stringify(values)} -> ${sum}`);
    }
    const eq = splitOrderDeliveryCost(49, [{ vendorId: "b", value: 100 }, { vendorId: "a", value: 100 }, { vendorId: "c", value: 100 }]);
    record("9  delivery split always reconciles EXACTLY to the one order cost (10 fixed cases + 500 random), whole rupees, deterministic ties",
      bad.length === 0 && eq.a === 17 && eq.b === 16 && eq.c === 16, bad.slice(0, 3).join(" | ") || `3-way tie -> ${JSON.stringify(eq)}`);

    // And through the real confirmation path with three sellers.
    await clearAll(); await seed();
    const r = await webOnline("buyer_s9", [{ id: "p_a100", qty: 2 }, { id: "p_b100", qty: 2 }, { id: "p_c100", qty: 2 }]);
    await confirm(r.orderId);
    const recs = await Promise.all([SELLER_A, SELLER_B, SELLER_C].map((v) => sellerRecord(r.orderId, v)));
    const charges = recs.map((x) => x?.sellerDeliveryCharge);
    record("9b three equal sellers on one ₹600 free-delivery order: shares 17/16/16, sum = order.deliveryCost (49), never 3 × ₹49",
      JSON.stringify(charges) === "[17,16,16]" && charges.reduce((a: number, c: number) => a + c, 0) === (await order(r.orderId)).deliveryCost,
      JSON.stringify(charges));
  }

  // ================= 10. Coupon (H3: YOMICO-funded — the seller keeps the pre-coupon value) =================
  {
    await clearAll(); await seed();
    const r = await webOnline("buyer_s10", twoSellerLines, { couponCode: "SAVE10" });
    const o = await order(r.orderId);
    await confirm(r.orderId);
    await deliverAndPay(r.orderId);
    const bA = await adminBreakdown(SELLER_A);
    const bB = await adminBreakdown(SELLER_B);
    // A 300 + B 250 = 550; 10% coupon = 55, paid by YOMICO. Each seller keeps
    // their full item value; YOMICO's cost is recorded per seller by value
    // (30 / 25, summing to the whole 55) but is NOT deducted.
    const nearly = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 1e-9;
    record("10 coupon SAVE10 on the two-seller order (H3): customer 495; order stamped couponFundedBy yomico; sellers bear no coupon (discountShare 0 / 0); YOMICO coupon share 30 / 25 (= 55); commission ₹0; payables 273 / 228",
      o.finalTotal === 495 && o.couponFundedBy === "yomico" && zeroCommission(o) && bA.discountShare === 0 && bB.discountShare === 0 &&
      nearly(bA.yomicoCouponShare, 30) && nearly(bB.yomicoCouponShare, 25) && nearly(bA.yomicoCouponShare + bB.yomicoCouponShare, o.discount) &&
      bA.commission === 0 && bB.commission === 0 && bA.adjustedEarnings === 273 && bB.adjustedEarnings === 228,
      `finalTotal=${o?.finalTotal} couponFundedBy=${o?.couponFundedBy} discountShare=${bA.discountShare}/${bB.discountShare} yomico=${bA.yomicoCouponShare}/${bB.yomicoCouponShare} payable=${bA.adjustedEarnings}/${bB.adjustedEarnings}`);
  }

  // ================= 11/12/13. Wallet, payout report and admin payout agree =================
  {
    // State from test 10 plus a paid-delivery order for A.
    const r2 = await webCod("buyer_s11", [{ id: "p_a200", qty: 1 }]);
    await confirm(r2.orderId);
    await deliverAndPay(r2.orderId);
    const apiA = await api(SELLER_A);
    const adminA = await adminBreakdown(SELLER_A);
    const recon = apiA.breakdown && Math.abs(
      apiA.breakdown.grossSales - apiA.breakdown.discountShare - apiA.breakdown.commission -
      apiA.breakdown.sellerDeliveryCharges - apiA.breakdown.returnDeductions - apiA.breakdown.returnLogisticsCharges -
      apiA.breakdown.adjustedEarnings) < 1e-9;
    record("11 wallet: /api/seller/payable payable == available == breakdown.adjustedEarnings (473 = 273 + 200), no commitments yet",
      apiA.status === 200 && apiA.payable === 473 && apiA.available === 473 && apiA.breakdown?.adjustedEarnings === 473,
      `payable=${apiA.payable} available=${apiA.available}`);
    record("12 payout report figures (API breakdown): gross 500, seller discount 0, YOMICO coupon share 30 (not deducted), commission 0, delivery 27, net 473 — and they reconcile",
      apiA.breakdown?.grossSales === 500 && apiA.breakdown?.discountShare === 0 &&
      Math.abs(Number(apiA.breakdown?.yomicoCouponShare) - 30) < 1e-9 && apiA.breakdown?.commission === 0 &&
      apiA.breakdown?.sellerDeliveryCharges === 27 && recon === true,
      JSON.stringify(apiA.breakdown));
    record("13 admin payouts (same shared function over ALL collections, as the admin screen loads them) == seller API, for both sellers",
      adminA.adjustedEarnings === apiA.breakdown?.adjustedEarnings && adminA.sellerDeliveryCharges === apiA.breakdown?.sellerDeliveryCharges &&
      adminA.grossSales === apiA.breakdown?.grossSales && adminA.commission === 0 &&
      (await adminBreakdown(SELLER_B)).adjustedEarnings === (await api(SELLER_B)).breakdown?.adjustedEarnings,
      `admin=${adminA.adjustedEarnings} api=${apiA.breakdown?.adjustedEarnings}`);

    // Withdrawal uses the same payable: above -> refused, exactly -> accepted, then 0 left.
    const over = await requestWithdrawal(req("http://x/api/request-withdrawal", { amount: 474, idempotencyKey: key() }, SELLER_A));
    const exact = await requestWithdrawal(req("http://x/api/request-withdrawal", { amount: 473, idempotencyKey: key() }, SELLER_A));
    const after = await api(SELLER_A);
    const adminAfter = computeVendorPayableBreakdown({
      vendorUid: SELLER_A,
      orders: (await db.collection("orders").get()).docs.map((d) => ({ id: d.id, ...d.data() })),
      payouts: [], withdrawals: (await db.collection("withdrawals").get()).docs.map((d) => ({ id: d.id, ...d.data() })),
      sellerOrders: (await db.collection("sellerOrders").get()).docs.map((d) => d.data()),
    });
    record("11b withdrawal: ₹474 refused (409), ₹473 accepted; afterwards API payable 0 / reserved 473, admin calc identical",
      over.status === 409 && exact.status === 200 && after.payable === 0 && after.breakdown?.reserved === 473 &&
      adminAfter.payable === after.payable && adminAfter.reserved === 473,
      `over=${over.status} exact=${exact.status} after=${after.payable} reserved=${after.breakdown?.reserved}`);
  }

  // ================= 15–18. AI tools + admin dashboard use the SAME breakdown =================
  {
    // State from 11/12/13: seller A has the coupon order + a paid-delivery COD
    // order and a ₹473 reserved withdrawal; seller B has the coupon order.
    const apiA = await api(SELLER_A);
    const apiB = await api(SELLER_B);
    const sellerCtx = { uid: SELLER_A, email: `${SELLER_A}@example.com`, isAdmin: false };
    const adminCtx = { uid: ADMIN_UID, email: ADMIN_EMAIL, isAdmin: true };
    const tool = (list: any[], name: string) => list.find((t) => t.name === name)!;

    const s = (await tool(sellerTools, "getSellerSales").execute({}, sellerCtx)) as any;
    const sWin = (await tool(sellerTools, "getSellerSales").execute({ days: 30 }, sellerCtx)) as any;
    record("15 AI getSellerSales == seller API breakdown (gross 500, seller discount 0, YOMICO coupon share 30, commission 0, delivery 27, net 473, withdrawable 0); 30-day window same money, no balance",
      s.commission === 0 && s.grossSales === apiA.breakdown.grossSales && s.sellerDiscountShare === apiA.breakdown.discountShare &&
      s.yomicoCouponShare === apiA.breakdown.yomicoCouponShare &&
      s.sellerDeliveryCharges === apiA.breakdown.sellerDeliveryCharges && s.sellerDeliveryCharges === 27 &&
      s.netEarnings === apiA.breakdown.adjustedEarnings && s.withdrawableNow === apiA.available &&
      s.reserved === apiA.breakdown.reserved && s.settledOrders === 2 && s.totalOrders === 2 &&
      sWin.netEarnings === s.netEarnings && sWin.sellerDeliveryCharges === 27 && !("withdrawableNow" in sWin),
      JSON.stringify(s));

    const perf = tool(adminTools, "getVendorPerformance");
    const one = (await perf.execute({ vendorId: SELLER_A }, adminCtx)) as any;
    const top = (await perf.execute({}, adminCtx)) as any;
    const topA = top.topVendors.find((v: any) => v.vendorId === SELLER_A);
    const topB = top.topVendors.find((v: any) => v.vendorId === SELLER_B);
    record("16 AI getVendorPerformance (single vendor + top list) == seller API breakdown for A and B, delivery 27 / 22, commission 0",
      one.netEarnings === apiA.breakdown.adjustedEarnings && one.payable === apiA.payable && one.sellerDeliveryCharges === 27 &&
      topA?.netEarnings === apiA.breakdown.adjustedEarnings && topB?.netEarnings === apiB.breakdown.adjustedEarnings &&
      topA?.sellerDeliveryCharges === 27 && topB?.sellerDeliveryCharges === 22 &&
      top.topVendors.every((v: any) => v.commission === 0) && one.commission === 0,
      `one=${one.netEarnings}/${one.payable} topA=${topA?.netEarnings} topB=${topB?.netEarnings} api=${apiA.breakdown.adjustedEarnings}/${apiB.breakdown.adjustedEarnings}`);

    // A legacy order document still carrying a non-zero commission field.
    await db.collection("orders").doc("legacy_commission_doc").set({
      status: "Delivered", paymentStatus: "Paid", commission: 999, commissionRate: 0.1, total: 5000,
      items: [], vendorIds: [], createdAt: Timestamp.now(),
    });
    const cs = (await tool(adminTools, "getCommissionSummary").execute({}, adminCtx)) as any;
    const ss = (await tool(adminTools, "getAdminSalesSummary").execute({}, adminCtx)) as any;
    record("17 AI commission summaries report ₹0 / 0% even when a legacy order document carries commission 999",
      cs.totalCommission === 0 && cs.commissionRate === 0 && cs.orderCount > 0 && ss.totalCommission === 0,
      `commissionSummary=${JSON.stringify(cs)} salesSummary.totalCommission=${ss.totalCommission}`);

    // Admin home dashboard: computeEarningsBreakdownByVendor over everything the
    // dashboard loads (all orders, sellerOrders, itemRequests, refunded returns).
    const [allOrders, allSellerOrders, allItemRequests, refunded] = await Promise.all([
      db.collection("orders").get(), db.collection("sellerOrders").get(),
      db.collection("itemRequests").get(), db.collection("returns").where("status", "==", "Refunded").get(),
    ]);
    const byVendor = computeEarningsBreakdownByVendor({
      orders: allOrders.docs.map((d) => ({ id: d.id, ...d.data() })),
      sellerOrders: allSellerOrders.docs.map((d) => d.data()),
      itemRequests: allItemRequests.docs.map((d) => d.data()),
      legacyReturns: refunded.docs.map((d) => d.data()),
    });
    record("18 admin dashboard per-vendor figures (computeEarningsBreakdownByVendor) == seller API for A and B, incl. stored delivery 27 / 22, commission 0",
      byVendor[SELLER_A]?.adjustedEarnings === apiA.breakdown.adjustedEarnings &&
      byVendor[SELLER_B]?.adjustedEarnings === apiB.breakdown.adjustedEarnings &&
      byVendor[SELLER_A]?.sellerDeliveryCharges === 27 && byVendor[SELLER_B]?.sellerDeliveryCharges === 22 &&
      byVendor[SELLER_A]?.grossSales === apiA.breakdown.grossSales &&
      Object.values(byVendor).every((b: any) => b.commission === 0) && !("" in byVendor),
      JSON.stringify(Object.fromEntries(Object.entries(byVendor).map(([k, v]: any) => [k, v.adjustedEarnings]))));
    await db.collection("orders").doc("legacy_commission_doc").delete();
  }

  // ================= Immutability: stored snapshot beats mutable order/settings =================
  {
    await clearAll(); await seed();
    const r = await webOnline("buyer_imm", twoSellerLines);
    await confirm(r.orderId);
    await deliverAndPay(r.orderId);
    await db.collection("settings").doc("global").update({ deliveryCost: 99 });
    await db.collection("orders").doc(r.orderId).update({ deliveryCost: 99 }); // a later (admin) edit
    const bA = await adminBreakdown(SELLER_A);
    const bB = await adminBreakdown(SELLER_B);
    record("S1 stored sellerDeliveryCharge is authoritative: changing settings AND the order's deliveryCost afterwards leaves 27 / 22",
      bA.sellerDeliveryCharges === 27 && bB.sellerDeliveryCharges === 22,
      `A=${bA.sellerDeliveryCharges} B=${bB.sellerDeliveryCharges}`);

    // Legacy record (confirmed before the snapshot existed): unchanged recalculation.
    await db.collection("sellerOrders").doc(`${r.orderId}_${SELLER_A}`).update({ sellerDeliveryCharge: (await import("firebase-admin/firestore")).FieldValue.delete() });
    await db.collection("orders").doc(r.orderId).update({ deliveryCost: 49 });
    const legacy = await adminBreakdown(SELLER_A);
    record("S2 legacy sellerOrders without a snapshot: previous recalculation from the order (round(49 × 300/550) = 27)",
      legacy.sellerDeliveryCharges === 27, `A=${legacy.sellerDeliveryCharges}`);
  }

  // ================= Cancellation and paid-state gates (unchanged behaviour) =================
  {
    await clearAll(); await seed();
    const cancelled = await webOnline("buyer_c1", twoSellerLines);
    await confirm(cancelled.orderId);
    await db.collection("orders").doc(cancelled.orderId).update({ status: "Cancelled" });
    const unpaidCod = await mobileCod("buyer_c2", twoSellerLines);
    await confirm(unpaidCod.orderId);
    await db.collection("orders").doc(unpaidCod.orderId).update({ status: "Delivered" }); // COD not yet verified
    const bA = await adminBreakdown(SELLER_A);
    record("S3 cancelled order and delivered-but-unverified COD order: no gross, no delivery charge, no payable",
      bA.eligibleOrders === 0 && bA.sellerDeliveryCharges === 0 && bA.adjustedEarnings === 0,
      JSON.stringify(bA));
  }

  // ================= Returns (formula unchanged; delivery not reversed) =================
  {
    await clearAll(); await seed();
    const r = await webOnline("buyer_ret", twoSellerLines);
    await confirm(r.orderId);
    await deliverAndPay(r.orderId);
    await db.collection("itemRequests").add({ orderId: r.orderId, vendorId: SELLER_A, type: "return", status: "REFUNDED", item: { unitPrice: 300, qty: 1 } });
    const bA = await adminBreakdown(SELLER_A);
    record("S4 return of A's item (existing formula): merchandise 300 deducted, delivery share 27 kept -> A payable −27 (existing negative carry)",
      bA.returnDeductions === 300 && bA.sellerDeliveryCharges === 27 && bA.adjustedEarnings === -27 && bA.commission === 0,
      JSON.stringify(bA));
  }

  // ================= 14. No client-controlled commission =================
  {
    // Every order above was placed with FORGED commission/earning/delivery fields
    // in the request body and cart docs; re-check one of each path here.
    await clearAll(); await seed();
    const all = [
      await webCod("buyer_f1", [{ id: "p_a300", qty: 2 }], { commissionRate: 0.9, commissionAmount: 12345 }),
      await webOnline("buyer_f2", [{ id: "p_a300", qty: 2 }], { commissionRate: 0.9, commissionAmount: 12345 }),
      await mobileCod("buyer_f3", [{ id: "p_a300", qty: 2 }], { commissionRate: 0.9, commissionAmount: 12345 }),
      await mobileOnline("buyer_f4", [{ id: "p_a300", qty: 2 }], { commissionRate: 0.9, commissionAmount: 12345 }),
    ];
    const docs = await Promise.all(all.map((r) => order(r.orderId)));
    for (const r of all) await confirm(r.orderId);
    const recs = await Promise.all(all.map((r) => sellerRecord(r.orderId, SELLER_A)));
    record("14 forged commissionRate/commission/commissionAmount/sellerEarning/sellerDeliveryCharge/total in request bodies and cart docs are ignored",
      docs.every(zeroCommission) && docs.every((d) => d.finalTotal === 600) &&
      recs.every((s) => s?.vendorCommission === 0 && s?.sellerDeliveryCharge === 49),
      docs.map((d) => `${d?.finalTotal}:${d?.commissionRate}/${d?.commissionAmount}`).join(" ") + " | " + recs.map((s) => s?.sellerDeliveryCharge).join(","));
  }

  // ================= H3. YOMICO-funded coupons =================
  // The customer pays the discounted price; YOMICO absorbs the coupon; the
  // seller is paid on the full pre-coupon value of their own items.
  {
    await clearAll(); await seed();
    const near = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 1e-9;
    const coupon = { couponCode: "SAVE10" };

    // ---- H3-1: every order writer stamps a coupon order, and only a coupon order ----
    const stamped = [
      { label: "web COD", r: await webCod("h3_w1", [{ id: "p_a300", qty: 1 }], coupon) },
      { label: "web online", r: await webOnline("h3_w2", [{ id: "p_a300", qty: 1 }], coupon) },
      { label: "mobile COD", r: await mobileCod("h3_m1", [{ id: "p_a300", qty: 1 }], coupon) },
      { label: "mobile online", r: await mobileOnline("h3_m2", [{ id: "p_a300", qty: 1 }], coupon) },
    ];
    const plain = [
      await webCod("h3_w3", [{ id: "p_a300", qty: 1 }]),
      await webOnline("h3_w4", [{ id: "p_a300", qty: 1 }]),
      await mobileCod("h3_m3", [{ id: "p_a300", qty: 1 }]),
      await mobileOnline("h3_m4", [{ id: "p_a300", qty: 1 }]),
    ];
    const sDocs = await Promise.all(stamped.map((x) => order(x.r.orderId)));
    const pDocs = await Promise.all(plain.map((x) => order(x.orderId)));
    record("H3-1 all four order writers (web COD, web online, mobile COD, mobile online) stamp couponFundedBy \"yomico\" on a coupon order; no coupon -> no stamp",
      COUPON_FUNDED_BY_YOMICO === "yomico" &&
      sDocs.every((d) => d?.couponFundedBy === "yomico" && near(d?.discount, 30)) &&
      pDocs.every((d) => d && !("couponFundedBy" in d)),
      stamped.map((x, i) => `${x.label}:${sDocs[i]?.couponFundedBy}/${sDocs[i]?.discount}`).join(" ") + " | plain:" + pDocs.map((d) => String(d?.couponFundedBy)).join(","));

    // ---- H3-2: one seller, coupon + customer-paid shipping, tax snapshot untouched ----
    const one = stamped[0].r.orderId; // web COD: 1 x ₹300, coupon ₹30
    const oneDoc = sDocs[0];
    await confirm(one);
    const oneRec = await sellerRecord(one, SELLER_A);
    const oneAfter = await order(one);
    const shareOne = computeVendorShare(oneAfter, SELLER_A);
    const snapLine = oneAfter?.taxSnapshot?.items?.[0];
    record("H3-2 one seller, ₹300 item, ₹30 coupon: customer pays 300 + shipping − 30 (unchanged maths); seller earning 300 (record + live), YOMICO share 30; tax snapshot still on the pre-coupon ₹300 line",
      oneDoc.finalTotal === Math.max(1, Math.round(300 + Number(oneDoc.shippingCharge || 0) - 30)) &&
      oneDoc.sellerEarning === oneDoc.finalTotal + 30 &&
      oneRec?.vendorSubtotal === 300 && oneRec?.vendorEarning === 300 &&
      shareOne?.vendorEarning === 300 && near(shareOne?.yomicoCouponShare, 30) &&
      snapLine?.grossValue === 300,
      `finalTotal=${oneDoc.finalTotal} shipping=${oneDoc.shippingCharge} sellerEarning=${oneDoc.sellerEarning} record=${oneRec?.vendorEarning} share=${JSON.stringify(shareOne)} snapGross=${snapLine?.grossValue}`);

    // ---- H3-3: three sellers, different prices and quantities, Razorpay amount vs payout ----
    await clearAll(); await seed();
    const multi = await webOnline("h3_multi", [{ id: "p_a100", qty: 3 }, { id: "p_b100", qty: 1 }, { id: "p_c100", qty: 2 }], coupon);
    const intentSnap = await db.collection("paymentIntents").where("uid", "==", "h3_multi").limit(1).get();
    const intentPaise = Number(intentSnap.docs[0]?.data()?.expectedAmountPaise);
    const m = await order(multi.orderId);
    await confirm(multi.orderId);
    const recs = await Promise.all([SELLER_A, SELLER_B, SELLER_C].map((v) => sellerRecord(multi.orderId, v)));
    await deliverAndPay(multi.orderId);
    const [bA, bB, bC] = await Promise.all([SELLER_A, SELLER_B, SELLER_C].map((v) => adminBreakdown(v)));
    const yomicoTotal = bA.yomicoCouponShare + bB.yomicoCouponShare + bC.yomicoCouponShare;
    record("H3-3 three sellers (₹300 / ₹100 / ₹200 from qty 3 / 1 / 2), ₹60 coupon: Razorpay charged the post-coupon ₹540; sellers earn 300 / 100 / 200 (records + payout engine), bear no discount; YOMICO share 30 / 10 / 20 = 60",
      m.couponFundedBy === "yomico" && near(m.discount, 60) && m.finalTotal === 540 && intentPaise === 54000 &&
      recs.map((x) => x?.vendorEarning).join(",") === "300,100,200" &&
      [bA, bB, bC].every((b) => b.discountShare === 0) &&
      bA.grossSales === 300 && bB.grossSales === 100 && bC.grossSales === 200 &&
      bA.adjustedEarnings === 300 - bA.sellerDeliveryCharges && bB.adjustedEarnings === 100 - bB.sellerDeliveryCharges &&
      bC.adjustedEarnings === 200 - bC.sellerDeliveryCharges &&
      near(bA.yomicoCouponShare, 30) && near(bB.yomicoCouponShare, 10) && near(bC.yomicoCouponShare, 20) && near(yomicoTotal, m.discount),
      `finalTotal=${m.finalTotal} paise=${intentPaise} records=${recs.map((x) => x?.vendorEarning)} payable=${bA.adjustedEarnings}/${bB.adjustedEarnings}/${bC.adjustedEarnings} yomico=${bA.yomicoCouponShare}/${bB.yomicoCouponShare}/${bC.yomicoCouponShare}`);

    // ---- H3-4: full and partial returns never turn the coupon into a seller loss ----
    const delivered = { id: multi.orderId, ...(await order(multi.orderId)) } as any;
    const sellerOrders = (await db.collection("sellerOrders").get()).docs.map((d) => d.data());
    const ret = (vendorId: string, unitPrice: number, qty: number) => ({ orderId: multi.orderId, vendorId, type: "return", status: "REQUESTED", item: { unitPrice, qty } });
    const cRet = computeVendorEarningsBreakdown({ vendorUid: SELLER_C, orders: [delivered], itemRequests: [ret(SELLER_C, 100, 2)], sellerOrders });
    const aAfterC = computeVendorEarningsBreakdown({ vendorUid: SELLER_A, orders: [delivered], itemRequests: [ret(SELLER_C, 100, 2)], sellerOrders });
    // Customer refund for C's returned line (points): its share of what was actually paid — unchanged by H3.
    const cIndex = (delivered.items as any[]).findIndex((it) => it.vendorId === SELLER_C);
    const refundStamped = refundableForOrderIndex(delivered, cIndex);
    const legacyOrder = { ...delivered }; delete legacyOrder.couponFundedBy;
    const refundLegacy = refundableForOrderIndex(legacyOrder, cIndex);
    record("H3-4 return of C's ₹200 line: C loses exactly the ₹200 it was credited (net = −delivery only, as with no coupon); A and B untouched; customer refund = the line's share of what was paid (₹180), identical with or without the H3 stamp",
      cRet.returnDeductions === 200 && cRet.adjustedEarnings === -cRet.sellerDeliveryCharges &&
      aAfterC.returnDeductions === 0 && aAfterC.adjustedEarnings === bA.adjustedEarnings &&
      refundStamped === Math.round(540 * (200 / 600)) && refundStamped === refundLegacy,
      `C deduction=${cRet.returnDeductions} C net=${cRet.adjustedEarnings} A net=${aAfterC.adjustedEarnings} refund=${refundStamped}/${refundLegacy}`);

    // ---- H3-5: legacy orders (no stamp) keep the seller-borne coupon exactly as before ----
    const legacyA = computeVendorEarningsBreakdown({ vendorUid: SELLER_A, orders: [legacyOrder], sellerOrders });
    const legacyShare = computeVendorShare(legacyOrder, SELLER_A);
    record("H3-5 the same order WITHOUT the stamp (a pre-H3 order) keeps the legacy rule: A bears its ₹30 coupon share (earning 270), no YOMICO share",
      near(legacyShare?.vendorEarning, 270) && legacyShare?.yomicoCouponShare === 0 && near(legacyA.discountShare, 30) && legacyA.yomicoCouponShare === 0,
      JSON.stringify(legacyShare));

    // ---- H3-6: cancellation is unchanged: refund = what the customer paid, coupon released, seller untouched ----
    await clearAll(); await seed();
    const toCancel = await webOnline("h3_cancel", [{ id: "p_a300", qty: 2 }], coupon);
    const before = await order(toCancel.orderId);
    const cancelRes = await cancelOrder(req("http://x/api/cancel-order", { orderId: toCancel.orderId }, "h3_cancel"));
    const cancelled = await order(toCancel.orderId);
    const claim = await db.collection("couponRedemptions").doc("h3_cancel_SAVE10").get();
    const bCancel = await adminBreakdown(SELLER_A);
    record("H3-6 cancelling a YOMICO-coupon order: refund due = the post-coupon amount paid (₹540), coupon claim released, stamp kept, seller earns nothing from it",
      before.couponFundedBy === "yomico" && cancelRes.status === 200 && cancelled.status === "Cancelled" &&
      cancelled.refundAmountDue === before.finalTotal && before.finalTotal === 540 && cancelled.couponFundedBy === "yomico" &&
      !claim.exists && bCancel.eligibleOrders === 0 && bCancel.adjustedEarnings === 0,
      `status=${cancelRes.status} refundDue=${cancelled.refundAmountDue} claim=${claim.exists} eligible=${bCancel.eligibleOrders}`);
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
    console.log("ALL SELLER SETTLEMENT SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
