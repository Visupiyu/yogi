/*
 * LOCAL-ONLY emulator harness — L4 automatic Razorpay refunds for cancelled,
 * captured ONLINE orders (lib/refunds/orderRefund.ts,
 * app/api/admin/orders/[id]/refund, refund webhook events).
 * ---------------------------------------------------------------------------
 * Firestore EMULATOR only. Never calls Razorpay: `razorpay` is aliased to the
 * in-repo fake (../mobile-variant/tsconfig.harness.json) and every refund below
 * is a fake object held in this process. Auth is faked by intercepting the
 * Identity Toolkit fetch. A throwaway RSA key stands in for the service account.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/order-refund/run.mts"
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
    type: "service_account", project_id: PROJECT_ID, private_key_id: "test-key-id", private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`, client_id: "0", token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.RAZORPAY_KEY_ID = "rzp_test_LOCALHARNESS";
process.env.RAZORPAY_KEY_SECRET = "test_secret_local_harness";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_local_harness";

const OWNER = "adminyogimart@gmail.com";
// Fake Firebase Auth: token "test:<uid>:<email>:<emailVerified>"
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
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { POST: refundRoute } = await import("../../../app/api/admin/orders/[id]/refund/route.ts");
const { POST: cancelRoute } = await import("../../../app/api/cancel-order/route.ts");
const { POST: webhookRoute } = await import("../../../app/api/razorpay/webhook/route.ts");
const { executeOrderRefund } = await import("../../../lib/refunds/orderRefund.ts");
const { loadVendorPayableBreakdown } = await import("../../../lib/vendorPayableServer.ts");
const { clearAdminRoleCache } = await import("../../../lib/adminAccess.ts");
const { control } = await import("../mobile-variant/control.mjs");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["orders", "users", "rewardTransactions", "rateLimits", "audit_logs", "sellerOrders", "vendor_payouts",
  "withdrawals", "notifications", "couponRedemptions", "deliveryJobs", "products", "vendors", "adminRoles", "itemRequests", "returns"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }

const token = (uid: string, email = `${uid}@example.com`, verified = true) => `test:${uid}:${email}:${verified}`;
const ADMIN = token("admin_uid", OWNER);
function refundReq(orderId: string, auth: string | null, body: unknown = {}) {
  return refundRoute(
    new Request(`http://localhost/api/admin/orders/${orderId}/refund`, {
      method: "POST",
      headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: orderId }) }
  );
}
async function call(res: Response) { return { status: res.status, body: await res.json().catch(() => ({})) as any }; }
const order = async (id: string) => (await db.collection("orders").doc(id).get()).data() as any;

// ---- in-process fake Razorpay ledger ----
type FakeRefund = { id: string; amount: number; status: string; payment_id: string; notes: Record<string, string> };
const payments = new Map<string, { id: string; order_id: string; status: string; amount: number; amount_refunded: number; currency: string }>();
const refunds: FakeRefund[] = [];
let refundStatusOnCreate = "processed";
function installRazorpayFake() {
  control.reset();
  control.paymentsFetch = async (id: string) => {
    const p = payments.get(id);
    if (!p) throw { statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } };
    return { ...p };
  };
  control.paymentsFetchMultipleRefund = async (paymentId: string) => ({ items: refunds.filter((r) => r.payment_id === paymentId).map((r) => ({ ...r })) });
  control.paymentsFetchRefund = async (_p: string, refundId: string) => {
    const r = refunds.find((x) => x.id === refundId);
    if (!r) throw { statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "refund not found" } };
    return { ...r };
  };
  control.paymentsRefund = async (paymentId: string, params: any) => {
    const p = payments.get(paymentId)!;
    if (p.amount - p.amount_refunded < params.amount) {
      throw { statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "The refund amount provided is greater than amount captured" } };
    }
    const r: FakeRefund = { id: `rfnd_${crypto.randomBytes(6).toString("hex")}`, amount: params.amount, status: refundStatusOnCreate, payment_id: paymentId, notes: params.notes };
    refunds.push(r);
    p.amount_refunded += params.amount;
    return { ...r };
  };
}

const VENDOR = "vendor_refund_1";
const CUSTOMER = "cust_refund_1";

async function seedCancelledPaidOrder(paymentId: string, opts: { amount?: number; rewardValue?: number; razorpayOrderId?: string; docId?: string } = {}) {
  const amount = opts.amount ?? 700;
  const rzpOrder = opts.razorpayOrderId ?? `order_${paymentId.slice(4)}`;
  await db.collection("orders").doc(opts.docId ?? paymentId).set({
    userId: CUSTOMER, userEmail: `${CUSTOMER}@example.com`, vendorIds: [VENDOR], items: [],
    paymentMethod: "ONLINE", paymentStatus: "Paid", status: "Cancelled",
    total: amount + (opts.rewardValue ?? 0), finalTotal: amount, rewardValue: opts.rewardValue ?? 0,
    razorpayPaymentId: paymentId, razorpayOrderId: rzpOrder,
    refundStatus: "Required", refundAmountDue: amount, refundRequestedAt: new Date(),
  });
  payments.set(paymentId, { id: paymentId, order_id: rzpOrder, status: "captured", amount: Math.round(amount * 100), amount_refunded: 0, currency: "INR" });
}

async function main() {
  await clearAll();
  clearAdminRoleCache();
  installRazorpayFake();
  await db.collection("vendors").doc("v1").set({ uid: VENDOR, status: "Approved" });
  await db.collection("users").doc(CUSTOMER).set({ email: `${CUSTOMER}@example.com`, rewardPoints: 1000 });

  // ---- 1. eligible captured payment: refunded once, confirmed by Razorpay ----
  await seedCancelledPaidOrder("pay_ELIG1", { amount: 700, rewardValue: 300 });
  const payableBefore = JSON.stringify(await loadVendorPayableBreakdown(db, VENDOR));
  const pointsBefore = (await db.collection("users").doc(CUSTOMER).get()).get("rewardPoints");
  const r1 = await call(await refundReq("pay_ELIG1", ADMIN, { amount: 1, paymentId: "pay_OTHER" }));
  const o1 = await order("pay_ELIG1");
  const created = refunds.filter((r) => r.payment_id === "pay_ELIG1");
  record("1 eligible online payment refunded (Refunded, amount = refundAmountDue, Razorpay refund id persisted)",
    r1.status === 200 && o1.refundStatus === "Refunded" && o1.refundedAmount === 700 && created.length === 1 &&
      created[0].amount === 70000 && o1.refundTransactionId === created[0].id && o1.razorpayRefundId === created[0].id &&
      o1.refundMethod === "razorpay_api" && !!o1.refundedAt && o1.paymentStatus === "Paid",
    `status=${r1.status} refundStatus=${o1.refundStatus} refunded=${o1.refundedAmount} rzp=${created.map((r) => r.amount)}`);
  record("1b body-supplied amount/paymentId ignored (server amount, server payment)",
    created.length === 1 && created[0].amount === 70000 && created[0].payment_id === "pay_ELIG1" && !refunds.some((r) => r.payment_id === "pay_OTHER"));
  record("1c reward-funded part NOT refunded as money; points untouched by the refund",
    created[0].amount === 70000 && (await db.collection("users").doc(CUSTOMER).get()).get("rewardPoints") === pointsBefore);
  record("1d seller payout breakdown unchanged by the refund",
    JSON.stringify(await loadVendorPayableBreakdown(db, VENDOR)) === payableBefore);
  const audit1 = (await db.collection("audit_logs").where("targetId", "==", "pay_ELIG1").get()).docs.map((d) => d.get("action"));
  record("1e audit trail written", audit1.includes("order_refund_completed"), audit1.join(","));

  // ---- 2. duplicate attempt: no second refund ----
  const callsBefore = control.calls.paymentsRefund;
  const r2 = await call(await refundReq("pay_ELIG1", ADMIN));
  record("2 duplicate attempt -> already refunded, no second Razorpay refund",
    r2.status === 200 && r2.body.alreadyRefunded === true && control.calls.paymentsRefund === callsBefore &&
      refunds.filter((r) => r.payment_id === "pay_ELIG1").length === 1);

  // ---- 3. concurrent attempts: exactly one Razorpay refund ----
  await seedCancelledPaidOrder("pay_CONC1");
  const slowRefund = control.paymentsRefund;
  control.paymentsRefund = async (p: string, params: any) => { await new Promise((r) => setTimeout(r, 400)); return slowRefund(p, params); };
  const conc = await Promise.all([1, 2, 3, 4].map(() => refundReq("pay_CONC1", ADMIN).then(call)));
  control.paymentsRefund = slowRefund;
  const oc = await order("pay_CONC1");
  record("3 concurrent attempts -> exactly one Razorpay refund, order Refunded",
    refunds.filter((r) => r.payment_id === "pay_CONC1").length === 1 && oc.refundStatus === "Refunded" &&
      conc.filter((c) => c.status === 200).length >= 1 && conc.every((c) => c.status === 200 || c.status === 409),
    `statuses=${conc.map((c) => c.status)} refunds=${refunds.filter((r) => r.payment_id === "pay_CONC1").length}`);

  // ---- 4. Razorpay refuses -> Failed, not completed; controlled retry succeeds ----
  await seedCancelledPaidOrder("pay_FAIL1");
  const okRefund = control.paymentsRefund;
  control.paymentsRefund = async () => { throw { statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "Refund is not allowed for this payment right now" } }; };
  const r4 = await call(await refundReq("pay_FAIL1", ADMIN));
  const o4 = await order("pay_FAIL1");
  record("4 Razorpay refusal -> Failed (never Refunded), reason kept, safe admin error",
    r4.status === 502 && o4.refundStatus === "Failed" && o4.refundLastError?.code === "BAD_REQUEST_ERROR" &&
      !o4.refundedAmount && !o4.refundTransactionId && typeof r4.body.error === "string" && !/secret|stack|key_/i.test(r4.body.error),
    `status=${r4.status} refundStatus=${o4.refundStatus} err=${r4.body.error}`);
  control.paymentsRefund = okRefund;
  const r4b = await call(await refundReq("pay_FAIL1", ADMIN));
  const o4b = await order("pay_FAIL1");
  record("4b retry after failure -> Refunded, one refund in total",
    r4b.status === 200 && o4b.refundStatus === "Refunded" && refunds.filter((r) => r.payment_id === "pay_FAIL1").length === 1 &&
      o4b.refundAttemptCount === 2 && !o4b.refundLastError);

  // ---- 5. lost response: Razorpay took it, then the call errored -> recovered, not repeated ----
  await seedCancelledPaidOrder("pay_LOST1");
  control.paymentsRefund = async (p: string, params: any) => { await okRefund(p, params); throw { statusCode: 504, error: { code: "GATEWAY_ERROR", description: "timeout" } }; };
  const r5 = await call(await refundReq("pay_LOST1", ADMIN));
  control.paymentsRefund = okRefund;
  const o5 = await order("pay_LOST1");
  record("5 timeout after Razorpay accepted -> recovered as Refunded, still one refund",
    r5.status === 200 && o5.refundStatus === "Refunded" && refunds.filter((r) => r.payment_id === "pay_LOST1").length === 1);

  // ---- 5b. unconfirmed and NOT taken -> Failed UNCONFIRMED; retry creates exactly one ----
  await seedCancelledPaidOrder("pay_LOST2");
  control.paymentsRefund = async () => { throw new Error("socket hang up"); };
  const r5b = await call(await refundReq("pay_LOST2", ADMIN));
  control.paymentsRefund = okRefund;
  const o5b = await order("pay_LOST2");
  const r5c = await call(await refundReq("pay_LOST2", ADMIN));
  record("5b unconfirmed -> Failed(UNCONFIRMED); retry -> one refund",
    r5b.status === 502 && o5b.refundStatus === "Failed" && o5b.refundLastError?.code === "UNCONFIRMED" &&
      r5c.status === 200 && refunds.filter((r) => r.payment_id === "pay_LOST2").length === 1);

  // ---- 6. already refunded (e.g. recorded manually) -> no Razorpay call ----
  await seedCancelledPaidOrder("pay_DONE1");
  await db.collection("orders").doc("pay_DONE1").update({ refundStatus: "Refunded", refundedAmount: 700, refundTransactionId: "UTR123" });
  const c6 = { ...control.calls };
  const r6 = await call(await refundReq("pay_DONE1", ADMIN));
  record("6 already-refunded order -> no Razorpay call, record untouched",
    r6.status === 200 && r6.body.alreadyRefunded === true && control.calls.paymentsFetch === c6.paymentsFetch &&
      control.calls.paymentsRefund === c6.paymentsRefund && (await order("pay_DONE1")).refundTransactionId === "UTR123");

  // ---- 7. wrong order/payment reference ----
  await seedCancelledPaidOrder("pay_REAL7", { docId: "legacyOrder7" });
  const c7 = { ...control.calls };
  const r7 = await call(await refundReq("legacyOrder7", ADMIN));
  record("7 order id != razorpayPaymentId -> refused, Razorpay never called",
    r7.status === 409 && control.calls.paymentsFetch === c7.paymentsFetch && control.calls.paymentsRefund === c7.paymentsRefund &&
      (await order("legacyOrder7")).refundStatus === "Required");
  await seedCancelledPaidOrder("pay_MISM7", { razorpayOrderId: "order_EXPECTED" });
  payments.get("pay_MISM7")!.order_id = "order_SOMEONE_ELSE";
  const r7b = await call(await refundReq("pay_MISM7", ADMIN));
  const o7b = await order("pay_MISM7");
  record("7b Razorpay payment belongs to another Razorpay order -> Failed(PAYMENT_MISMATCH), no refund",
    r7b.status === 409 && o7b.refundStatus === "Failed" && o7b.refundLastError?.code === "PAYMENT_MISMATCH" &&
      !refunds.some((r) => r.payment_id === "pay_MISM7"));
  await seedCancelledPaidOrder("pay_SMALL7", { amount: 700 });
  payments.get("pay_SMALL7")!.amount = 50000;
  const r7c = await call(await refundReq("pay_SMALL7", ADMIN));
  record("7c captured amount smaller than amount due -> refused, no refund",
    r7c.status === 409 && !refunds.some((r) => r.payment_id === "pay_SMALL7"));
  await db.collection("orders").doc("pay_NOTCANC").set({ ...(await order("pay_SMALL7")), status: "Confirmed", razorpayPaymentId: "pay_NOTCANC" });
  const r7d = await call(await refundReq("pay_NOTCANC", ADMIN));
  record("7d non-cancelled order -> refused", r7d.status === 409);
  const r7e = await call(await refundReq("pay_DOES_NOT_EXIST", ADMIN));
  record("7e unknown order -> 404", r7e.status === 404);

  // ---- 8. COD: cancellation owes no money; refund refused ----
  await db.collection("products").doc("p_cod").set({ name: "Kettle", stock: 5, sales: 1, vendorId: VENDOR });
  await db.collection("orders").doc("cod_8").set({
    userId: CUSTOMER, userEmail: `${CUSTOMER}@example.com`, vendorIds: [VENDOR], items: [{ id: "p_cod", qty: 1 }],
    paymentMethod: "COD", paymentStatus: "Pending", status: "Pending", finalTotal: 400, total: 400,
  });
  const cancel8 = await call(await cancelRoute(new Request("http://localhost/api/cancel-order", {
    method: "POST", headers: { authorization: `Bearer ${token(CUSTOMER)}`, "content-type": "application/json" }, body: JSON.stringify({ orderId: "cod_8" }),
  })));
  const o8 = await order("cod_8");
  const r8 = await call(await refundReq("cod_8", ADMIN));
  record("8 COD cancellation -> no refund obligation; refund refused; Razorpay not called",
    cancel8.status === 200 && o8.status === "Cancelled" && o8.refundStatus === undefined && r8.status === 409);

  // ---- 9. reward-assisted ONLINE order through the real cancel route ----
  await db.collection("users").doc("cust_rw").set({ email: "cust_rw@example.com", rewardPoints: 200 });
  await db.collection("orders").doc("pay_RW9").set({
    userId: "cust_rw", userEmail: "cust_rw@example.com", vendorIds: [VENDOR], items: [],
    paymentMethod: "ONLINE", paymentStatus: "Paid", status: "Pending", total: 1000, finalTotal: 700, rewardValue: 300, rewardShortfall: 0,
    // Deferred crediting: nothing was earned yet, so cancellation only restores the 300 spent.
    rewardPointsStatus: "pending",
    razorpayPaymentId: "pay_RW9", razorpayOrderId: "order_RW9",
  });
  payments.set("pay_RW9", { id: "pay_RW9", order_id: "order_RW9", status: "captured", amount: 70000, amount_refunded: 0, currency: "INR" });
  const c9 = await call(await cancelRoute(new Request("http://localhost/api/cancel-order", {
    method: "POST", headers: { authorization: `Bearer ${token("cust_rw")}`, "content-type": "application/json" }, body: JSON.stringify({ orderId: "pay_RW9" }),
  })));
  const afterCancelPts = (await db.collection("users").doc("cust_rw").get()).get("rewardPoints");
  const o9a = await order("pay_RW9");
  const r9 = await call(await refundReq("pay_RW9", ADMIN));
  const o9 = await order("pay_RW9");
  const afterRefundPts = (await db.collection("users").doc("cust_rw").get()).get("rewardPoints");
  record("9 reward-funded order: points returned once (cancel), money once (refund = finalTotal), no double value",
    c9.status === 200 && o9a.refundAmountDue === 700 && afterCancelPts === 500 && r9.status === 200 &&
      o9.refundedAmount === 700 && refunds.filter((r) => r.payment_id === "pay_RW9").map((r) => r.amount).join() === "70000" &&
      afterRefundPts === 500,
    `due=${o9a.refundAmountDue} pts cancel=${afterCancelPts} refund=${afterRefundPts} refunded=${o9.refundedAmount}`);

  // ---- 10. a refund already made by hand in the Razorpay dashboard ----
  await seedCancelledPaidOrder("pay_DASH10");
  refunds.push({ id: "rfnd_DASHBOARD", amount: 70000, status: "processed", payment_id: "pay_DASH10", notes: {} });
  payments.get("pay_DASH10")!.amount_refunded = 70000;
  const r10 = await call(await refundReq("pay_DASH10", ADMIN));
  const o10 = await order("pay_DASH10");
  record("10 existing (manual) Razorpay refund -> stops for reconciliation, no second refund, ids recorded",
    r10.status === 409 && o10.refundStatus === "Failed" && o10.refundLastError?.code === "EXISTING_REFUND" &&
      (o10.refundLastError?.existingRefundIds || []).includes("rfnd_DASHBOARD") &&
      refunds.filter((r) => r.payment_id === "pay_DASH10").length === 1);

  // ---- 11. pending at Razorpay -> Processing (never "refunded") -> sync -> Refunded ----
  refundStatusOnCreate = "pending";
  await seedCancelledPaidOrder("pay_PEND11");
  const r11 = await call(await refundReq("pay_PEND11", ADMIN));
  refundStatusOnCreate = "processed";
  const o11 = await order("pay_PEND11");
  const again11 = await call(await refundReq("pay_PEND11", ADMIN)); // click again while pending
  record("11 pending refund -> Processing, not Refunded; clicking again does not create another",
    r11.status === 200 && r11.body.refundStatus === "Processing" && o11.refundStatus === "Processing" && !o11.refundedAmount &&
      again11.status === 200 && refunds.filter((r) => r.payment_id === "pay_PEND11").length === 1);
  refunds.find((r) => r.payment_id === "pay_PEND11")!.status = "processed";
  const r11b = await call(await refundReq("pay_PEND11", ADMIN, { action: "sync" }));
  const o11b = await order("pay_PEND11");
  record("11b status sync after Razorpay processed -> Refunded",
    r11b.status === 200 && o11b.refundStatus === "Refunded" && o11b.refundedAmount === 700);

  // ---- 12. webhook settles a pending refund; a foreign refund changes nothing ----
  refundStatusOnCreate = "pending";
  await seedCancelledPaidOrder("pay_WH12");
  await refundReq("pay_WH12", ADMIN);
  refundStatusOnCreate = "processed";
  const pend = refunds.find((r) => r.payment_id === "pay_WH12")!;
  const hook = async (payload: unknown) => {
    const raw = JSON.stringify(payload);
    const sig = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex");
    return call(await webhookRoute(new Request("http://localhost/api/razorpay/webhook", { method: "POST", headers: { "x-razorpay-signature": sig }, body: raw })));
  };
  const foreign = await hook({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_FOREIGN", amount: 70000, status: "processed", payment_id: "pay_WH12", notes: { yomicoOrderId: "pay_WH12" } } } } });
  const oFor = await order("pay_WH12");
  const wh = await hook({ event: "refund.processed", payload: { refund: { entity: { ...pend, status: "processed" } } } });
  const oWh = await order("pay_WH12");
  const badSig = await call(await webhookRoute(new Request("http://localhost/api/razorpay/webhook", { method: "POST", headers: { "x-razorpay-signature": "00" }, body: JSON.stringify({ event: "refund.processed" }) })));
  record("12 webhook: foreign refund id ignored; matching refund.processed -> Refunded; bad signature rejected",
    foreign.status === 200 && oFor.refundStatus === "Processing" && wh.status === 200 && oWh.refundStatus === "Refunded" &&
      oWh.refundTransactionId === pend.id && badSig.status === 400);

  // ---- 13. authorization ----
  await seedCancelledPaidOrder("pay_AUTH13");
  const anon = await call(await refundReq("pay_AUTH13", null));
  const cust = await call(await refundReq("pay_AUTH13", token(CUSTOMER)));
  const seller = await call(await refundReq("pay_AUTH13", token(VENDOR)));
  const unverifiedOwner = await call(await refundReq("pay_AUTH13", token("x_uid", OWNER, false)));
  await db.collection("users").doc("forger").set({ role: "admin", isAdmin: true });
  const forged = await call(await refundReq("pay_AUTH13", token("forger")));
  record("13 refund API: anonymous 401, customer/seller/forged-role/unverified-owner 403, nothing refunded",
    anon.status === 401 && cust.status === 403 && seller.status === 403 && forged.status === 403 && unverifiedOwner.status === 403 &&
      !refunds.some((r) => r.payment_id === "pay_AUTH13") && (await order("pay_AUTH13")).refundStatus === "Required");

  // ---- 14. no Razorpay credentials -> not configured, nothing changes ----
  await seedCancelledPaidOrder("pay_CFG14");
  const nc = await executeOrderRefund({ orderId: "pay_CFG14", actor: { uid: "admin_uid", email: OWNER }, client: null });
  const o14 = await order("pay_CFG14");
  record("14 refund API not configured -> explicit not_configured, order unchanged (manual fallback stays)",
    nc.kind === "not_configured" && o14.refundStatus === "Required" && !o14.refundAttempt);

  // ---- 15. partial refunds: not supported by the order architecture ----
  const ours = refunds.filter((r) => r.notes?.yomicoOrderId);
  const dueMatches = await Promise.all(ours.map(async (r) => r.amount === Math.round(Number((await order(r.notes.yomicoOrderId)).refundAmountDue) * 100)));
  record("15 partial refund: every refund equals its order's stored refundAmountDue (item returns are reward points, not money)",
    ours.length > 0 && dueMatches.every(Boolean), `refunds=${ours.length}`);

  // ---- 16. nothing secret in any response or order record ----
  const allOrders = (await db.collection("orders").get()).docs.map((d) => JSON.stringify(d.data())).join("\n");
  record("16 no Razorpay secret in orders or responses",
    !allOrders.includes(process.env.RAZORPAY_KEY_SECRET!) && !JSON.stringify([r1, r4, r7, r10, r13Bodies()]).includes(process.env.RAZORPAY_KEY_SECRET!));
  function r13Bodies() { return [anon, cust, seller, forged]; }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error("HARNESS CRASH:", e?.message || e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 50));
