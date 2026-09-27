/*
 * LOCAL-ONLY emulator regression harness — admin direct payouts
 * (app/api/admin/record-payout).
 * ---------------------------------------------------------------------------
 * Proves a vendor_payouts record can only come from the server route, which
 * trusts nothing from the browser but WHICH seller and the requested figure:
 * the caller must be the verified admin, the seller must exist, the payable is
 * recomputed with lib/vendorPayable's shared engine inside a transaction, the
 * amount must be a whole-rupee figure that fits in it, and the deterministic
 * (seller, idempotency key) id makes a repeated or concurrent request record
 * the payout exactly once. Withdrawals keep working against the same balance,
 * and commission stays ₹0 throughout.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/vendor-payout/run.mts"
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
const { POST: recordPayout } = await import("../../../app/api/admin/record-payout/route.ts");
const { POST: requestWithdrawal } = await import("../../../app/api/request-withdrawal/route.ts");
const { POST: settleWithdrawal } = await import("../../../app/api/settle-withdrawal/route.ts");
const { GET: sellerPayable } = await import("../../../app/api/seller/payable/route.ts");
const { loadVendorPayableInputs } = await import("../../../lib/vendorPayableServer.ts");
const { computeVendorPayableBreakdown } = await import("../../../lib/vendorPayable.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = [
  "orders", "sellerOrders", "vendors", "settings", "counters", "rateLimits", "withdrawals",
  "vendor_payouts", "itemRequests", "returns", "audit_logs",
];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const ADMIN_UID = "admin_payout_1";
const A = "seller_pay_a";
const B = "seller_pay_b";
const CUSTOMER = "customer_pay_1";

function post(url: string, body: unknown, token: string | null, raw = false) {
  return new Request(url, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}
const tokenFor = (uid: string, email = `${uid}@example.com`, verified = true) => `test:${uid}:${email}:${verified}`;
const ADMIN = tokenFor(ADMIN_UID, ADMIN_EMAIL);
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

async function pay(body: unknown, token: string | null = ADMIN) {
  const res = await recordPayout(post("http://localhost/api/admin/record-payout", body, token));
  return { status: res.status, body: await json(res) };
}
async function payable(uid: string) {
  const res = await sellerPayable(new Request("http://localhost/api/seller/payable", {
    headers: { authorization: `Bearer ${tokenFor(uid)}` },
  }));
  return json(res);
}
async function payoutDocs(uid: string) {
  return (await db.collection("vendor_payouts").where("vendorId", "==", uid).get()).docs;
}
async function auditCount() {
  return (await db.collection("audit_logs").where("action", "==", "vendor_payout").get()).size;
}
let k = 0;
const key = () => `payoutkey_${++k}_${Date.now()}`;

// ---------------------------------------------------------------- seed ----
// A: ₹300 paid-delivery order (legacy commissionRate 0.1 on the document) and
//    a free-delivery two-seller order (A ₹300 + B ₹250, ONE ₹49 cost stored
//    as 27 / 22) -> A earns 300 + 273 = 573, B earns 228. An undelivered
//    ₹1000 order never counts.
async function seed() {
  await db.collection("settings").doc("global").set({
    commissionEnabled: true, commissionRate: 0.1,
    freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49,
  });
  for (const uid of [A, B]) {
    await db.collection("vendors").add({
      uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status: "Approved", kycStatus: "Approved",
    });
  }
  await db.collection("orders").doc("pay_o1").set({
    userId: CUSTOMER, vendorIds: [A], items: [{ id: "p1", vendorId: A, price: 300, qty: 1 }],
    total: 300, shippingCharge: 49, finalTotal: 349, deliveryCost: 49, freeDeliveryApplied: false,
    commissionRate: 0.1, commission: 30, status: "Delivered", paymentStatus: "Paid", paymentMethod: "ONLINE",
  });
  await db.collection("sellerOrders").doc(`pay_o1_${A}`).set({
    orderId: "pay_o1", vendorId: A, vendorSubtotal: 300, vendorCommission: 0, vendorEarning: 300, sellerDeliveryCharge: 0,
  });
  await db.collection("orders").doc("pay_o2").set({
    userId: CUSTOMER, vendorIds: [A, B],
    items: [{ id: "p2", vendorId: A, price: 300, qty: 1 }, { id: "p3", vendorId: B, price: 250, qty: 1 }],
    total: 550, shippingCharge: 0, finalTotal: 550, deliveryCost: 49, freeDeliveryApplied: true,
    status: "Delivered", paymentStatus: "Paid", paymentMethod: "ONLINE",
  });
  await db.collection("sellerOrders").doc(`pay_o2_${A}`).set({
    orderId: "pay_o2", vendorId: A, vendorSubtotal: 300, vendorCommission: 0, vendorEarning: 300, sellerDeliveryCharge: 27,
  });
  await db.collection("sellerOrders").doc(`pay_o2_${B}`).set({
    orderId: "pay_o2", vendorId: B, vendorSubtotal: 250, vendorCommission: 0, vendorEarning: 250, sellerDeliveryCharge: 22,
  });
  await db.collection("orders").doc("pay_o3").set({
    userId: CUSTOMER, vendorIds: [A], items: [{ id: "p4", vendorId: A, price: 1000, qty: 1 }],
    total: 1000, finalTotal: 1000, status: "Shipped", paymentStatus: "Pending", paymentMethod: "COD",
  });
}

try {
  await clearAll();
  await seed();

  // ============ 1. Authentication / authorization ============
  const noAuth = await pay({ vendorUid: A, amount: 10, idempotencyKey: key() }, null);
  const nonAdmin = await pay({ vendorUid: A, amount: 10, idempotencyKey: key() }, tokenFor("random_user_9"));
  const asSeller = await pay({ vendorUid: A, amount: 10, idempotencyKey: key() }, tokenFor(A));
  const asOtherSeller = await pay({ vendorUid: A, amount: 10, idempotencyKey: key() }, tokenFor(B));
  const asCustomer = await pay({ vendorUid: A, amount: 10, idempotencyKey: key() }, tokenFor(CUSTOMER));
  const unverifiedAdmin = await pay({ vendorUid: A, amount: 10, idempotencyKey: key() }, tokenFor("admin_unverified", ADMIN_EMAIL, false));
  record("1  unauthenticated 401; non-admin, seller (own or another's), customer and unverified admin email all 403; nothing written",
    noAuth.status === 401 && nonAdmin.status === 403 && asSeller.status === 403 && asOtherSeller.status === 403 &&
    asCustomer.status === 403 && unverifiedAdmin.status === 403 &&
    (await db.collection("vendor_payouts").get()).empty && (await auditCount()) === 0,
    `${noAuth.status}/${nonAdmin.status}/${asSeller.status}/${asOtherSeller.status}/${asCustomer.status}/${unverifiedAdmin.status}`);

  // ============ 2. Invalid requests ============
  const badJson = await recordPayout(post("http://localhost/api/admin/record-payout", "{not json", ADMIN, true));
  const invalid: Record<string, number> = {
    badJson: badJson.status,
    array: (await pay([A, 10])).status,
    nullBody: (await pay(null)).status,
    missingVendor: (await pay({ amount: 10, idempotencyKey: key() })).status,
    numericVendor: (await pay({ vendorUid: 123, amount: 10, idempotencyKey: key() })).status,
    blankVendor: (await pay({ vendorUid: "   ", amount: 10, idempotencyKey: key() })).status,
    slashVendor: (await pay({ vendorUid: "a/b", amount: 10, idempotencyKey: key() })).status,
    dotVendor: (await pay({ vendorUid: ".", amount: 10, idempotencyKey: key() })).status,
    dotdotVendor: (await pay({ vendorUid: "..", amount: 10, idempotencyKey: key() })).status,
    reservedVendor: (await pay({ vendorUid: "__x__", amount: 10, idempotencyKey: key() })).status,
    longVendor: (await pay({ vendorUid: "v".repeat(129), amount: 10, idempotencyKey: key() })).status,
    missingKey: (await pay({ vendorUid: A, amount: 10 })).status,
    shortKey: (await pay({ vendorUid: A, amount: 10, idempotencyKey: "abc" })).status,
    badCharKey: (await pay({ vendorUid: A, amount: 10, idempotencyKey: "bad key/../x" })).status,
    longKey: (await pay({ vendorUid: A, amount: 10, idempotencyKey: "k".repeat(65) })).status,
  };
  const unknownVendor = await pay({ vendorUid: "no_such_seller", amount: 10, idempotencyKey: key() });
  record("2  malformed body / seller id / idempotency key -> 400; unknown seller -> 404; nothing written",
    Object.values(invalid).every((s) => s === 400) && unknownVendor.status === 404 &&
    (await db.collection("vendor_payouts").get()).empty && (await auditCount()) === 0,
    JSON.stringify({ ...invalid, unknownVendor: unknownVendor.status }));

  // ============ 3. Zero / negative / invalid amounts ============
  const amounts: Record<string, number> = {};
  for (const [label, amount] of Object.entries({
    zero: 0, negative: -100, fraction: 10.5, string: "100", nan: "NaN", nullAmount: null, missing: undefined, object: { v: 1 },
  })) {
    amounts[label] = (await pay({ vendorUid: A, amount, idempotencyKey: key() })).status;
  }
  // JSON cannot carry Infinity/NaN as numbers; they arrive as null.
  amounts.huge = (await pay({ vendorUid: A, amount: 1e21, idempotencyKey: key() })).status;
  record("3  zero, negative, fractional, string, null, missing and non-number amounts -> 400; an absurd amount -> 409; nothing written",
    Object.entries(amounts).every(([l, s]) => (l === "huge" ? s === 409 : s === 400)) &&
    (await db.collection("vendor_payouts").get()).empty,
    JSON.stringify(amounts));

  // ============ 4. Payable before, commission 0 ============
  const before = await payable(A);
  record("4  seller A payable before any payout = 573 (300 + 300 − 27), commission ₹0 despite settings 10% and a legacy commissionRate 0.1",
    before.payable === 573 && before.breakdown?.commission === 0 && before.breakdown?.sellerDeliveryCharges === 27,
    JSON.stringify(before.breakdown));

  // ============ 5. Above payable rejected ============
  const over = await pay({ vendorUid: A, amount: 574, idempotencyKey: key() });
  record("5  ₹574 against a ₹573 payable -> 409 (reports payable 573); nothing written",
    over.status === 409 && over.body.payable === 573 && (await payoutDocs(A)).length === 0 && (await auditCount()) === 0,
    `${over.status} ${JSON.stringify(over.body)}`);

  // ============ 6. Successful payout ============
  const k1 = key();
  const ok = await pay({ vendorUid: A, amount: 200, idempotencyKey: k1 });
  const docs6 = await payoutDocs(A);
  const d6 = docs6[0]?.data() || {};
  const audits6 = (await db.collection("audit_logs").where("action", "==", "vendor_payout").get()).docs.map((d) => d.data());
  record("6  admin pays ₹200: one vendor_payouts doc (deterministic id, server fields, PAYOUT number) + one audit_logs entry",
    ok.status === 200 && ok.body.success === true && ok.body.amount === 200 && ok.body.remaining === 373 &&
    docs6.length === 1 && docs6[0].id === `adminpay_${A}_${k1}` &&
    d6.vendorId === A && d6.amount === 200 && d6.status === "Paid" && d6.source === "admin_direct" &&
    d6.paidBy === ADMIN_UID && d6.vendorName === `Shop ${A}` && /^PAYOUT\d{6}$/.test(String(d6.payoutNumber)) &&
    d6.payableBefore === 573 && !("commission" in d6) &&
    audits6.length === 1 && audits6[0].targetId === A && audits6[0].actorUid === ADMIN_UID &&
    audits6[0].details?.amount === 200 && audits6[0].details?.payoutId === docs6[0].id,
    `${ok.status} ${JSON.stringify(ok.body)}`);

  // ============ 7. Repeated idempotency key ============
  const again = await pay({ vendorUid: A, amount: 200, idempotencyKey: k1 });
  const again2 = await pay({ vendorUid: A, amount: 200, idempotencyKey: k1 });
  const repriced = await pay({ vendorUid: A, amount: 100, idempotencyKey: k1 });
  record("7  same key again (twice) -> alreadyRecorded, same payout; same key with another amount -> 409; still ONE payout and ONE audit entry",
    again.status === 200 && again.body.alreadyRecorded === true && again.body.payoutId === `adminpay_${A}_${k1}` &&
    again2.body.alreadyRecorded === true && repriced.status === 409 &&
    (await payoutDocs(A)).length === 1 && (await auditCount()) === 1,
    `${again.status}/${again2.status}/${repriced.status}`);

  // ============ 8. Payable reduced exactly once ============
  const after = await payable(A);
  const direct = computeVendorPayableBreakdown({ vendorUid: A, ...(await loadVendorPayableInputs(db, A)) });
  record("8  payable after = 573 − 200 = 373 exactly (paidOut 200), same as the engine directly; commission ₹0",
    after.payable === 373 && after.breakdown?.paidOut === 200 && direct.payable === 373 && after.breakdown?.commission === 0,
    `api=${after.payable} engine=${direct.payable}`);

  // ============ 9. Concurrent attempts, different keys ============
  const burst = await Promise.all(
    Array.from({ length: 5 }, () => pay({ vendorUid: A, amount: 373, idempotencyKey: key() }))
  );
  const burstOk = burst.filter((r) => r.status === 200).length;
  const burst409 = burst.filter((r) => r.status === 409).length;
  const afterBurst = await payable(A);
  const paidA = (await payoutDocs(A)).reduce((s, d) => s + Number(d.data().amount || 0), 0);
  record("9  five concurrent ₹373 payouts (different keys) -> exactly one succeeds, four 409; total paid 573, payable 0",
    burstOk === 1 && burst409 === 4 && paidA === 573 && afterBurst.payable === 0 && (await auditCount()) === 2,
    `ok=${burstOk} 409=${burst409} paid=${paidA} payable=${afterBurst.payable}`);

  // ============ 10. Concurrent attempts, same key ============
  const kSame = key();
  const sameBurst = await Promise.all(
    Array.from({ length: 5 }, () => pay({ vendorUid: B, amount: 100, idempotencyKey: kSame }))
  );
  const bDocs = await payoutDocs(B);
  const bAfter = await payable(B);
  record("10 five concurrent same-key ₹100 payouts to B -> all 200, exactly one created (rest alreadyRecorded); B payable 228 → 128",
    sameBurst.every((r) => r.status === 200) &&
    sameBurst.filter((r) => r.body.alreadyRecorded === true).length === 4 &&
    bDocs.length === 1 && bDocs[0].data().amount === 100 && bAfter.payable === 128 && (await auditCount()) === 3,
    `statuses=${sameBurst.map((r) => r.status).join(",")} docs=${bDocs.length} payable=${bAfter.payable}`);

  // ============ 11. Negative payable cannot be paid ============
  // A's ₹300 item on pay_o1 comes back after A was paid in full.
  await db.collection("itemRequests").doc("pay_ir1").set({
    orderId: "pay_o1", vendorId: A, userId: CUSTOMER, type: "return", status: "REQUESTED",
    item: { unitPrice: 300, qty: 1 },
  });
  const negative = await payable(A);
  const negPay1 = await pay({ vendorUid: A, amount: 1, idempotencyKey: key() });
  record("11 a return after full payout leaves A at payable −300 (available 0): even ₹1 -> 409 payable 0; no new payout",
    negative.payable === -300 && negative.available === 0 && negPay1.status === 409 && negPay1.body.payable === 0 &&
    (await payoutDocs(A)).length === 2,
    `payable=${negative.payable} status=${negPay1.status}`);

  // ============ 12. Withdrawals still work alongside payouts ============
  const wKey = key();
  const wReq = await requestWithdrawal(post("http://localhost/api/request-withdrawal", { amount: 100, idempotencyKey: wKey }, tokenFor(B)));
  const wBody = await json(wReq);
  const bReserved = await payable(B);
  const payOverReserved = await pay({ vendorUid: B, amount: 29, idempotencyKey: key() });
  const settle = await settleWithdrawal(post("http://localhost/api/settle-withdrawal", { withdrawalId: wBody.withdrawalId }, ADMIN));
  const bSettled = await payable(B);
  const payRest = await pay({ vendorUid: B, amount: 28, idempotencyKey: key() });
  const bFinal = await payable(B);
  const wAfter = await requestWithdrawal(post("http://localhost/api/request-withdrawal", { amount: 1, idempotencyKey: key() }, tokenFor(B)));
  record("12 B withdraws ₹100 (reserved → payable 28), a ₹29 payout is refused, the withdrawal settles Paid, a ₹28 payout clears B to 0 and a further withdrawal is refused",
    wReq.status === 200 && wBody.amount === 100 && bReserved.payable === 28 && bReserved.breakdown?.reserved === 100 &&
    payOverReserved.status === 409 && settle.status === 200 && bSettled.payable === 28 &&
    payRest.status === 200 && bFinal.payable === 0 && bFinal.breakdown?.paidOut === 228 && wAfter.status === 409,
    `req=${wReq.status} reserved=${bReserved.payable} over=${payOverReserved.status} settle=${settle.status} rest=${payRest.status} final=${bFinal.payable} wAfter=${wAfter.status}`);

  // ============ 13. Commission stays 0 everywhere ============
  const finalA = await payable(A);
  const allPayouts = (await db.collection("vendor_payouts").get()).docs.map((d) => d.data());
  record("13 commission ₹0 in every breakdown; no payout document carries a commission field",
    finalA.breakdown?.commission === 0 && bFinal.breakdown?.commission === 0 &&
    allPayouts.every((p) => !("commission" in p) && !("commissionRate" in p)),
    `A=${finalA.breakdown?.commission} B=${bFinal.breakdown?.commission} payouts=${allPayouts.length}`);

  // ============ 14. Rate limit ============
  const RL_ADMIN = tokenFor("admin_payout_rl", ADMIN_EMAIL);
  const rl: number[] = [];
  for (let i = 0; i < 61; i++) rl.push((await pay({ vendorUid: "__x__" }, RL_ADMIN)).status);
  record("14 rate limit: 60 requests per admin per 10 minutes (same budget as settle-withdrawal), the 61st -> 429",
    rl.slice(0, 60).every((s) => s === 400) && rl[60] === 429,
    `last=${rl[60]}`);
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
