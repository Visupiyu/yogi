/*
 * LOCAL-ONLY emulator regression harness — money-integrity hardening
 * (L1 integer quantities, L2 mobile seller-payout compatibility, L3 mobile COD
 * paymentAmount, L4 seller price validation).
 * ---------------------------------------------------------------------------
 * Runs against the Firebase Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST is
 * injected by `firebase emulators:exec`). Never touches production Firestore,
 * never calls the real Razorpay API (`razorpay` is aliased to the fake in
 * ../mobile-variant/razorpay-fake.mjs via tsconfig.harness.json), and never
 * reads the real service-account secret (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/money-integrity/run.mts"
 */
import crypto from "node:crypto";
import assert from "node:assert/strict";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}

// ---- Test-only env, set BEFORE any app module is imported ----
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
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_local";

// ---- Fake Firebase Auth: token "test:<uid>:<email>:<emailVerified>" ----
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

// ---- App modules ----
const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { isValidOrderQuantity } = await import("../../../lib/orderQuantity.ts");
const { computeOrderPricing } = await import("../../../lib/orderPricing.ts");
const { validateSellerProductMoney } = await import("../../../lib/products/sellerProductValidation.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { POST: createProduct } = await import("../../../app/api/seller/create-product/route.ts");
const { POST: updateProduct } = await import("../../../app/api/seller/update-product/route.ts");
const { GET: sellerPayable } = await import("../../../app/api/seller/payable/route.ts");
const { computeVendorShare, normalizeOrderForEarnings } = await import("../../../lib/vendorEarnings.ts");
const { computeVendorPayable, computeVendorAdjustedEarnings } = await import("../../../lib/vendorPayable.ts");
const { readCodPaymentInfo, applyCodPaymentVerification } = await import("../../../lib/deliveryEngine/codPayment.ts");
const { control } = await import("../mobile-variant/control.mjs");

const db = getAdminDb();

// ---- Helpers ----
const BUYER = "buyer_money_1";
const SELLER = "seller_money_1";
const OTHER_SELLER = "seller_money_2";
const P_WEB = "prod_web_kettle";
const P_MOB = "prod_mob_kettle";
const P_SELL = "prod_seller_owned";

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = [
  "cart", "paymentIntents", "orders", "products", "notifications", "unmatchedPayments",
  "vendors", "settings", "coupons", "couponRedemptions", "counters", "rateLimits",
  "deliveryJobs", "codPaymentReferences", "rewardTransactions", "users",
];
async function clearAll() {
  for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name));
}

function req(url: string, body: unknown, uid = BUYER, method = "POST") {
  return new Request(url, {
    method,
    headers: { authorization: `Bearer test:${uid}:${uid}@example.com:true`, "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

async function seedSettings() {
  // Emulator-only settings: a NON-zero commission so payout math is non-trivial.
  await db.collection("settings").doc("global").set({
    commissionEnabled: true, commissionRate: 0.1,
    freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 60,
  });
}
async function seedWebProduct(stock = 5) {
  await db.collection("products").doc(P_WEB).set({
    title: "Web Kettle", sellingPrice: 599, mrp: 999, stock, sales: 0, active: true,
    vendorId: SELLER, vendorName: "Money Traders", gstRate: 18,
  });
}
async function seedMobileProduct(stock = 10) {
  await db.collection("products").doc(P_MOB).set({
    name: "Mobile Kettle", price: 1000, sellingPrice: 1000, mrp: 1500, gstPercent: 5,
    stock, sales: 0, active: true, vendorId: SELLER, vendorName: "Money Traders",
  });
}
async function seedMobileCoupon() {
  // Canonical admin coupon format (lib/coupons/couponRules.ts) — 10% off.
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true });
}
async function setCart(quantity: unknown, uid = BUYER) {
  await db.recursiveDelete(db.collection("cart"));
  await db.collection("cart").add({
    userId: uid, savedForLater: false, productId: P_MOB, quantity,
    name: "Mobile Kettle", price: 1, // client price — must be ignored
  });
}
const WEB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road, Vadodara" };
const MOB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road, Vadodara", deliverySlot: "" };
let idem = 0;
const nextKey = () => `moneykey${++idem}${Date.now()}`;

async function orderCount() { return (await db.collection("orders").get()).size; }
async function productStock(id: string) { return (await db.collection("products").doc(id).get()).data()?.stock; }

// ============================================================================
async function main() {
  await clearAll();
  await seedSettings();

  // ======================= L1 — integer quantity only =======================
  {
    const bad = [0.01, 1.5, 0, -1, NaN, Infinity, -Infinity, "2", null, undefined, 1e20];
    const badOk = bad.every((v) => !isValidOrderQuantity(v));
    const goodOk = [1, 2, 99].every((v) => isValidOrderQuantity(v));
    record("L1.u isValidOrderQuantity: rejects 0.01/1.5/0/-1/NaN/±Infinity/'2'/null/undefined/unsafe; accepts 1/2/99",
      badOk && goodOk);
  }
  {
    await seedWebProduct(5);
    const outcomes: string[] = [];
    let allRejected = true;
    for (const qty of [0.01, 1.5, 0, -2, "2", null]) {
      const r = await computeOrderPricing([{ id: P_WEB, qty: qty as any }], BUYER, null, false);
      outcomes.push(`${JSON.stringify(qty)}->${r.ok ? "OK" : (r as any).status}`);
      if (r.ok || (r as any).status !== 400) allRejected = false;
    }
    const one = await computeOrderPricing([{ id: P_WEB, qty: 1 }], BUYER, null, false);
    record("L1.p computeOrderPricing (shared by web COD+ONLINE) rejects fractional/zero/negative/string, accepts 1",
      allRejected && one.ok === true && (one as any).pricing.finalTotal === 599,
      outcomes.join(" ") + ` | qty1 finalTotal=${(one as any).pricing?.finalTotal}`);
  }

  // Test 1 — quantity 0.01 rejected (web COD route + mobile COD route)
  {
    await seedWebProduct(5);
    const res = await webPlaceOrder(req("http://x/api/place-order", {
      ...WEB_BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: nextKey(), items: [{ id: P_WEB, qty: 0.01 }],
    }));
    const j = await json(res);
    const webOk = res.status === 400 && (await orderCount()) === 0 && (await productStock(P_WEB)) === 5;

    await seedMobileProduct(10); await setCart(0.01);
    const mres = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, idempotencyKey: nextKey() }));
    const mj = await json(mres);
    const mobOk = mres.status === 400 && (await orderCount()) === 0 && (await productStock(P_MOB)) === 10;
    record("T1 quantity 0.01 -> rejected (web COD 400, mobile COD 400), no order, stock unchanged",
      webOk && mobOk, `web=${res.status} "${j.error}" | mobile=${mres.status} "${mj.error}"`);
  }

  // Test 2 — quantity 1.5 rejected (web ONLINE + mobile ONLINE: no Razorpay order, no intent)
  {
    await seedWebProduct(5);
    control.reset();
    const res = await webCreateOrder(req("http://x/api/create-order", { ...WEB_BODY, items: [{ id: P_WEB, qty: 1.5 }] }));
    const j = await json(res);
    const webRzp = control.calls.ordersCreate;

    await seedMobileProduct(10); await setCart(1.5);
    control.reset();
    const mres = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", MOB_BODY));
    const mj = await json(mres);
    const intents = (await db.collection("paymentIntents").get()).size;
    record("T2 quantity 1.5 -> rejected (web ONLINE 400, mobile ONLINE 400), no Razorpay order, no paymentIntent",
      res.status === 400 && webRzp === 0 && mres.status === 400 && control.calls.ordersCreate === 0 && intents === 0,
      `web=${res.status} "${j.error}" rzp=${webRzp} | mobile=${mres.status} "${mj.error}" rzp=${control.calls.ordersCreate} intents=${intents}`);
  }

  // Test 3 — quantity 1 accepted (web COD + mobile COD)
  {
    await clearAll(); await seedSettings(); await seedWebProduct(5);
    const res = await webPlaceOrder(req("http://x/api/place-order", {
      ...WEB_BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: nextKey(), items: [{ id: P_WEB, qty: 1 }],
    }));
    const j = await json(res);
    const webOrder = j.orderId ? (await db.collection("orders").doc(j.orderId).get()).data() as any : null;

    await seedMobileProduct(10); await setCart(1);
    const mres = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, idempotencyKey: nextKey() }));
    const mj = await json(mres);
    record("T3 quantity 1 -> accepted (web COD 200 qty 1 price 599; mobile COD 200)",
      res.status === 200 && webOrder?.items?.[0]?.qty === 1 && webOrder?.items?.[0]?.price === 599 &&
      (await productStock(P_WEB)) === 4 && mres.status === 200 && (await productStock(P_MOB)) === 9,
      `web=${res.status} qty=${webOrder?.items?.[0]?.qty} | mobile=${mres.status} total=${mj.total}`);
  }

  // Test 4 — quantity above stock rejected (web COD + mobile COD + mobile ONLINE)
  {
    await clearAll(); await seedSettings(); await seedWebProduct(3);
    const res = await webPlaceOrder(req("http://x/api/place-order", {
      ...WEB_BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: nextKey(), items: [{ id: P_WEB, qty: 4 }],
    }));
    await seedMobileProduct(3); await setCart(4);
    const mres = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, idempotencyKey: nextKey() }));
    control.reset();
    const ores = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", MOB_BODY));
    record("T4 quantity above stock -> rejected (web COD, mobile COD, mobile ONLINE), no order, stock unchanged",
      res.status >= 400 && mres.status === 409 && ores.status === 409 && control.calls.ordersCreate === 0 &&
      (await orderCount()) === 0 && (await productStock(P_WEB)) === 3 && (await productStock(P_MOB)) === 3,
      `web=${res.status} mobileCOD=${mres.status} mobileONLINE=${ores.status}`);
  }

  // ======================= L4 — seller price validation =======================
  const VALID_PRODUCT = {
    title: "Seller Lamp", description: "d", brand: "b", categoryId: "c", sellingPrice: 499, mrp: 799,
    stock: 7, gstRate: 12, thumbnail: "t", images: ["t"], slug: "seller-lamp",
    variants: [
      { id: "v_red", attributes: { Color: "Red" }, stock: 4, price: 0 },
      { id: "v_blue", attributes: { Color: "Blue" }, stock: 3, price: 549 },
    ],
  };
  {
    const cases: [string, Record<string, unknown>][] = [
      ["negative sellingPrice", { ...VALID_PRODUCT, sellingPrice: -10 }],
      ["zero sellingPrice", { ...VALID_PRODUCT, sellingPrice: 0 }],
      ["string sellingPrice", { ...VALID_PRODUCT, sellingPrice: "499" }],
      ["null sellingPrice", { ...VALID_PRODUCT, sellingPrice: null }],
      ["Infinity sellingPrice", { ...VALID_PRODUCT, sellingPrice: Infinity }],
      ["negative legacy price", { ...VALID_PRODUCT, price: -1 }],
      ["variant price -1", { ...VALID_PRODUCT, variants: [{ id: "v", attributes: {}, stock: 1, price: -1 }] }],
      ["variant price NaN", { ...VALID_PRODUCT, variants: [{ id: "v", attributes: {}, stock: 1, price: NaN }] }],
      ["variant price string", { ...VALID_PRODUCT, variants: [{ id: "v", attributes: {}, stock: 1, price: "5" }] }],
      ["variant stock 1.5", { ...VALID_PRODUCT, variants: [{ id: "v", attributes: {}, stock: 1.5, price: 0 }] }],
      ["product stock 2.5", { ...VALID_PRODUCT, stock: 2.5 }],
      ["negative stock", { ...VALID_PRODUCT, stock: -1 }],
      ["gstRate 7", { ...VALID_PRODUCT, gstRate: 7 }],
      ["missing gstRate", { ...VALID_PRODUCT, gstRate: undefined }],
      ["gstPercent 3", { ...VALID_PRODUCT, gstPercent: 3 }],
    ];
    const wrong = cases.filter(([, p]) => validateSellerProductMoney(p).ok).map(([n]) => n);
    const valid = validateSellerProductMoney(VALID_PRODUCT);
    record("L4.u validator rejects every invalid money/stock/GST value and accepts a valid product",
      wrong.length === 0 && valid.ok === true, wrong.length ? `ACCEPTED: ${wrong.join(", ")}` : `${cases.length} invalid cases rejected`);
  }

  await clearAll(); await seedSettings();
  await db.collection("vendors").add({ uid: SELLER, status: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } });
  await db.collection("vendors").add({ uid: OTHER_SELLER, status: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } });

  // Test 5 — negative seller price rejected (create + update)
  {
    const c = await createProduct(req("http://x/api/seller/create-product", { product: { ...VALID_PRODUCT, sellingPrice: -500 } }, SELLER));
    const cj = await json(c);
    const created = (await db.collection("products").get()).size;
    await db.collection("products").doc(P_SELL).set({ ...VALID_PRODUCT, vendorId: SELLER, sales: 3, approved: false, active: true });
    const u = await updateProduct(req("http://x/api/seller/update-product", { productId: P_SELL, product: { ...VALID_PRODUCT, sellingPrice: -5 } }, SELLER));
    const uj = await json(u);
    const stored = (await db.collection("products").doc(P_SELL).get()).data() as any;
    record("T5 negative seller price -> rejected on create (400, nothing written) and update (400, unchanged)",
      c.status === 400 && created === 0 && u.status === 400 && stored.sellingPrice === 499,
      `create=${c.status} "${cj.error}" | update=${u.status} "${uj.error}" storedPrice=${stored.sellingPrice}`);
  }

  // Test 6 — invalid variant price rejected
  {
    const bad = { ...VALID_PRODUCT, variants: [{ id: "v_red", attributes: { Color: "Red" }, stock: 4, price: -20 }] };
    const c = await createProduct(req("http://x/api/seller/create-product", { product: bad }, SELLER));
    const u = await updateProduct(req("http://x/api/seller/update-product", { productId: P_SELL, product: bad }, SELLER));
    const stored = (await db.collection("products").doc(P_SELL).get()).data() as any;
    record("T6 invalid variant price -> rejected on create and update, stored variants unchanged",
      c.status === 400 && u.status === 400 && stored.variants?.[1]?.price === 549 && stored.variants?.[0]?.price === 0,
      `create=${c.status} update=${u.status}`);
  }

  // Test 7 — fractional variant stock rejected
  {
    const bad = { ...VALID_PRODUCT, variants: [{ id: "v_red", attributes: { Color: "Red" }, stock: 1.5, price: 0 }] };
    const c = await createProduct(req("http://x/api/seller/create-product", { product: bad }, SELLER));
    const u = await updateProduct(req("http://x/api/seller/update-product", { productId: P_SELL, product: bad }, SELLER));
    const stored = (await db.collection("products").doc(P_SELL).get()).data() as any;
    record("T7 fractional variant stock -> rejected on create and update",
      c.status === 400 && u.status === 400 && stored.variants?.[0]?.stock === 4,
      `create=${c.status} update=${u.status}`);
  }

  // Test 8 — valid product accepted (create + update), server-owned fields ignored, other seller refused
  {
    const c = await createProduct(req("http://x/api/seller/create-product", { product: VALID_PRODUCT }, SELLER));
    const cj = await json(c);
    const createdDoc = cj.productId ? (await db.collection("products").doc(cj.productId).get()).data() as any : null;

    const u = await updateProduct(req("http://x/api/seller/update-product", {
      productId: P_SELL,
      product: { ...VALID_PRODUCT, sellingPrice: 450, sales: 999, approved: true, vendorId: OTHER_SELLER },
    }, SELLER));
    const stored = (await db.collection("products").doc(P_SELL).get()).data() as any;

    const other = await updateProduct(req("http://x/api/seller/update-product", { productId: P_SELL, product: { ...VALID_PRODUCT, sellingPrice: 1 } }, OTHER_SELLER));
    const afterOther = (await db.collection("products").doc(P_SELL).get()).data() as any;
    record("T8 valid product -> accepted (create 200, update 200); sales/approved/vendorId not client-writable; other seller 403",
      c.status === 200 && createdDoc?.sellingPrice === 499 && createdDoc?.vendorId === SELLER &&
      u.status === 200 && stored.sellingPrice === 450 && stored.sales === 3 && stored.approved === false && stored.vendorId === SELLER &&
      other.status === 403 && afterOther.sellingPrice === 450,
      `create=${c.status} update=${u.status} price=${stored.sellingPrice} sales=${stored.sales} approved=${stored.approved} other=${other.status}`);
  }

  // ============ L3 + L2 — new mobile COD order: paymentAmount + payout fields ============
  await clearAll(); await seedSettings(); await seedMobileProduct(10); await seedMobileCoupon();
  await setCart(2);
  const codRes = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, couponCode: "save10", idempotencyKey: nextKey() }));
  const codJson = await json(codRes);
  const codRef = db.collection("orders").doc(codJson.orderId || "missing");
  const cod = (await codRef.get()).data() as any;
  // Hand-computed expectation: 2 x ₹1000 = 2000; free shipping (>= 499);
  // GST 5% = 100; coupon 10% of 2000 = 200; amount due = 2000 + 0 + 100 - 200.
  const EXPECTED_DUE = 1900;

  // Test 9 — paymentAmount equals the authoritative total/finalTotal
  record("T9 mobile COD paymentAmount == authoritative finalTotal == total (1900, incl. GST 100, coupon -200)",
    codRes.status === 200 && cod?.paymentAmount === EXPECTED_DUE && cod?.finalTotal === EXPECTED_DUE &&
    cod?.total === EXPECTED_DUE && cod?.gstAmount === 100 && cod?.discountAmount === 200 && cod?.paymentMethod === "PAY_ON_DELIVERY_UPI",
    `status=${codRes.status} paymentAmount=${cod?.paymentAmount} finalTotal=${cod?.finalTotal} total=${cod?.total}`);

  // Test 9b — the rider-side COD engine now shows and accepts the real non-zero amount
  {
    await db.collection("deliveryJobs").doc("job_money_1").set({
      orderId: codRef.id, assignedPersonId: "person_rider_1", currentLegId: "leg1",
      status: "OutForDelivery", providerType: "YOMICO", vendorId: SELLER, sellerOrderId: "so_money_1",
    });
    await db.collection("deliveryJobs").doc("job_money_1").collection("legs").doc("leg1").set({
      type: "FinalMile", custody: { personId: "person_rider_1" },
    });
    const job = (await db.collection("deliveryJobs").doc("job_money_1").get()).data() as any;
    const info = await readCodPaymentInfo(db as any, "job_money_1", job, "person_rider_1");
    const actor = { uid: "rider_uid_1", personId: "person_rider_1", name: "Rider" };
    let wrongRejected = false;
    try {
      await db.runTransaction((tx) => applyCodPaymentVerification(tx as any, db as any, { jobId: "job_money_1", actor, reference: "UPIREF123", clientAmount: 0 }));
    } catch (e: any) { wrongRejected = e?.status === 409; }
    const ok = await db.runTransaction((tx) => applyCodPaymentVerification(tx as any, db as any, { jobId: "job_money_1", actor, reference: "UPIREF123", clientAmount: EXPECTED_DUE }));
    const after = (await codRef.get()).data() as any;
    record("T9b delivery COD engine: amountDue 1900 shown to rider, ₹0 rejected, correct non-zero amount accepted",
      info.isCod && info.amountDue === EXPECTED_DUE && info.canVerify && wrongRejected &&
      ok.ok && ok.amount === EXPECTED_DUE && after.paymentStatus === "AwaitingVerification",
      `amountDue=${info.amountDue} canVerify=${info.canVerify} zeroRejected=${wrongRejected} accepted=${ok.status} orderPaymentStatus=${after.paymentStatus}`);
  }

  // Test 10 — new mobile orders carry payout-compatible fields (COD and ONLINE)
  let onlineOrder: any = null;
  {
    // A second customer: SAVE10 is one-use-per-customer (lib/coupons), and
    // BUYER already redeemed it on the T9 COD order above.
    const BUYER_ONLINE = "buyer_money_online";
    await seedMobileProduct(10); await setCart(2, BUYER_ONLINE);
    control.reset();
    const cpo = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", { ...MOB_BODY, couponCode: "SAVE10" }, BUYER_ONLINE));
    const cpoJson = await json(cpo);
    const intent = (await db.collection("paymentIntents").doc(cpoJson.razorpayOrderId || "missing").get()).data() as any;
    const fin = await finalizeMobileOnlineOrder({
      razorpayPaymentId: "pay_money_1", razorpayOrderId: cpoJson.razorpayOrderId, intent,
      capturedAmountPaise: intent?.expectedAmountPaise, source: "mobile-app",
    });
    onlineOrder = (await db.collection("orders").doc("pay_money_1").get()).data();

    // Intent created before this change (no commissionRate) -> current configured rate, never legacy 10%-by-absence
    const legacyIntent = { ...intent, commissionRate: undefined, razorpayOrderId: "order_legacy_1" };
    delete legacyIntent.commissionRate;
    await seedMobileProduct(10);
    await finalizeMobileOnlineOrder({ razorpayPaymentId: "pay_money_legacy", razorpayOrderId: "order_legacy_1", intent: legacyIntent, capturedAmountPaise: intent?.expectedAmountPaise, source: "webhook" });
    const legacyOrder = (await db.collection("orders").doc("pay_money_legacy").get()).data() as any;

    const codFields = cod?.items?.[0]?.qty === 2 && cod?.items?.[0]?.quantity === 2 && cod?.items?.[0]?.price === 1000 &&
      cod?.itemsSubtotal === 2000 && cod?.discount === 200 && cod?.commissionRate === 0.1 && cod?.vendorIds?.[0] === SELLER;
    const onlineFields = fin.kind === "created" && onlineOrder?.items?.[0]?.qty === 2 && onlineOrder?.items?.[0]?.quantity === 2 &&
      onlineOrder?.itemsSubtotal === 2000 && onlineOrder?.discount === 200 && onlineOrder?.commissionRate === 0.1 &&
      onlineOrder?.finalTotal === 1900 && onlineOrder?.paymentStatus === "Paid" && !("paymentAmount" in onlineOrder);
    record("T10 new mobile orders carry payout fields: items[].qty (+quantity), itemsSubtotal, discount, commissionRate; ONLINE has no paymentAmount",
      codFields && onlineFields && intent?.commissionRate === 0.1 && legacyOrder?.commissionRate === 0.1,
      `COD qty=${cod?.items?.[0]?.qty} itemsSubtotal=${cod?.itemsSubtotal} discount=${cod?.discount} rate=${cod?.commissionRate} | ONLINE qty=${onlineOrder?.items?.[0]?.qty} rate=${onlineOrder?.commissionRate} paymentAmount=${onlineOrder?.paymentAmount} | legacy-intent rate=${legacyOrder?.commissionRate}`);
  }

  // Test 11 — seller payout for a new mobile order is non-zero and matches the hand calculation
  {
    // Only the COD order should count: mark it Delivered + Paid; remove the two online orders from this test.
    await db.collection("orders").doc("pay_money_1").delete();
    await db.collection("orders").doc("pay_money_legacy").delete();
    await codRef.update({ status: "Delivered", paymentStatus: "Paid" });
    // Hand calc: raw 2000; coupon share 200 x 2000/2000 = 200 -> net 1800;
    // commission round(1800 x 0.1) = 180 -> earning 1620; seller bears the
    // forward delivery cost on a free-delivery order: round(60 x 2000/2000) = 60.
    const EXPECTED_PAYABLE = 1800 - 180 - 60; // 1560
    const res = await sellerPayable(req("http://x/api/seller/payable", null, SELLER, "GET"));
    const pj = await json(res);
    const share = computeVendorShare({ ...(await codRef.get()).data() } as any, SELLER);
    // Same order shape as BEFORE this change (no qty/itemsSubtotal/discount/commissionRate):
    const old = { ...(await codRef.get()).data() } as any;
    old.items = old.items.map(({ qty, ...rest }: any) => rest);
    delete old.itemsSubtotal; delete old.discount; delete old.commissionRate;
    const oldShare = computeVendorShare(old, SELLER);
    record("T11 seller payable for new mobile order is non-zero and exact (1560 = 1800 - 180 commission - 60 delivery); pre-fix shape still 0",
      res.status === 200 && pj.payable === EXPECTED_PAYABLE && share?.vendorEarning === 1620 && oldShare?.vendorEarning === 0,
      `route payable=${pj.payable} vendorEarning=${share?.vendorEarning} preFixShapeEarning=${oldShare?.vendorEarning}`);
  }

  // Test 12 — admin payout and seller payout use the same underlying seller-earnings result
  {
    const order = { id: codRef.id, ...(await codRef.get()).data() } as any;
    const sellerShare = computeVendorShare(order, SELLER);
    const adminDashboardShare = computeVendorShare(normalizeOrderForEarnings(order) as any, SELLER);
    const adminPayoutsEarned = computeVendorAdjustedEarnings({ vendorUid: SELLER, orders: [order] });
    const sellerPayableCalc = computeVendorPayable({ vendorUid: SELLER, orders: [order], payouts: [], withdrawals: [] });
    let sameShare = true;
    try { assert.deepEqual(adminDashboardShare, sellerShare); } catch { sameShare = false; }
    record("T12 admin dashboard share == seller share; admin payouts earned == seller payable (no commitments)",
      sameShare && adminPayoutsEarned === sellerPayableCalc && sellerPayableCalc === 1560,
      `sellerShare=${JSON.stringify(sellerShare)} adminShare=${JSON.stringify(adminDashboardShare)} adminEarned=${adminPayoutsEarned} sellerPayable=${sellerPayableCalc}`);
  }

  // Web-order payout basis unchanged by orderItemsSubtotalBasis (web `total` IS the subtotal)
  {
    const webOrder = { items: [{ vendorId: SELLER, price: 599, qty: 2 }], total: 1198, discount: 119.8, rewardValue: 0, commissionRate: 0, finalTotal: 1078 };
    const s = computeVendorShare(webOrder as any, SELLER);
    record("R1 web-order vendor share unchanged (no itemsSubtotal -> uses total)",
      s?.vendorRawSubtotal === 1198 && Math.abs((s?.vendorNetSubtotal ?? 0) - 1078.2) < 1e-9 && s?.vendorCommission === 0,
      JSON.stringify(s));
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
    console.log("ALL MONEY-INTEGRITY SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
