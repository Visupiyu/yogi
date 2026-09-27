/*
 * LOCAL-ONLY emulator regression harness — Seller Order & Fulfillment
 * (app/api/seller/advance-item, app/api/cancel-order, app/api/item-request/transition).
 * ---------------------------------------------------------------------------
 * Proves: a seller acts only on their OWN items; they control only the
 * seller-side stages (Confirmed -> Packed -> Shipped handover, and handover
 * only when no Delivery Engine job covers the shipment); Out For Delivery and
 * Delivered — the milestones that make an order settlement-eligible — belong
 * to the Delivery Engine / admin; duplicate, stale and concurrent requests
 * advance an item at most once; cancelled orders never advance; every advance
 * is audit-logged; a seller can cancel only an order that is entirely theirs,
 * before handover and before a delivery company has it; admin cancellation is
 * judged per item; stock is restored exactly once; and return / replacement
 * steps need an Approved seller, who can never self-certify a replacement
 * delivered.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/seller-orders/run.mts"
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
const { POST: confirmOrder } = await import("../../../app/api/confirm-order/route.ts");
const { POST: advanceItem } = await import("../../../app/api/seller/advance-item/route.ts");
const { POST: cancelOrder } = await import("../../../app/api/cancel-order/route.ts");
const { POST: transition } = await import("../../../app/api/item-request/transition/route.ts");
const { GET: sellerPayable } = await import("../../../app/api/seller/payable/route.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = [
  "cart", "paymentIntents", "orders", "sellerOrders", "products", "notifications", "vendors", "vendors_public",
  "settings", "counters", "rateLimits", "withdrawals", "vendor_payouts", "itemRequests", "returns", "users",
  "deliveryJobs", "audit_logs", "coupons", "couponRedemptions",
];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const ADMIN_UID = "admin_orders_1";
const A = "seller_ord_a";
const B = "seller_ord_b";
const X = "seller_ord_blocked";
const BUYER = "buyer_ord_1";

function req(url: string, body: unknown, uid: string | null, email = uid ? `${uid}@example.com` : "") {
  return new Request(url, {
    method: "POST",
    headers: { ...(uid ? { authorization: `Bearer test:${uid}:${email}:true` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }
const call = async (fn: (r: Request) => Promise<Response>, url: string, body: unknown, uid: string | null, email?: string) => {
  const res = await fn(req(url, body, uid, email));
  return { status: res.status, body: await json(res) };
};
const advance = (uid: string | null, body: unknown, email?: string) => call(advanceItem, "http://x/api/seller/advance-item", body, uid, email);
const adminAdvance = (body: unknown) => advance(ADMIN_UID, body, ADMIN_EMAIL);
const cancel = (uid: string, orderId: string, email?: string) => call(cancelOrder, "http://x/api/cancel-order", { orderId }, uid, email);
const move = (uid: string, requestId: string, toStatus: string, email?: string) =>
  call(transition, "http://x/api/item-request/transition", { requestId, toStatus }, uid, email);

const BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };
let n = 0;
const key = () => `ordkey${++n}x${Date.now()}`;
async function placeAndConfirm(items: { id: string; qty: number }[]) {
  const placed = await json(await webPlaceOrder(req("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: key(), items }, BUYER)));
  const orderId = placed.orderId as string;
  await confirmOrder(req("http://x/api/confirm-order", { orderId }, ADMIN_UID, ADMIN_EMAIL));
  return orderId;
}
async function rec(orderId: string, vendor: string) {
  return (await db.collection("sellerOrders").doc(`${orderId}_${vendor}`).get()).data() as any;
}
function firstKey(r: any): string { return Object.keys(r?.itemFulfilment || {})[0]; }
async function stock(id: string) { return Number((await db.collection("products").doc(id).get()).data()?.stock); }
async function orderOf(id: string) { return (await db.collection("orders").doc(id).get()).data() as any; }

async function seed() {
  await db.collection("settings").doc("global").set({ freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  for (const [uid, status] of [[A, "Approved"], [B, "Approved"], [X, "Blocked"]] as const) {
    await db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status, kycStatus: status, taxProfile: { gstStatus: "UNREGISTERED" } });
  }
  for (const [id, vendorId, price] of [["p_a", A, 300], ["p_a2", A, 200], ["p_b", B, 250], ["p_x", X, 100]] as const) {
    await db.collection("products").doc(id).set({
      title: `Item ${id}`, name: `Item ${id}`, price, sellingPrice: price, mrp: price * 2, gstRate: 0, gstPercent: 0,
      stock: 50, sales: 0, active: true, approvalStatus: "approved", approved: true, vendorId, vendorName: `Shop ${vendorId}`,
    });
  }
}

try {
  await clearAll();
  await seed();

  // Orders: M = A+B (multi-seller), S1..S3 = A only, XO = blocked seller X only.
  const M = await placeAndConfirm([{ id: "p_a", qty: 1 }, { id: "p_b", qty: 1 }]);
  const S1 = await placeAndConfirm([{ id: "p_a", qty: 2 }]);
  const S2 = await placeAndConfirm([{ id: "p_a2", qty: 1 }]);
  const S3 = await placeAndConfirm([{ id: "p_a2", qty: 1 }]);
  const XO = await placeAndConfirm([{ id: "p_x", qty: 1 }]);
  const mA = `${M}_${A}`, mB = `${M}_${B}`;
  const kA = firstKey(await rec(M, A)), kB = firstKey(await rec(M, B));

  // ============ 1. Authentication / isolation ============
  const iso: Record<string, number> = {
    signedOut: (await advance(null, { recordId: mA, itemKey: kA, fromStatus: "Confirmed" })).status,
    customer: (await advance(BUYER, { recordId: mA, itemKey: kA, fromStatus: "Confirmed" })).status,
    otherSellerOnSameOrder: (await advance(B, { recordId: mA, itemKey: kA, fromStatus: "Confirmed" })).status,
    otherSellerRecordIdGuess: (await advance(A, { recordId: mB, itemKey: kB, fromStatus: "Confirmed" })).status,
    blockedOwnRecord: (await advance(X, { recordId: `${XO}_${X}`, itemKey: firstKey(await rec(XO, X)), fromStatus: "Confirmed" })).status,
    unknownRecord: (await advance(A, { recordId: "no_such_record", itemKey: kA, fromStatus: "Confirmed" })).status,
    unknownItem: (await advance(A, { recordId: mA, itemKey: "i9_nope", fromStatus: "Confirmed" })).status,
    missingFields: (await advance(A, { recordId: mA })).status,
  };
  const recB0 = await rec(M, B);
  record("1  advance-item: signed-out 401; customer and seller B on A's record 403 (a guessed record id is useless); blocked seller 403; unknown record/item 404; missing fields 400 — B's record untouched",
    iso.signedOut === 401 && iso.customer === 403 && iso.otherSellerOnSameOrder === 403 && iso.otherSellerRecordIdGuess === 403 &&
    iso.blockedOwnRecord === 403 && iso.unknownRecord === 404 && iso.unknownItem === 404 && iso.missingFields === 400 &&
    recB0.itemFulfilment[kB].status === "Confirmed",
    JSON.stringify(iso));

  // ============ 2. Seller transitions, idempotency ============
  const noFrom = await advance(A, { recordId: mA, itemKey: kA });
  const pack = await advance(A, { recordId: mA, itemKey: kA, fromStatus: "Confirmed", status: "Delivered", vendorId: B, toStatus: "Delivered" });
  const dup = await advance(A, { recordId: mA, itemKey: kA, fromStatus: "Confirmed" });
  const afterDup = (await rec(M, A)).itemFulfilment[kA].status;
  record("2  seller Confirmed -> Packed needs the stage they saw: without fromStatus 409; with it 200 (extra status/vendorId in the body ignored — exactly one step); a duplicate of the same click 409, still Packed",
    noFrom.status === 409 && pack.status === 200 && pack.body.itemStatus === "Packed" && dup.status === 409 && afterDup === "Packed",
    `noFrom=${noFrom.status} pack=${pack.status}/${pack.body.itemStatus} dup=${dup.status} now=${afterDup}`);

  const ship = await advance(A, { recordId: mA, itemKey: kA, fromStatus: "Packed" });
  const ofd = await advance(A, { recordId: mA, itemKey: kA, fromStatus: "Shipped" });
  const recA = await rec(M, A);
  const mOrder = await orderOf(M);
  record("3  seller hands over (Packed -> Shipped, no delivery job) but can NOT mark Out For Delivery (403); A's progress never moves B's record; the order summary stays at the least-advanced item (Confirmed)",
    ship.status === 200 && ship.body.itemStatus === "Shipped" && ofd.status === 403 && recA.itemFulfilment[kA].status === "Shipped" &&
    (await rec(M, B)).itemFulfilment[kB].status === "Confirmed" && mOrder.status === "Confirmed",
    `ship=${ship.status} ofd=${ofd.status} order=${mOrder.status}`);

  // ============ 4. Concurrency ============
  const kS1 = firstKey(await rec(S1, A));
  const burst = await Promise.all(Array.from({ length: 5 }, () => advance(A, { recordId: `${S1}_${A}`, itemKey: kS1, fromStatus: "Confirmed" })));
  const s1Status = (await rec(S1, A)).itemFulfilment[kS1].status;
  record("4  five concurrent identical advances -> exactly one 200, the rest 409; the item moved exactly one stage (Packed)",
    burst.filter((r) => r.status === 200).length === 1 && burst.filter((r) => r.status === 409).length === 4 && s1Status === "Packed",
    `statuses=${burst.map((r) => r.status).join(",")} now=${s1Status}`);

  // ============ 5. Delivery milestones are admin / Delivery Engine only ============
  const adminOfd = await adminAdvance({ recordId: mA, itemKey: kA });
  const sellerDelivered = await advance(A, { recordId: mA, itemKey: kA, fromStatus: "Out For Delivery" });
  const adminDelivered = await adminAdvance({ recordId: mA, itemKey: kA, fromStatus: "Out For Delivery" });
  record("5  Out For Delivery and Delivered: seller 403; admin may record them (admin fromStatus optional, honoured when sent)",
    adminOfd.status === 200 && sellerDelivered.status === 403 && adminDelivered.status === 200 &&
    (await rec(M, A)).itemFulfilment[kA].status === "Delivered",
    `adminOfd=${adminOfd.status} sellerDelivered=${sellerDelivered.status} adminDelivered=${adminDelivered.status}`);

  // ============ 6. With a Delivery Engine job ============
  const kS2 = firstKey(await rec(S2, A));
  await db.collection("deliveryJobs").doc(`${S2}_${A}`).set({ orderId: S2, vendorId: A, status: "AcceptedByCompany" });
  const s2Pack = await advance(A, { recordId: `${S2}_${A}`, itemKey: kS2, fromStatus: "Confirmed" });
  const s2Ship = await advance(A, { recordId: `${S2}_${A}`, itemKey: kS2, fromStatus: "Packed" });
  record("6  shipment covered by a delivery job: seller may pack (ready for pickup) but NOT hand over (409 — the company's pickup scan records it)",
    s2Pack.status === 200 && s2Ship.status === 409 && (await rec(S2, A)).itemFulfilment[kS2].status === "Packed",
    `pack=${s2Pack.status} ship=${s2Ship.status}`);

  // ============ 7. Seller cannot reach settlement by themselves ============
  const payable = await json(await sellerPayable(new Request("http://x/api/seller/payable", { headers: { authorization: `Bearer test:${A}:${A}@example.com:true` } })));
  record("7  after everything a seller can do, none of A's orders is settlement-eligible (payable 0; Pay on Delivery orders stay unpaid until admin verification)",
    payable.breakdown?.eligibleOrders === 0 && payable.payable === 0,
    JSON.stringify({ eligible: payable.breakdown?.eligibleOrders, payable: payable.payable }));

  // ============ 8. Audit trail ============
  const audits = (await db.collection("audit_logs").where("action", "==", "order_item_advanced").get()).docs.map((d) => d.data());
  record("8  every successful advance (and only those) is audit-logged with actor, from/to and seller/admin",
    audits.length === 6 && audits.some((a) => a.details?.from === "Confirmed" && a.details?.to === "Packed" && a.actorUid === A && a.details?.by === "seller") &&
    audits.some((a) => a.details?.to === "Delivered" && a.details?.by === "admin"),
    `count=${audits.length}`);

  // ============ 9. Seller cancellation ============
  const mStockA0 = await stock("p_a"), mStockB0 = await stock("p_b");
  const cancelMultiA = await cancel(A, M);
  const cancelMultiB = await cancel(B, M);
  record("9  multi-seller order: neither seller can cancel it (409 — contact support); nothing restocked, order not cancelled",
    cancelMultiA.status === 409 && cancelMultiB.status === 409 && (await orderOf(M)).status !== "Cancelled" &&
    (await stock("p_a")) === mStockA0 && (await stock("p_b")) === mStockB0,
    `A=${cancelMultiA.status} B=${cancelMultiB.status}`);

  const shippedSole = await placeAndConfirm([{ id: "p_a2", qty: 1 }]);
  const kSh = firstKey(await rec(shippedSole, A));
  await advance(A, { recordId: `${shippedSole}_${A}`, itemKey: kSh, fromStatus: "Confirmed" });
  await advance(A, { recordId: `${shippedSole}_${A}`, itemKey: kSh, fromStatus: "Packed" });
  const cancelShipped = await cancel(A, shippedSole);
  const cancelJob = await (async () => {
    await db.collection("deliveryJobs").doc(`${S2}_${A}`).update({ status: "InProgress" });
    return cancel(A, S2);
  })();
  const cancelBlocked = await cancel(X, XO);
  const cancelStranger = await cancel(B, S3);
  record("10 seller cancel refused: after handover (409), once the delivery company has the parcel (409), blocked seller (403), a seller not on the order (404)",
    cancelShipped.status === 409 && cancelJob.status === 409 && cancelBlocked.status === 403 && cancelStranger.status === 404,
    `shipped=${cancelShipped.status} collected=${cancelJob.status} blocked=${cancelBlocked.status} stranger=${cancelStranger.status}`);

  const s3Stock0 = await stock("p_a2");
  const soleCancel = await cancel(A, S3);
  const s3Stock1 = await stock("p_a2");
  const again = await cancel(A, S3);
  const s3Stock2 = await stock("p_a2");
  const advanceCancelled = await advance(A, { recordId: `${S3}_${A}`, itemKey: firstKey(await rec(S3, A)), fromStatus: "Confirmed" });
  record("11 sole-seller order before handover: seller cancels (200), stock restored exactly once (+1), a repeat is a no-op; a cancelled order's items can no longer advance (409)",
    soleCancel.status === 200 && (await orderOf(S3)).status === "Cancelled" && s3Stock1 === s3Stock0 + 1 &&
    again.status === 200 && s3Stock2 === s3Stock1 && advanceCancelled.status === 409,
    `cancel=${soleCancel.status} stock ${s3Stock0}->${s3Stock1}->${s3Stock2} advance=${advanceCancelled.status}`);

  // ============ 12. Admin cancellation is judged per item ============
  const adminCancelM = await cancel(ADMIN_UID, M, ADMIN_EMAIL);
  const M2 = await placeAndConfirm([{ id: "p_a", qty: 1 }, { id: "p_b", qty: 1 }]);
  const adminCancelM2 = await cancel(ADMIN_UID, M2, ADMIN_EMAIL);
  record("12 admin: multi-seller order whose summary reads Confirmed but where A's item is already delivered -> refused (409, B's goods and A's delivery untouched); all items still pre-handover -> cancelled (200)",
    adminCancelM.status === 409 && (await orderOf(M)).status !== "Cancelled" && adminCancelM2.status === 200 && (await orderOf(M2)).status === "Cancelled",
    `M=${adminCancelM.status} M2=${adminCancelM2.status}`);

  // ============ 13. Returns / replacements ============
  const irBase = { userId: BUYER, orderId: M, productId: "p_a", item: { qty: 1, name: "Item p_a", unitPrice: 300 }, history: [] };
  await db.collection("itemRequests").doc("ir_replace").set({ ...irBase, type: "replace", status: "HANDED_OVER_TO_COURIER", vendorId: A });
  await db.collection("itemRequests").doc("ir_blocked").set({ ...irBase, type: "return", status: "RECEIVED_BY_YOMICO", vendorId: X });
  const sellerDeliveredReplacement = await move(A, "ir_replace", "DELIVERED");
  const blockedReturnStep = await move(X, "ir_blocked", "SELLER_INSPECTION");
  const otherSellerStep = await move(B, "ir_replace", "DELIVERED");
  record("13 return/replace: a seller cannot self-certify a replacement DELIVERED (403); a blocked seller cannot progress a return (403); another seller 403",
    sellerDeliveredReplacement.status === 403 && blockedReturnStep.status === 403 && otherSellerStep.status === 403 &&
    (await db.collection("itemRequests").doc("ir_replace").get()).data()?.status === "HANDED_OVER_TO_COURIER",
    `seller=${sellerDeliveredReplacement.status} blocked=${blockedReturnStep.status} other=${otherSellerStep.status}`);

  // ============ 14. Rate limit ============
  await db.collection("rateLimits").doc(`advance-item_${A}`).set({ windowStart: Date.now(), count: 300 });
  const limited = await advance(A, { recordId: `${S1}_${A}`, itemKey: kS1, fromStatus: "Packed" });
  record("14 advance-item is rate-limited per seller (the 301st request in the window -> 429)", limited.status === 429, `${limited.status}`);
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

// Leave the shared emulator clean for whichever suite runs next.
try { await clearAll(); } catch (error) { record("CLEANUP", false, String(error)); }

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
