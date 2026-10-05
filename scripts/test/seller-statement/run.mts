/*
 * LOCAL-ONLY emulator regression harness — Seller Order Settlement Statement
 * (app/api/seller/order-statement + lib/sellerOrderStatement).
 * ---------------------------------------------------------------------------
 * Proves the per-order statement is the shared settlement engine and nothing
 * else: every figure equals lib/vendorPayable's computeVendorEarningsBreakdown
 * for that order and seller (commission ₹0, the stored sellerDeliveryCharge,
 * the existing coupon split and return deductions, the legacy fallback), and
 * that a seller can only ever see their OWN figures for an order that carries
 * their items and is visible to them — never another seller's, whatever ids
 * the request carries.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/seller-statement/run.mts"
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
const { POST: confirmOrder } = await import("../../../app/api/confirm-order/route.ts");
const { GET: sellerPayable } = await import("../../../app/api/seller/payable/route.ts");
const { GET: orderStatement } = await import("../../../app/api/seller/order-statement/route.ts");
const { computeVendorEarningsBreakdown } = await import("../../../lib/vendorPayable.ts");
const { control } = await import("../mobile-variant/control.mjs");
const { FieldValue } = await import("firebase-admin/firestore");

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

const ADMIN_UID = "admin_statement_1";
function req(url: string, body: unknown, uid: string, method = "POST", email = `${uid}@example.com`, extraHeaders: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: { authorization: `Bearer test:${uid}:${email}:true`, "content-type": "application/json", ...extraHeaders },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

const A = "seller_stmt_a";
const B = "seller_stmt_b";
const C = "seller_stmt_c";
const PRODUCTS: Record<string, { vendorId: string; price: number }> = {
  p_a300: { vendorId: A, price: 300 },
  p_b250: { vendorId: B, price: 250 },
  p_a200: { vendorId: A, price: 200 },
  p_a100: { vendorId: A, price: 100 },
  p_b100: { vendorId: B, price: 100 },
  p_c100: { vendorId: C, price: 100 },
};
async function seed() {
  // Commission switched ON in settings — the statement must still show ₹0.
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
  for (const uid of [A, B, C]) {
    await db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status: "Approved", kycStatus: "Approved" });
  }
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true });
}

const BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };
let n = 0;
const key = () => `stmtkey${++n}x${Date.now()}`;

async function webOnline(uid: string, items: { id: string; qty: number }[], extra: Record<string, unknown> = {}) {
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", { ...BODY, items, ...extra }, uid));
  const j = await json(res);
  const intent = (await db.collection("paymentIntents").doc(j.id).get()).data() as any;
  const r = await finalizeOnlineOrder({ razorpayPaymentId: `pay_stmt_${++n}`, razorpayOrderId: j.id, intent, capturedAmountPaise: intent.expectedAmountPaise, source: "browser" });
  return r.orderId as string;
}
async function webCod(uid: string, items: { id: string; qty: number }[]) {
  const res = await webPlaceOrder(req("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: key(), items }, uid));
  return (await json(res)).orderId as string;
}
async function mobileCod(uid: string, lines: { id: string; qty: number }[]) {
  for (const d of (await db.collection("cart").where("userId", "==", uid).get()).docs) await d.ref.delete();
  for (const l of lines) await db.collection("cart").add({ userId: uid, savedForLater: false, productId: l.id, quantity: l.qty, name: "x", price: 1 });
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...BODY, deliverySlot: "", idempotencyKey: key() }, uid));
  return (await json(res)).orderId as string;
}
async function confirm(orderId: string) {
  return (await confirmOrder(req("http://x/api/confirm-order", { orderId }, ADMIN_UID, "POST", ADMIN_EMAIL))).status;
}
async function deliverAndPay(orderId: string) {
  await db.collection("orders").doc(orderId).update({ status: "Delivered", paymentStatus: "Paid" });
}
async function statement(uid: string, orderId: string, extraQuery = "", extraHeaders: Record<string, string> = {}) {
  const res = await orderStatement(req(`http://x/api/seller/order-statement?orderId=${encodeURIComponent(orderId)}${extraQuery}`, null, uid, "GET", `${uid}@example.com`, extraHeaders));
  return { status: res.status, ...(await json(res)) };
}
// The engine, called directly on the same single order — the reference the statement must equal.
async function engine(uid: string, orderId: string, projected = false) {
  const o = { id: orderId, ...(await db.collection("orders").doc(orderId).get()).data() } as any;
  const so = (await db.collection("sellerOrders").doc(`${orderId}_${uid}`).get()).data();
  const irs = (await db.collection("itemRequests").where("vendorId", "==", uid).get()).docs.map((d) => d.data()).filter((ir: any) => ir.orderId === orderId);
  const rets = (await db.collection("returns").where("orderId", "==", orderId).get()).docs.map((d) => d.data());
  const order = projected ? { ...o, status: "Delivered", paymentStatus: "Paid", needsReview: false } : o;
  return computeVendorEarningsBreakdown({ vendorUid: uid, orders: [order], itemRequests: irs, legacyReturns: rets, sellerOrders: so ? [so] : [] });
}
const FIELDS = ["grossSales", "discountShare", "yomicoCouponShare", "commission", "sellerDeliveryCharges", "returnDeductions", "returnLogisticsCharges", "adjustedEarnings"] as const;
function sameAsEngine(figures: any, b: any) { return FIELDS.every((k) => figures?.[k] === b?.[k]); }
const brief = (s: any) => s?.statement ? `${s.statement.settlementStatus}/${s.statement.basis} ${JSON.stringify(s.statement.figures)}` : `status=${s.status} ${s.error ?? ""}`;

async function main() {
  await clearAll(); await seed();

  // ============ 1. Single seller, free delivery ============
  {
    const id = await webOnline("buyer_1", [{ id: "p_a300", qty: 2 }]);
    await confirm(id); await deliverAndPay(id);
    const s = await statement(A, id);
    const eng = await engine(A, id);
    record("1  single seller, free delivery: delivery ₹49, gross 600, commission ₹0, net 551; settled + counted; == engine",
      s.status === 200 && s.statement.figures.sellerDeliveryCharges === 49 && s.statement.figures.grossSales === 600 &&
      s.statement.figures.commission === 0 && s.statement.figures.adjustedEarnings === 551 &&
      s.statement.settlementStatus === "SETTLEMENT_ELIGIBLE" && s.statement.countsTowardPayable === true &&
      s.statement.deliveryChargeSource === "snapshot" && s.statement.customerOrderTotal === 600 && sameAsEngine(s.statement.figures, eng),
      brief(s));
  }

  // ============ 2. Two sellers ₹300 / ₹250, free delivery ============
  let twoSellerOrder = "";
  {
    twoSellerOrder = await webOnline("buyer_2", [{ id: "p_a300", qty: 1 }, { id: "p_b250", qty: 1 }]);
    await confirm(twoSellerOrder); await deliverAndPay(twoSellerOrder);
    const sa = await statement(A, twoSellerOrder);
    const sb = await statement(B, twoSellerOrder);
    record("2  two sellers ₹300 / ₹250: delivery 27 / 22 (sum = the ONE ₹49); nets 273 / 228; each == engine",
      sa.statement.figures.sellerDeliveryCharges === 27 && sb.statement.figures.sellerDeliveryCharges === 22 &&
      sa.statement.figures.sellerDeliveryCharges + sb.statement.figures.sellerDeliveryCharges === sa.statement.orderDeliveryCost &&
      sa.statement.figures.adjustedEarnings === 273 && sb.statement.figures.adjustedEarnings === 228 &&
      sb.statement.figures.grossSales === 250 &&
      sameAsEngine(sa.statement.figures, await engine(A, twoSellerOrder)) && sameAsEngine(sb.statement.figures, await engine(B, twoSellerOrder)),
      `${brief(sa)} | ${brief(sb)}`);
  }

  // ============ 3. Three equal sellers ============
  {
    const id = await webOnline("buyer_3", [{ id: "p_a100", qty: 2 }, { id: "p_b100", qty: 2 }, { id: "p_c100", qty: 2 }]);
    await confirm(id); await deliverAndPay(id);
    const charges = [];
    let allEngine = true;
    for (const v of [A, B, C]) {
      const s = await statement(v, id);
      charges.push(s.statement.figures.sellerDeliveryCharges);
      allEngine = allEngine && sameAsEngine(s.statement.figures, await engine(v, id));
    }
    record("3  three equal sellers: delivery 17 / 16 / 16 (= 49); each == engine",
      JSON.stringify(charges) === "[17,16,16]" && allEngine, JSON.stringify(charges));
  }

  // ============ 4. Paid-delivery order ============
  {
    const id = await webCod("buyer_4", [{ id: "p_a200", qty: 1 }]);
    await confirm(id); await deliverAndPay(id);
    const s = await statement(A, id);
    record("4  paid-delivery order (₹200 + customer ₹49): seller delivery charge ₹0, net 200; customer order value 249; == engine",
      s.statement.figures.sellerDeliveryCharges === 0 && s.statement.figures.adjustedEarnings === 200 &&
      s.statement.customerOrderTotal === 249 && s.statement.freeDeliveryApplied === false && sameAsEngine(s.statement.figures, await engine(A, id)),
      brief(s));
  }

  // ============ 5. Coupon ============
  let couponOrder = "";
  {
    couponOrder = await webOnline("buyer_5", [{ id: "p_a300", qty: 1 }, { id: "p_b250", qty: 1 }], { couponCode: "SAVE10" });
    await confirm(couponOrder); await deliverAndPay(couponOrder);
    const sa = await statement(A, couponOrder);
    const sb = await statement(B, couponOrder);
    // H3: the ₹55 coupon is YOMICO-funded — shown per seller (30 / 25) but not deducted.
    record("5  coupon SAVE10 (H3, YOMICO-funded): customer paid 495; A = 300 − 0 − 0 − 27 = 273, B = 250 − 0 − 0 − 22 = 228; YOMICO coupon share shown 30 / 25, not deducted; == engine",
      sa.statement.customerOrderTotal === 495 && sa.statement.figures.discountShare === 0 && sb.statement.figures.discountShare === 0 &&
      Math.abs(sa.statement.figures.yomicoCouponShare - 30) < 1e-9 && Math.abs(sb.statement.figures.yomicoCouponShare - 25) < 1e-9 &&
      sa.statement.figures.adjustedEarnings === 273 && sb.statement.figures.adjustedEarnings === 228 &&
      sameAsEngine(sa.statement.figures, await engine(A, couponOrder)) && sameAsEngine(sb.statement.figures, await engine(B, couponOrder)),
      `${brief(sa)} | ${brief(sb)}`);
  }

  // ============ 6/7. Return: deduction appears, delivery charge unchanged ============
  {
    await db.collection("itemRequests").add({ orderId: couponOrder, vendorId: A, type: "return", status: "REFUNDED", item: { unitPrice: 300, qty: 1 } });
    const sa = await statement(A, couponOrder);
    const sb = await statement(B, couponOrder);
    // The returned item comes off at the value A was credited (300, pre-coupon),
    // so A ends exactly where a coupon-free order would: only the delivery
    // charge (−27). The coupon never turns into a seller loss on a return.
    record("6  return of A's item (H3): return deduction 300 (A's full credited merchandise) shown; A net −27, same as without a coupon; == engine",
      sa.statement.figures.returnDeductions === 300 && sa.statement.figures.adjustedEarnings === -27 && sameAsEngine(sa.statement.figures, await engine(A, couponOrder)),
      brief(sa));
    record("7  delivery charge stays as currently defined after the return (A 27), and B's statement is untouched (228)",
      sa.statement.figures.sellerDeliveryCharges === 27 && sb.statement.figures.adjustedEarnings === 228 && sb.statement.figures.returnDeductions === 0,
      `${brief(sa)} | ${brief(sb)}`);
  }

  // ============ 8. Statements add up to the seller API ============
  {
    const api = await json(await sellerPayable(req("http://x/api/seller/payable", null, A, "GET")));
    const aOrders = (await db.collection("orders").where("vendorIds", "array-contains", A).get()).docs.map((d) => d.id);
    let sum = 0;
    for (const id of aOrders) {
      const s = await statement(A, id);
      if (s.statement?.countsTowardPayable) sum += s.statement.figures.adjustedEarnings;
    }
    record("8  Σ settled per-order statements for seller A == /api/seller/payable adjustedEarnings",
      Math.abs(sum - api.breakdown.adjustedEarnings) < 1e-9, `sum=${sum} api=${api.breakdown?.adjustedEarnings}`);
  }

  // ============ 9. Seller A cannot read seller B's statement ============
  {
    const bOnly = await webOnline("buyer_9", [{ id: "p_b250", qty: 2 }]);
    await confirm(bOnly); await deliverAndPay(bOnly);
    const aOnB = await statement(A, bOnly);
    const cOnShared = await statement(C, twoSellerOrder);
    const missing = await statement(A, "no_such_order");
    record("9  seller A asking for a B-only order -> 404; seller C (not on the order) -> 404; same answer as a missing order",
      aOnB.status === 404 && cOnShared.status === 404 && missing.status === 404 && aOnB.error === missing.error && !aOnB.statement,
      `A->B-only=${aOnB.status} C->shared=${cOnShared.status} missing=${missing.status}`);
  }

  // ============ 10. Forged vendorId cannot obtain another seller's figures ============
  {
    const forgedQuery = await statement(B, twoSellerOrder, `&vendorId=${A}&sellerId=${A}&vendorUid=${A}`);
    const forgedHeader = await statement(B, twoSellerOrder, "", { "x-vendor-id": A, "x-seller-id": A });
    const aOnlyOrder = (await db.collection("orders").where("vendorIds", "array-contains", A).get()).docs
      .find((d) => (d.data().vendorIds || []).length === 1)!.id;
    const forgedOnAOnly = await statement(B, aOnlyOrder, `&vendorId=${A}`);
    record("10 forged vendorId / sellerId in the query or headers is ignored: B still gets only B's own figures (250 gross, 22 delivery), or 404",
      forgedQuery.status === 200 && forgedQuery.statement.figures.grossSales === 250 && forgedQuery.statement.figures.sellerDeliveryCharges === 22 &&
      forgedHeader.statement.figures.grossSales === 250 && forgedOnAOnly.status === 404,
      `query=${brief(forgedQuery)} header=${brief(forgedHeader)} A-only=${forgedOnAOnly.status}`);
  }

  // ============ 11. Legacy sellerOrder without the snapshot ============
  {
    await db.collection("sellerOrders").doc(`${twoSellerOrder}_${A}`).update({ sellerDeliveryCharge: FieldValue.delete() });
    const s = await statement(A, twoSellerOrder);
    record("11 legacy sellerOrder without sellerDeliveryCharge: engine's existing fallback (round(49 × 300/550) = 27), flagged legacy-recalculated; == engine",
      s.statement.figures.sellerDeliveryCharges === 27 && s.statement.deliveryChargeSource === "legacy-recalculated" &&
      sameAsEngine(s.statement.figures, await engine(A, twoSellerOrder)), brief(s));
  }

  // ============ 12–14. Not-yet-payable orders ============
  {
    const pending = await webOnline("buyer_12a", [{ id: "p_a300", qty: 1 }, { id: "p_b250", qty: 1 }]);
    const beforeConfirm = await statement(A, pending);
    await confirm(pending);
    const inTransit = await statement(A, pending);
    const codUnpaid = await mobileCod("buyer_12b", [{ id: "p_a300", qty: 1 }, { id: "p_b250", qty: 1 }]);
    await confirm(codUnpaid);
    await db.collection("orders").doc(codUnpaid).update({ status: "Delivered" });
    const awaiting = await statement(A, codUnpaid);
    const cancelled = await webOnline("buyer_12c", [{ id: "p_a300", qty: 2 }]);
    await confirm(cancelled);
    await db.collection("orders").doc(cancelled).update({ status: "Cancelled" });
    const notPayable = await statement(A, cancelled);
    record("12 Pending (unconfirmed) order is hidden from the seller -> 404 (same as firestore.rules)",
      beforeConfirm.status === 404, `status=${beforeConfirm.status}`);
    record("13 confirmed/in-transit and delivered-but-unverified COD: 'projected' figures (27 delivery, net 273) == engine on the eligible order, NOT counted",
      inTransit.statement.settlementStatus === "PENDING_DELIVERY" && inTransit.statement.basis === "projected" && inTransit.statement.countsTowardPayable === false &&
      inTransit.statement.figures.adjustedEarnings === 273 && sameAsEngine(inTransit.statement.figures, await engine(A, pending, true)) &&
      awaiting.statement.settlementStatus === "AWAITING_PAYMENT_CONFIRMATION" && awaiting.statement.countsTowardPayable === false &&
      sameAsEngine(awaiting.statement.figures, await engine(A, codUnpaid, true)),
      `${brief(inTransit)} | ${brief(awaiting)}`);
    record("14 cancelled order: NOT_PAYABLE, basis none, all figures 0 (== engine on the order as it is)",
      notPayable.statement.settlementStatus === "NOT_PAYABLE" && notPayable.statement.basis === "none" &&
      notPayable.statement.figures.adjustedEarnings === 0 && notPayable.statement.figures.sellerDeliveryCharges === 0 &&
      sameAsEngine(notPayable.statement.figures, await engine(A, cancelled)), brief(notPayable));
  }

  // ============ 15. Commission is always ₹0 ============
  {
    const orders = (await db.collection("orders").get()).docs;
    let allZero = true;
    let count = 0;
    for (const d of orders) {
      for (const v of [A, B, C]) {
        const s = await statement(v, d.id);
        if (s.status === 200) { count++; allZero = allZero && s.statement.figures.commission === 0; }
      }
    }
    await db.collection("orders").doc(couponOrder).update({ commissionRate: 0.1, commission: 999 });
    const legacy = await statement(A, couponOrder);
    record("15 commission is ₹0 on every statement (settings say 10%; a legacy order carrying 10% / ₹999 too)",
      allZero && count > 10 && legacy.statement.figures.commission === 0, `statements=${count} legacy=${legacy.statement?.figures?.commission}`);
  }

  // ============ 16. Minimal response ============
  {
    const s = await statement(B, twoSellerOrder);
    const keys = Object.keys(s.statement || {}).sort().join(",");
    const text = JSON.stringify(s);
    record("16 response carries only this seller's figures + order headline fields: no items, no other seller, no customer name/phone/address/email",
      !("items" in s.statement) && !text.includes(A) && !text.includes("Test Buyer") && !text.includes("9898989898") &&
      !text.includes("1 Test Road") && !text.includes("@example.com"),
      keys);
  }

  // ============ 17. Request validation ============
  {
    const unauth = await orderStatement(new Request(`http://x/api/seller/order-statement?orderId=${twoSellerOrder}`, { method: "GET" }));
    const noId = await statement(A, "");
    const slash = await statement(A, "orders/x");
    record("17 unauthenticated -> 401; missing orderId -> 400; path-like orderId -> 400",
      unauth.status === 401 && noId.status === 400 && slash.status === 400, `unauth=${unauth.status} noId=${noId.status} slash=${slash.status}`);
  }

  // ============ 18. Firestore-reserved ids are invalid input (400), not a 500 ============
  {
    const reserved: Record<string, number> = {};
    for (const id of [".", "..", "__x__", "__name__"]) reserved[id] = (await statement(A, id)).status;
    const blank = (await statement(A, "   ")).status;
    const at200 = (await statement(A, "x".repeat(200))).status;
    const over200 = (await statement(A, "x".repeat(201))).status;
    const missing = await statement(A, "no_such_order");
    const valid = await statement(B, twoSellerOrder);
    const inner = (await statement(A, "a__b__c")).status; // not a reserved __x__ id
    record("18 '.', '..', '__x__', '__name__' -> 400; blank -> 400; 201 chars -> 400; 200 chars / missing -> 404; a valid order still 200 with B's own figures",
      Object.values(reserved).every((s) => s === 400) && blank === 400 && over200 === 400 && at200 === 404 &&
      missing.status === 404 && missing.error === "Order not found." && inner === 404 &&
      valid.status === 200 && valid.statement.figures.grossSales === 250,
      `reserved=${JSON.stringify(reserved)} blank=${blank} 200=${at200} 201=${over200} missing=${missing.status} inner=${inner} valid=${valid.status}`);
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
    console.log("ALL SELLER STATEMENT SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
