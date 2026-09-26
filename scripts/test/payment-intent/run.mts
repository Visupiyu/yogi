/*
 * LOCAL-ONLY emulator regression harness — ONE normal finalized payment per
 * payment intent (lib/onlineOrder.ts#finalizeOnlineOrder and
 * lib/mobileOnlineOrder.ts#finalizeMobileOnlineOrder), including LEGACY intents
 * finalized before the finalizedPaymentId claim existed.
 * ---------------------------------------------------------------------------
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (`razorpay` is aliased to the fake via
 * ../mobile-variant/tsconfig.harness.json), never reads the real service
 * account (a throwaway RSA key is generated). Auth is faked by intercepting
 * the Identity Toolkit fetch. Intents are created through the real
 * create-order / create-payment-order routes.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/payment-intent/run.mts"
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
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { finalizeOnlineOrder } = await import("../../../lib/onlineOrder.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { computeVendorShare } = await import("../../../lib/vendorEarnings.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const { control } = await import("../mobile-variant/control.mjs");

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

const VENDOR = "vendor_intent_1";
const PRODUCT = "prod_intent_1";
const START_STOCK = 100;
const START_POINTS = 500;

async function seed() {
  await db.collection("settings").doc("global").set({
    commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49,
  });
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true });
  await db.collection("products").doc(PRODUCT).set({
    name: "Intent Kettle", title: "Intent Kettle", sellingPrice: 1000, mrp: 1500, stock: START_STOCK, sales: 0,
    active: true, vendorId: VENDOR, vendorName: "Intent Traders",
  });
}

// ---- snapshots of every side effect a normal paid order produces ----
async function snapshot(uid: string, razorpayOrderId: string) {
  const product = (await db.collection("products").doc(PRODUCT).get()).data() as any;
  const orders = (await db.collection("orders").where("userId", "==", uid).get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const normal = orders.filter((o) => !o.duplicateIntentPayment);
  const duplicates = orders.filter((o) => !!o.duplicateIntentPayment);
  const redemptions = (await db.collection("couponRedemptions").where("userId", "==", uid).get()).docs.map((d) => d.data() as any);
  const user = (await db.collection("users").doc(uid).get()).data() as any;
  const ledger = (await db.collection("rewardTransactions").where("userId", "==", uid).get()).size;
  const intent = (await db.collection("paymentIntents").doc(razorpayOrderId).get()).data() as any;
  const sellerVisible = (await db.collection("orders").where("vendorIds", "array-contains", VENDOR).where("userId", "==", uid).get()).size;
  const allNotifications = (await db.collection("notifications").get()).docs.map((d) => d.data() as any);
  const dupAlerts = allNotifications.filter((n) => String(n.title).includes("Duplicate payment")).length;
  const customerPlaced = allNotifications.filter((n) => n.userId === uid).length;
  return {
    stock: Number(product?.stock), sales: Number(product?.sales),
    normal, duplicates, redemptions, points: Number(user?.rewardPoints ?? NaN), ledger, intent,
    sellerVisible, dupAlerts, customerPlaced, allNotifications: allNotifications.length,
  };
}

function isInertDuplicate(o: any, duplicateOf: string) {
  return o.needsReview === true && o.duplicateIntentPayment === duplicateOf && o.status === "Cancelled" &&
    o.paymentStatus === "Paid" && o.refundStatus === "Required" && Number(o.refundAmountDue) === Number(o.finalTotal) &&
    Array.isArray(o.vendorIds) && o.vendorIds.length === 0 && Array.isArray(o.items) && o.items.length === 0 &&
    o.rewardPointsStatus === undefined && o.orderNumber === undefined && o.paymentNumber === undefined &&
    typeof o.razorpayPaymentId === "string" && typeof o.razorpayOrderId === "string";
}

// ---- web ----
async function webIntent(uid: string, opts: { coupon?: boolean; points?: boolean } = {}) {
  await db.collection("users").doc(uid).set({ rewardPoints: START_POINTS }, { merge: true });
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", {
    customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road",
    items: [{ id: PRODUCT, qty: 1 }],
    ...(opts.coupon ? { couponCode: "SAVE10" } : {}),
    ...(opts.points ? { redeemPoints: true } : {}),
  }, uid));
  const j = await res.json();
  const intent = (await db.collection("paymentIntents").doc(j.id).get()).data() as any;
  if (!intent) throw new Error(`web intent not created: ${JSON.stringify(j)}`);
  return { razorpayOrderId: j.id as string, intent };
}
const webFinalize = (i: { razorpayOrderId: string; intent: any }, paymentId: string, source = "browser") =>
  finalizeOnlineOrder({ razorpayPaymentId: paymentId, razorpayOrderId: i.razorpayOrderId, intent: i.intent, capturedAmountPaise: i.intent.expectedAmountPaise, source });

// ---- mobile ----
async function mobileIntent(uid: string, opts: { coupon?: boolean } = {}) {
  const existing = await db.collection("cart").where("userId", "==", uid).get();
  for (const d of existing.docs) await d.ref.delete();
  await db.collection("cart").add({ userId: uid, savedForLater: false, productId: PRODUCT, quantity: 1, name: "x", price: 1 });
  control.reset();
  const res = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", {
    customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road", deliverySlot: "",
    ...(opts.coupon ? { couponCode: "SAVE10" } : {}),
  }, uid));
  const j = await res.json();
  const intent = (await db.collection("paymentIntents").doc(j.razorpayOrderId).get()).data() as any;
  if (!intent) throw new Error(`mobile intent not created: ${JSON.stringify(j)}`);
  return { razorpayOrderId: j.razorpayOrderId as string, intent };
}
const mobileFinalize = (i: { razorpayOrderId: string; intent: any }, paymentId: string, source = "mobile-app") =>
  finalizeMobileOnlineOrder({ razorpayPaymentId: paymentId, razorpayOrderId: i.razorpayOrderId, intent: i.intent, capturedAmountPaise: i.intent.expectedAmountPaise, source });

async function main() {
  await clearAll();
  await seed();

  for (const platform of ["web", "mobile"] as const) {
    const P = platform === "web" ? "W" : "M";
    const create = (uid: string, opts: any) => (platform === "web" ? webIntent(uid, opts) : mobileIntent(uid, opts));
    const finalize = (i: any, pid: string, src?: string) => (platform === "web" ? webFinalize(i, pid, src) : mobileFinalize(i, pid, src));
    const opts = platform === "web" ? { coupon: true, points: true } : { coupon: true };

    // ---- A. one intent + payment A ----
    const uidA = `buyer_${platform}_a`;
    const iA = await create(uidA, opts);
    const beforeA = await snapshot(uidA, iA.razorpayOrderId);
    const rA = await finalize(iA, `pay_${P}_A1`);
    const a = await snapshot(uidA, iA.razorpayOrderId);
    const normalA = a.normal[0];
    record(`${P}.A one intent + payment A -> one normal order, intent.finalizedPaymentId = A, effects exactly once`,
      rA.kind === "created" && a.normal.length === 1 && a.duplicates.length === 0 && a.intent?.finalizedPaymentId === `pay_${P}_A1` &&
      a.stock === beforeA.stock - 1 && a.sales === beforeA.sales + 1 && a.redemptions.length === 1 &&
      a.redemptions[0].orderId === `pay_${P}_A1` && a.sellerVisible === 1 && typeof normalA?.orderNumber === "string" &&
      (platform === "mobile" || (a.points < START_POINTS && a.ledger === 1)),
      `kind=${rA.kind} normal=${a.normal.length} finalized=${a.intent?.finalizedPaymentId} stock ${beforeA.stock}->${a.stock} sales ${beforeA.sales}->${a.sales} redemptions=${a.redemptions.length} points=${a.points} ledger=${a.ledger}`);

    // ---- B. retry payment A ----
    const rB = await finalize(iA, `pay_${P}_A1`, "webhook");
    const b = await snapshot(uidA, iA.razorpayOrderId);
    record(`${P}.B retry payment A (webhook after callback) -> idempotent, nothing repeated`,
      rB.kind === "already" && b.normal.length === 1 && b.duplicates.length === 0 && b.stock === a.stock && b.sales === a.sales &&
      b.redemptions.length === 1 && Object.is(b.points, a.points) && b.ledger === a.ledger && b.allNotifications === a.allNotifications &&
      b.intent?.finalizedPaymentId === `pay_${P}_A1`,
      `kind=${rB.kind} orders=${b.normal.length}/${b.duplicates.length} stock=${b.stock} notifications ${a.allNotifications}->${b.allNotifications}`);

    // ---- C. payment A and payment C concurrently on ONE intent ----
    const uidC = `buyer_${platform}_c`;
    const iC = await create(uidC, opts);
    const beforeC = await snapshot(uidC, iC.razorpayOrderId);
    const [r1, r2] = await Promise.all([finalize(iC, `pay_${P}_C_first`), finalize(iC, `pay_${P}_C_second`)]);
    const c = await snapshot(uidC, iC.razorpayOrderId);
    const winner = c.intent?.finalizedPaymentId;
    const loser = winner === `pay_${P}_C_first` ? `pay_${P}_C_second` : `pay_${P}_C_first`;
    const dup = c.duplicates[0];
    record(`${P}.C concurrent A+C on one intent -> exactly one normal order; the other an inert duplicate pointing at the winner`,
      [r1.kind, r2.kind].every((k) => k === "created" || k === "already") &&
      (winner === `pay_${P}_C_first` || winner === `pay_${P}_C_second`) &&
      c.normal.length === 1 && c.normal[0].id === winner && c.duplicates.length === 1 && dup?.id === loser &&
      isInertDuplicate(dup, winner),
      `winner=${winner} loser=${loser} normal=${c.normal.map((o) => o.id)} dup=${dup?.id} dupOf=${dup?.duplicateIntentPayment} status=${dup?.status} refund=${dup?.refundStatus}`);
    record(`${P}.C duplicate path repeats NO economic/fulfilment effect (stock, sales, coupon, points, ledger, seller, numbers)`,
      c.stock === beforeC.stock - 1 && c.sales === beforeC.sales + 1 && c.redemptions.length === 1 && c.redemptions[0].orderId === winner &&
      c.sellerVisible === 1 && computeVendorShare(dup as any, VENDOR) === null &&
      (platform === "mobile" || (c.points === START_POINTS - (START_POINTS - a.points) && c.ledger === 1)),
      `stock ${beforeC.stock}->${c.stock} sales ${beforeC.sales}->${c.sales} redemptions=${c.redemptions.length}->${c.redemptions[0]?.orderId} sellerVisible=${c.sellerVisible} points=${c.points} ledger=${c.ledger}`);
    record(`${P}.C exactly one duplicate-payment admin alert; no customer/seller notification for the duplicate`,
      c.dupAlerts === (beforeC.dupAlerts + 1) && c.customerPlaced === (platform === "web" ? beforeC.customerPlaced + 1 : beforeC.customerPlaced),
      `dupAlerts ${beforeC.dupAlerts}->${c.dupAlerts} customerNotifications ${beforeC.customerPlaced}->${c.customerPlaced}`);
    const rRetryDup = await finalize(iC, loser, "webhook");
    const c2 = await snapshot(uidC, iC.razorpayOrderId);
    record(`${P}.C retrying the duplicate payment -> idempotent: no second record, no second alert`,
      rRetryDup.kind === "already" && c2.duplicates.length === 1 && c2.dupAlerts === c.dupAlerts && c2.stock === c.stock,
      `kind=${rRetryDup.kind} duplicates=${c2.duplicates.length} alerts=${c2.dupAlerts}`);

    // ---- D. reverse order: the OTHER payment id commits first ----
    const uidD = `buyer_${platform}_d`;
    const iD = await create(uidD, opts);
    await finalize(iD, `pay_${P}_D_zzz`);
    await finalize(iD, `pay_${P}_D_aaa`);
    const d = await snapshot(uidD, iD.razorpayOrderId);
    record(`${P}.D reverse order -> whichever commits first (pay_${P}_D_zzz) is the normal payment; the other is the duplicate`,
      d.intent?.finalizedPaymentId === `pay_${P}_D_zzz` && d.normal.length === 1 && d.normal[0].id === `pay_${P}_D_zzz` &&
      d.duplicates.length === 1 && d.duplicates[0].id === `pay_${P}_D_aaa` && isInertDuplicate(d.duplicates[0], `pay_${P}_D_zzz`),
      `finalized=${d.intent?.finalizedPaymentId} normal=${d.normal.map((o) => o.id)} dup=${d.duplicates.map((o) => o.id)}`);

    // ---- E. two separate intents (two checkouts) ----
    const uidE = `buyer_${platform}_e`;
    const iE1 = await create(uidE, {});
    const iE2 = await create(uidE, {});
    const beforeE = await snapshot(uidE, iE1.razorpayOrderId);
    const [e1, e2] = await Promise.all([finalize(iE1, `pay_${P}_E1`), finalize(iE2, `pay_${P}_E2`)]);
    const e = await snapshot(uidE, iE1.razorpayOrderId);
    const e2Intent = (await db.collection("paymentIntents").doc(iE2.razorpayOrderId).get()).data() as any;
    record(`${P}.E two separate intents -> two legitimate orders, no false duplicate`,
      e1.kind === "created" && e2.kind === "created" && e.normal.length === 2 && e.duplicates.length === 0 &&
      e.stock === beforeE.stock - 2 && e.intent?.finalizedPaymentId === `pay_${P}_E1` && e2Intent?.finalizedPaymentId === `pay_${P}_E2`,
      `kinds=${e1.kind}/${e2.kind} normal=${e.normal.length} duplicates=${e.duplicates.length} stock ${beforeE.stock}->${e.stock}`);
  }

  // ============ LEGACY intents (finalized before finalizedPaymentId existed) ============
  // A legacy state is built from a REAL finalization: finalize payment L1, then
  // strip the intent's claim fields — exactly what an intent finalized by the
  // pre-claim code looks like (normal order present, no finalizedPaymentId).
  for (const platform of ["web", "mobile"] as const) {
    const P = platform === "web" ? "W" : "M";
    const create = (uid: string, opts: any) => (platform === "web" ? webIntent(uid, opts) : mobileIntent(uid, opts));
    const finalize = (i: any, pid: string, src?: string) => (platform === "web" ? webFinalize(i, pid, src) : mobileFinalize(i, pid, src));
    const opts = platform === "web" ? { coupon: true, points: true } : { coupon: true };
    const makeLegacy = async (i: { razorpayOrderId: string }) =>
      db.collection("paymentIntents").doc(i.razorpayOrderId).update({ finalizedPaymentId: FieldValue.delete(), finalizedAt: FieldValue.delete() });

    // ---- A1. legacy intent with a normal paid order + a NEW payment ----
    const uidL = `buyer_${platform}_legacy`;
    const iL = await create(uidL, opts);
    await finalize(iL, `pay_${P}_L1`);
    await makeLegacy(iL);
    const legacyOrder = (await db.collection("orders").doc(`pay_${P}_L1`).get()).data() as any;
    const l0 = await snapshot(uidL, iL.razorpayOrderId);
    const rL2 = await finalize(iL, `pay_${P}_L2`, "webhook");
    const l1 = await snapshot(uidL, iL.razorpayOrderId);
    record(`${P}.LA legacy intent (order exists, no finalizedPaymentId) + new payment -> inert duplicate, intent claim backfilled to the legacy payment`,
      l0.intent?.finalizedPaymentId === undefined && rL2.kind === "already" &&
      l1.normal.length === 1 && l1.normal[0].id === `pay_${P}_L1` && l1.duplicates.length === 1 &&
      l1.duplicates[0].id === `pay_${P}_L2` && isInertDuplicate(l1.duplicates[0], `pay_${P}_L1`) &&
      l1.intent?.finalizedPaymentId === `pay_${P}_L1` &&
      l1.intent?.finalizedAt?.toMillis?.() === legacyOrder?.createdAt?.toMillis?.(),
      `before.finalized=${l0.intent?.finalizedPaymentId} kind=${rL2.kind} normal=${l1.normal.map((o) => o.id)} dup=${l1.duplicates.map((o) => o.id)} finalized=${l1.intent?.finalizedPaymentId}`);
    record(`${P}.LA legacy duplicate repeats NO effect (stock, sales, coupon, points, ledger, seller); exactly one duplicate alert`,
      l1.stock === l0.stock && l1.sales === l0.sales && l1.redemptions.length === 1 && l1.redemptions[0].orderId === `pay_${P}_L1` &&
      Object.is(l1.points, l0.points) && l1.ledger === l0.ledger && l1.sellerVisible === 1 &&
      l1.dupAlerts === l0.dupAlerts + 1 && l1.customerPlaced === l0.customerPlaced,
      `stock ${l0.stock}->${l1.stock} sales ${l0.sales}->${l1.sales} redemptions=${l1.redemptions.length} points ${l0.points}->${l1.points} ledger ${l0.ledger}->${l1.ledger} alerts ${l0.dupAlerts}->${l1.dupAlerts}`);

    // ---- B. retries on the legacy intent stay idempotent ----
    const rRetryDup = await finalize(iL, `pay_${P}_L2`);
    const rRetryLegacy = await finalize(iL, `pay_${P}_L1`, "webhook");
    const l2 = await snapshot(uidL, iL.razorpayOrderId);
    record(`${P}.LB retrying the new AND the legacy payment -> idempotent, nothing repeated`,
      rRetryDup.kind === "already" && rRetryLegacy.kind === "already" && l2.normal.length === 1 && l2.duplicates.length === 1 &&
      l2.stock === l1.stock && l2.sales === l1.sales && l2.dupAlerts === l1.dupAlerts && l2.allNotifications === l1.allNotifications,
      `kinds=${rRetryDup.kind}/${rRetryLegacy.kind} orders=${l2.normal.length}/${l2.duplicates.length} alerts=${l2.dupAlerts}`);

    // ---- A2. legacy order later cancelled with a refund owed still counts ----
    const uidX = `buyer_${platform}_legacy_cancelled`;
    const iX = await create(uidX, {});
    await finalize(iX, `pay_${P}_X1`);
    await makeLegacy(iX);
    await db.collection("orders").doc(`pay_${P}_X1`).update({ status: "Cancelled", refundStatus: "Required", refundAmountDue: 1 });
    const x0 = await snapshot(uidX, iX.razorpayOrderId);
    await finalize(iX, `pay_${P}_X2`);
    const x1 = await snapshot(uidX, iX.razorpayOrderId);
    record(`${P}.LA2 legacy order that was later cancelled/refund-owed is still the finalized payment (status not consulted)`,
      x1.duplicates.length === 1 && x1.duplicates[0].id === `pay_${P}_X2` && x1.normal.length === 1 &&
      x1.intent?.finalizedPaymentId === `pay_${P}_X1` && x1.stock === x0.stock,
      `dup=${x1.duplicates.map((o) => o.id)} finalized=${x1.intent?.finalizedPaymentId} stock ${x0.stock}->${x1.stock}`);

    // ---- A3. an inert duplicate record is NEVER mistaken for the original ----
    const uidR = `buyer_${platform}_review_only`;
    const iR = await create(uidR, {});
    await db.collection("orders").doc(`pay_${P}_R0`).set({
      userId: uidR, razorpayOrderId: iR.razorpayOrderId, razorpayPaymentId: `pay_${P}_R0`, paymentMethod: "ONLINE",
      paymentStatus: "Paid", status: "Cancelled", duplicateIntentPayment: "pay_someone_else", vendorIds: [], items: [],
    });
    const rv0 = await snapshot(uidR, iR.razorpayOrderId);
    const rR1 = await finalize(iR, `pay_${P}_R1`);
    const rv1 = await snapshot(uidR, iR.razorpayOrderId);
    record(`${P}.LA3 intent whose only matching record is an inert duplicate -> new payment claims NORMALLY`,
      rR1.kind === "created" && rv1.intent?.finalizedPaymentId === `pay_${P}_R1` &&
      rv1.normal.some((o) => o.id === `pay_${P}_R1`) && rv1.stock === rv0.stock - 1,
      `kind=${rR1.kind} finalized=${rv1.intent?.finalizedPaymentId} stock ${rv0.stock}->${rv1.stock}`);

    // ---- F. concurrency on a LEGACY intent: two new payments at once ----
    const uidF = `buyer_${platform}_legacy_race`;
    const iF = await create(uidF, {});
    await finalize(iF, `pay_${P}_F1`);
    await makeLegacy(iF);
    const f0 = await snapshot(uidF, iF.razorpayOrderId);
    const [f1r, f2r] = await Promise.all([finalize(iF, `pay_${P}_F2`), finalize(iF, `pay_${P}_F3`)]);
    const f1 = await snapshot(uidF, iF.razorpayOrderId);
    record(`${P}.LF two new payments racing on a legacy intent -> both inert duplicates, legacy stays the one normal order`,
      f1r.kind === "already" && f2r.kind === "already" && f1.normal.length === 1 && f1.normal[0].id === `pay_${P}_F1` &&
      f1.duplicates.length === 2 && f1.duplicates.every((o) => isInertDuplicate(o, `pay_${P}_F1`)) &&
      f1.intent?.finalizedPaymentId === `pay_${P}_F1` && f1.stock === f0.stock && f1.sales === f0.sales &&
      f1.dupAlerts === f0.dupAlerts + 2,
      `kinds=${f1r.kind}/${f2r.kind} normal=${f1.normal.map((o) => o.id)} dups=${f1.duplicates.map((o) => o.id)} finalized=${f1.intent?.finalizedPaymentId} stock ${f0.stock}->${f1.stock}`);
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
    console.log("ALL PAYMENT-INTENT SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
