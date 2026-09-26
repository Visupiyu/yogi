/*
 * LOCAL-ONLY emulator regression harness — web/mobile pricing parity
 * (lib/pricing/priceRules.ts): one base-price rule, GST-inclusive prices,
 * one rounded payable-total rule.
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
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/pricing/run.mts"
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
const { productBasePrice, payableTotal } = await import("../../../lib/pricing/priceRules.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { POST: updateProduct } = await import("../../../app/api/seller/update-product/route.ts");
const { computeVendorShare } = await import("../../../lib/vendorEarnings.ts");
const { readCodPaymentInfo, applyCodPaymentVerification } = await import("../../../lib/deliveryEngine/codPayment.ts");
const { control } = await import("../mobile-variant/control.mjs");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const near = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 1e-9;

const COLLECTIONS = ["products", "orders", "cart", "paymentIntents", "coupons", "couponRedemptions", "counters",
  "rateLimits", "settings", "notifications", "users", "rewardTransactions", "deliveryJobs", "unmatchedPayments",
  "codPaymentReferences"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

function req(url: string, body: unknown, uid: string) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${uid}@example.com:true`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

const SELLER = "seller_pricing_1";
const MOB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road", deliverySlot: "" };
const WEB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };
let seq = 0;
const nextKey = () => `prckey${++seq}${Date.now()}`;
// A fresh customer per order, so the one-use coupon never interferes.
const buyer = (tag: string) => `buyer_${tag}_${++seq}`;

const base = { stock: 1000, sales: 0, active: true, vendorId: SELLER, vendorName: "Pricing Traders", mrp: 2000 };
const PRODUCTS: Record<string, Record<string, unknown>> = {
  // Both fields present and different (the audit's parity scenario).
  p_both: { ...base, name: "Both Fields", price: 500, sellingPrice: 450, gstRate: 5 },
  // Legacy product with only `price`.
  p_price_only: { ...base, name: "Price Only", price: 300, gstRate: 5 },
  // Non-positive sellingPrice with a valid legacy price.
  p_bad_selling: { ...base, name: "Bad Selling", price: 350, sellingPrice: 0, gstRate: 5 },
  // Stale-price scenario: listed at 500 (both fields), then the seller edits sellingPrice to 450.
  p_stale: { ...base, name: "Stale Kettle", title: "Stale Kettle", price: 500, sellingPrice: 500, gstRate: 5 },
  // Variants on a both-fields product: own price, and a 0 (= use base) price.
  p_var: {
    ...base, name: "Variant Shirt", price: 500, sellingPrice: 450, gstRate: 5,
    variants: [
      { id: "v_own", attributes: { Size: "L" }, stock: 50, price: 700 },
      { id: "v_base", attributes: { Size: "M" }, stock: 50, price: 0 },
    ],
  },
  // GST-inclusive model.
  p_gst_rate: { ...base, name: "GST Rate Only", sellingPrice: 1000, gstRate: 18 },
  p_gst_percent: { ...base, name: "GST Percent", sellingPrice: 1000, gstRate: 18, gstPercent: 18 },
  // Rounding.
  p_999: { ...base, name: "Odd 999", sellingPrice: 999, gstRate: 5 },
  p_995: { ...base, name: "Half 995", sellingPrice: 995, gstRate: 5 },
  p_333: { ...base, name: "Small 333", sellingPrice: 333, gstRate: 5 },
  p_1000: { ...base, name: "Whole 1000", sellingPrice: 1000, gstRate: 5 },
};

async function seed() {
  await db.collection("settings").doc("global").set({
    commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49,
  });
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true });
  for (const [id, data] of Object.entries(PRODUCTS)) await db.collection("products").doc(id).set(data);
}

type Line = { productId: string; qty: number; variantId?: string };
type Opts = { coupon?: string };

async function webCod(line: Line, opts: Opts = {}) {
  const uid = buyer("webcod");
  const res = await webPlaceOrder(req("http://x/api/place-order", {
    ...WEB_BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: nextKey(),
    items: [{ id: line.productId, qty: line.qty, ...(line.variantId ? { variantId: line.variantId } : {}) }],
    ...(opts.coupon ? { couponCode: opts.coupon } : {}),
  }, uid));
  const j = await json(res);
  const order = j.orderId ? (await db.collection("orders").doc(j.orderId).get()).data() as any : null;
  return { status: res.status, error: j.error, order, payable: order?.paymentAmount, unit: order?.items?.[0]?.price };
}
async function webOnline(line: Line, opts: Opts = {}) {
  const uid = buyer("webonl");
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", {
    ...WEB_BODY,
    items: [{ id: line.productId, qty: line.qty, ...(line.variantId ? { variantId: line.variantId } : {}) }],
    ...(opts.coupon ? { couponCode: opts.coupon } : {}),
  }, uid));
  const j = await json(res);
  const intent = j.id ? (await db.collection("paymentIntents").doc(j.id).get()).data() as any : null;
  return { status: res.status, error: j.error, payable: typeof j.amount === "number" ? j.amount / 100 : undefined, unit: intent?.pricing?.items?.[0]?.price, intent };
}
async function setMobileCart(uid: string, line: Line) {
  await db.collection("cart").add({
    userId: uid, savedForLater: false, productId: line.productId, quantity: line.qty,
    name: "client name", price: 1, // client price — must be ignored
    ...(line.variantId ? { variantId: line.variantId } : {}),
  });
}
async function mobileCod(line: Line, opts: Opts = {}) {
  const uid = buyer("mobcod");
  await setMobileCart(uid, line);
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", {
    ...MOB_BODY, idempotencyKey: nextKey(), ...(opts.coupon ? { couponCode: opts.coupon } : {}),
    discountAmount: 999999, gstAmount: 999999, total: 1, // client money fields — must be ignored
  }, uid));
  const j = await json(res);
  const order = j.orderId ? (await db.collection("orders").doc(j.orderId).get()).data() as any : null;
  return { status: res.status, error: j.error, orderId: j.orderId as string, order, payable: order?.paymentAmount, unit: order?.items?.[0]?.price, responseTotal: j.total };
}
async function mobileOnline(line: Line, opts: Opts = {}, finalize = false) {
  const uid = buyer("mobonl");
  await setMobileCart(uid, line);
  control.reset();
  const res = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", {
    ...MOB_BODY, ...(opts.coupon ? { couponCode: opts.coupon } : {}),
  }, uid));
  const j = await json(res);
  const intent = j.razorpayOrderId ? (await db.collection("paymentIntents").doc(j.razorpayOrderId).get()).data() as any : null;
  let order: any = null;
  if (finalize && intent) {
    const paymentId = `pay_${uid}`;
    await finalizeMobileOnlineOrder({ razorpayPaymentId: paymentId, razorpayOrderId: j.razorpayOrderId, intent, capturedAmountPaise: intent.expectedAmountPaise, source: "mobile-app" });
    order = (await db.collection("orders").doc(paymentId).get()).data();
  }
  return { status: res.status, error: j.error, payable: typeof j.amount === "number" ? j.amount / 100 : undefined, unit: intent?.items?.[0]?.price, intent, order };
}
async function allPaths(line: Line, opts: Opts = {}) {
  const [web, webOnl, cod, onl] = [await webCod(line, opts), await webOnline(line, opts), await mobileCod(line, opts), await mobileOnline(line, opts)];
  return { web, webOnl, cod, onl };
}
const fmt = (r: Awaited<ReturnType<typeof allPaths>>) =>
  `webCOD=${r.web.status}/${r.web.unit}/${r.web.payable} webONLINE=${r.webOnl.status}/${r.webOnl.unit}/${r.webOnl.payable} ` +
  `mobCOD=${r.cod.status}/${r.cod.unit}/${r.cod.payable} mobONLINE=${r.onl.status}/${r.onl.unit}/${r.onl.payable}`;
const allUnits = (r: Awaited<ReturnType<typeof allPaths>>, unit: number) =>
  r.web.status === 200 && r.webOnl.status === 200 && r.cod.status === 200 && r.onl.status === 200 &&
  r.web.unit === unit && r.webOnl.unit === unit && r.cod.unit === unit && r.onl.unit === unit;
const allPayable = (r: Awaited<ReturnType<typeof allPaths>>, payable: number) =>
  r.web.payable === payable && r.webOnl.payable === payable && r.cod.payable === payable && r.onl.payable === payable;

async function main() {
  await clearAll();
  await seed();

  // ============ Pure helper ============
  {
    const cases: [string, boolean][] = [
      ["sellingPrice wins over price", productBasePrice({ sellingPrice: 450, price: 500 }) === 450],
      ["price when sellingPrice missing", productBasePrice({ price: 300 }) === 300],
      ["price when sellingPrice 0", productBasePrice({ sellingPrice: 0, price: 350 }) === 350],
      ["price when sellingPrice negative", productBasePrice({ sellingPrice: -5, price: 350 }) === 350],
      ["price when sellingPrice is a string", productBasePrice({ sellingPrice: "450", price: 350 }) === 350],
      ["price when sellingPrice NaN/Infinity", productBasePrice({ sellingPrice: NaN, price: 350 }) === 350 && productBasePrice({ sellingPrice: Infinity, price: 350 }) === 350],
      ["0 when neither is usable", productBasePrice({}) === 0 && productBasePrice({ sellingPrice: 0, price: -1 }) === 0 && productBasePrice(null) === 0],
      ["payableTotal whole rupee unchanged", payableTotal(2000) === 2000],
      ["payableTotal 899.1 -> 899", payableTotal(899.1) === 899],
      ["payableTotal 895.5 -> 896 (Math.round)", payableTotal(895.5) === 896],
      ["payableTotal minimum 1", payableTotal(0) === 1 && payableTotal(-3) === 1 && payableTotal(0.4) === 1],
    ];
    const failed = cases.filter(([, ok]) => !ok).map(([n]) => n);
    record(`H  priceRules helpers: ${cases.length} cases`, failed.length === 0, failed.length ? `FAILED: ${failed.join(" | ")}` : "all pass");
  }

  // ============ A. Base-price parity ============
  {
    const r = await allPaths({ productId: "p_both", qty: 1 });
    record("A1 price=500, sellingPrice=450 -> 450 on web COD, web ONLINE, mobile COD, mobile ONLINE", allUnits(r, 450) && allPayable(r, 450 + 49), fmt(r));
  }
  {
    const r = await allPaths({ productId: "p_price_only", qty: 2 });
    record("A2 only price=300 present -> fallback 300 on every path", allUnits(r, 300) && allPayable(r, 600), fmt(r));
  }
  {
    const r = await allPaths({ productId: "p_bad_selling", qty: 2 });
    record("A3 sellingPrice=0 with valid price=350 -> fallback 350 on every path", allUnits(r, 350) && allPayable(r, 700), fmt(r));
  }

  // ============ B. Stale price after a seller edit ============
  {
    const upd = await updateProduct(req("http://x/api/seller/update-product", { productId: "p_stale", product: { sellingPrice: 450 } }, SELLER));
    const stored = (await db.collection("products").doc("p_stale").get()).data() as any;
    const r = await allPaths({ productId: "p_stale", qty: 2 });
    record("B4 seller edits sellingPrice 500 -> 450 (legacy price 500 stays stored); every order path charges 450",
      upd.status === 200 && stored.price === 500 && stored.sellingPrice === 450 && allUnits(r, 450) && allPayable(r, 900),
      `update=${upd.status} stored price=${stored.price} sellingPrice=${stored.sellingPrice} | ${fmt(r)}`);
  }

  // ============ C. Variants ============
  {
    const r = await allPaths({ productId: "p_var", qty: 1, variantId: "v_own" });
    record("C5 variant with own price 700 -> 700 on every path (unchanged)", allUnits(r, 700) && allPayable(r, 700), fmt(r));
  }
  {
    const r = await allPaths({ productId: "p_var", qty: 2, variantId: "v_base" });
    record("C6 variant price 0 -> shared base price 450 (sellingPrice, not legacy 500) on every path", allUnits(r, 450) && allPayable(r, 900), fmt(r));
  }

  // ============ D. GST-inclusive model ============
  {
    const cod = await mobileCod({ productId: "p_gst_rate", qty: 1 });
    const onl = await mobileOnline({ productId: "p_gst_rate", qty: 1 });
    const web = await webCod({ productId: "p_gst_rate", qty: 1 });
    record("D7 gstRate=18, no gstPercent: mobile COD and ONLINE charge 1000 (no 18% on top), same as web",
      cod.status === 200 && cod.payable === 1000 && cod.order?.total === 1000 && onl.payable === 1000 && web.payable === 1000,
      `mobCOD=${cod.payable} mobONLINE=${onl.payable} web=${web.payable}`);
  }
  let gstCod: any = null;
  let gstOnl: any = null;
  {
    gstCod = await mobileCod({ productId: "p_gst_percent", qty: 1 });
    gstOnl = await mobileOnline({ productId: "p_gst_percent", qty: 1 }, {}, true);
    record("D8 legacy gstPercent=18 on the product: mobile still charges 1000, not 1180 (COD and ONLINE)",
      gstCod.status === 200 && gstCod.payable === 1000 && gstCod.order?.finalTotal === 1000 && gstOnl.payable === 1000 && gstOnl.order?.finalTotal === 1000,
      `mobCOD=${gstCod.payable} finalTotal=${gstCod.order?.finalTotal} mobONLINE=${gstOnl.payable} finalized=${gstOnl.order?.finalTotal}`);
  }
  {
    const codShare = computeVendorShare(gstCod.order, SELLER);
    const onlShare = computeVendorShare(gstOnl.order, SELLER);
    record("D9 gstAmount stored as 0 (COD order, ONLINE intent + order); seller share = 1000 line value (no GST added or removed)",
      gstCod.order?.gstAmount === 0 && gstOnl.intent?.gstAmount === 0 && gstOnl.order?.gstAmount === 0 &&
      gstCod.order?.itemsSubtotal === 1000 && codShare?.vendorRawSubtotal === 1000 && codShare?.vendorEarning === 1000 &&
      onlShare?.vendorEarning === 1000,
      `codGst=${gstCod.order?.gstAmount} intentGst=${gstOnl.intent?.gstAmount} onlineGst=${gstOnl.order?.gstAmount} codShare=${codShare?.vendorEarning} onlineShare=${onlShare?.vendorEarning}`);
  }

  // ============ E. COD rounding ============
  {
    const r = await allPaths({ productId: "p_1000", qty: 2 });
    record("E10 whole-rupee total unchanged: 2 x 1000 = 2000 on every path", allPayable(r, 2000), fmt(r));
  }
  let frac: Awaited<ReturnType<typeof allPaths>>;
  {
    frac = await allPaths({ productId: "p_999", qty: 1 }, { coupon: "SAVE10" });
    record("E11 999 with 10% coupon (raw 899.10) -> 899 on web COD, web ONLINE, mobile COD, mobile ONLINE", allPayable(frac, 899), fmt(frac));
    const o = frac.cod.order;
    record("E12 mobile COD paymentAmount == total == finalTotal == response total == 899 (not 899.1)",
      o?.paymentAmount === 899 && o?.total === 899 && o?.finalTotal === 899 && frac.cod.responseTotal === 899,
      `paymentAmount=${o?.paymentAmount} total=${o?.total} finalTotal=${o?.finalTotal} response=${frac.cod.responseTotal}`);
  }
  {
    const orderId = frac.cod.orderId;
    await db.collection("deliveryJobs").doc("job_prc_1").set({
      orderId, assignedPersonId: "person_rider_1", currentLegId: "leg1",
      status: "OutForDelivery", providerType: "YOMICO", vendorId: SELLER, sellerOrderId: "so_prc_1",
    });
    await db.collection("deliveryJobs").doc("job_prc_1").collection("legs").doc("leg1").set({ type: "FinalMile", custody: { personId: "person_rider_1" } });
    const job = (await db.collection("deliveryJobs").doc("job_prc_1").get()).data() as any;
    const info = await readCodPaymentInfo(db as any, "job_prc_1", job, "person_rider_1");
    const actor = { uid: "rider_uid_1", personId: "person_rider_1", name: "Rider" };
    let unroundedRejected = false;
    try {
      await db.runTransaction((tx) => applyCodPaymentVerification(tx as any, db as any, { jobId: "job_prc_1", actor, reference: "UPIPRC1", clientAmount: 899.1 }));
    } catch (e: any) { unroundedRejected = e?.status === 409; }
    const ok = await db.runTransaction((tx) => applyCodPaymentVerification(tx as any, db as any, { jobId: "job_prc_1", actor, reference: "UPIPRC1", clientAmount: 899 }));
    record("E13 rider COD engine: amountDue 899 == paymentAmount; paying 899 accepted, 899.10 rejected",
      info.isCod && info.amountDue === 899 && info.amountDue === frac.cod.order?.paymentAmount && unroundedRejected && ok.ok && ok.amount === 899,
      `amountDue=${info.amountDue} unroundedRejected=${unroundedRejected} accepted=${ok.ok}`);
  }
  {
    const o = frac.cod.order;
    const share = computeVendorShare(o, SELLER);
    record("E14 seller basis stays unrounded: itemsSubtotal 999, discount 99.90, vendor net/earning 899.10 (not 899)",
      o?.itemsSubtotal === 999 && near(o?.discount, 99.9) && near(share?.vendorNetSubtotal, 899.1) && near(share?.vendorEarning, 899.1),
      `itemsSubtotal=${o?.itemsSubtotal} discount=${o?.discount} net=${share?.vendorNetSubtotal} earning=${share?.vendorEarning}`);
  }

  // ============ F. Cross-path parity ============
  {
    const scenarios: [string, Line, Opts, number][] = [
      ["995 + 10% (raw 895.50)", { productId: "p_995", qty: 1 }, { coupon: "SAVE10" }, 896],
      ["333 + 10% + ₹49 shipping (raw 348.70)", { productId: "p_333", qty: 1 }, { coupon: "SAVE10" }, 349],
      ["stale product x3 + 10% (1350 - 135)", { productId: "p_stale", qty: 3 }, { coupon: "SAVE10" }, 1215],
      ["gstPercent product x1 + 10%", { productId: "p_gst_percent", qty: 1 }, { coupon: "SAVE10" }, 900],
      ["variant base-price x3", { productId: "p_var", qty: 3, variantId: "v_base" }, {}, 1350],
    ];
    const lines: string[] = [];
    let ok = true;
    for (const [label, line, opts, expected] of scenarios) {
      const r = await allPaths(line, opts);
      const pass = allPayable(r, expected);
      ok = ok && pass;
      lines.push(`${pass ? "ok" : "MISMATCH"} ${label}: expected ${expected} | ${fmt(r)}`);
    }
    record(`F15 same cart + coupon -> identical payable on web COD / web ONLINE / mobile COD / mobile ONLINE (${scenarios.length} scenarios)`, ok, lines.join(" || "));
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
    console.log("ALL PRICING SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
