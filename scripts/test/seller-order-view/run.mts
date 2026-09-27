/*
 * LOCAL-ONLY emulator regression harness — Seller Shared-Order Privacy
 * (app/api/seller/orders, app/api/seller/orders/[orderId],
 *  app/api/seller/orders/[orderId]/shipping, lib/sellerOrders/*).
 * ---------------------------------------------------------------------------
 * Proves a seller receives ONLY the allow-listed seller view of an order —
 * their own lines, fulfilment and item value; the customer's name, phone and
 * delivery address; payment method/status; their own shipping details — with
 * exact keys, and never another seller's items/ids/money/fulfilment, whole-
 * order totals, customer uid/email, payment references, delivery-private or
 * internal fields; that the seller is the verified token; that unknown,
 * foreign, malformed and Pending orders are indistinguishable 404s; and that
 * shipping details (and the customer's notification) are saved on the server,
 * on the seller's own record, and on the shared order only for a sole seller.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/seller-order-view/run.mts"
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
const { GET: listRoute } = await import("../../../app/api/seller/orders/route.ts");
const { GET: detailRoute } = await import("../../../app/api/seller/orders/[orderId]/route.ts");
const { POST: shippingRoute } = await import("../../../app/api/seller/orders/[orderId]/shipping/route.ts");
const {
  SELLER_ORDER_DETAIL_KEYS,
  SELLER_ORDER_SUMMARY_KEYS,
  SELLER_ORDER_ITEM_KEYS,
} = await import("../../../lib/sellerOrders/sellerOrderView.ts");

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

const ADMIN_UID = "admin_view_1";
const A = "seller_view_a";
const B = "seller_view_b";
const X = "seller_view_blocked";
const BUYER = "buyer_view_1";
const BUYER_EMAIL = "buyer.private@example.com";

const tok = (uid: string, email = `${uid}@example.com`) => `Bearer test:${uid}:${email}:true`;
function post(url: string, body: unknown, uid: string | null, email?: string) {
  return new Request(url, {
    method: "POST",
    headers: { ...(uid ? { authorization: tok(uid, email) } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }
async function list(uid: string | null, query = "") {
  const res = await listRoute(new Request(`http://x/api/seller/orders${query}`, { headers: uid ? { authorization: tok(uid) } : {} }));
  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text };
}
async function detail(uid: string | null, orderId: string) {
  const res = await detailRoute(
    new Request(`http://x/api/seller/orders/${encodeURIComponent(orderId)}`, { headers: uid ? { authorization: tok(uid) } : {} }),
    { params: Promise.resolve({ orderId }) }
  );
  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text };
}
async function ship(uid: string | null, orderId: string, body: unknown) {
  const res = await shippingRoute(post(`http://x/api/seller/orders/${orderId}/shipping`, body, uid), { params: Promise.resolve({ orderId }) });
  return { status: res.status, body: await json(res) };
}

const BODY = { customerName: "Priya Buyer", phone: "9898989898", address: "12 Lotus Street, Ahmedabad 380001" };
let n = 0;
const key = () => `viewkey${++n}x${Date.now()}`;
async function place(items: { id: string; qty: number }[], confirm = true) {
  const placed = await json(await webPlaceOrder(post("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: key(), items }, BUYER, BUYER_EMAIL)));
  const orderId = placed.orderId as string;
  if (confirm) await confirmOrder(post("http://x/api/confirm-order", { orderId }, ADMIN_UID, ADMIN_EMAIL));
  return orderId;
}
async function rec(orderId: string, vendor: string) {
  return (await db.collection("sellerOrders").doc(`${orderId}_${vendor}`).get()).data() as any;
}
const firstKey = (r: any) => Object.keys(r?.itemFulfilment || {})[0];
const sortKeys = (o: any) => Object.keys(o || {}).sort().join(",");
// Every number anywhere in a JSON value (for structural money-leak checks).
function numbersIn(v: any, out: number[] = []): number[] {
  if (typeof v === "number") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
}
// The order id is the one identifier a seller must hold to act on an order,
// and it is already on their own sellerOrders records. For Pay on Delivery
// orders it is "<customerUid>_<key>" (app/api/place-order) and for online
// orders the Razorpay payment id — see the report. It is masked out here so
// the scan checks every OTHER field.
const maskIds = (text: string, ids: string[]) => ids.reduce((t, id) => t.split(id).join("<ORDER_ID>"), text);
const expect = (keys: readonly string[]) => [...keys].sort().join(",");

// Private data planted on every order, which a seller view must never carry.
const PRIVATE = {
  razorpayPaymentId: "pay_PRIVATE123", razorpayOrderId: "order_PRIVATE456", paymentTransactionId: "UPI-TXN-PRIVATE",
  transactionId: "TXN-PRIVATE-789", deliveryPartnerId: "dp_private_1", deliveryPersonUid: "rider_private_uid",
  needsReview: false, owesRefund: false, couponCode: "PRIVATECOUPON", rewardValue: 77, commission: 4321,
  sellerEarning: 98765, internalNote: "ADMIN-ONLY-NOTE", paymentAmount: 55555,
};

async function seed() {
  await db.collection("settings").doc("global").set({ freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  for (const [uid, status] of [[A, "Approved"], [B, "Approved"], [X, "Blocked"]] as const) {
    await db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status, kycStatus: status, taxProfile: { gstStatus: "UNREGISTERED" } });
  }
  for (const [id, vendorId, price] of [["pa", A, 300], ["pb", B, 250], ["px", X, 100]] as const) {
    await db.collection("products").doc(id).set({
      title: `Item ${id}`, name: `Item ${id}`, price, sellingPrice: price, mrp: price * 2, gstRate: 0, gstPercent: 0,
      stock: 50, sales: 0, active: true, approvalStatus: "approved", approved: true, vendorId, vendorName: `Shop ${vendorId}`,
    });
  }
}

try {
  await clearAll();
  await seed();
  const M = await place([{ id: "pa", qty: 1 }, { id: "pb", qty: 2 }]); // multi-seller
  const S = await place([{ id: "pa", qty: 1 }]);                       // A only
  const C = await place([{ id: "pa", qty: 1 }]);                       // A only, will be cancelled
  const D = await place([{ id: "pa", qty: 1 }]);                       // A only, will be delivered
  const P = await place([{ id: "pa", qty: 1 }], false);                // still Pending
  const XO = await place([{ id: "px", qty: 1 }]);                      // blocked seller's order
  for (const id of [M, S, C, D, P, XO]) {
    await db.collection("orders").doc(id).update({ ...PRIVATE, deliveryCompanyName: "SwiftShip Co", deliveryPartnerName: "Ravi Rider" });
  }
  await cancelOrder(post("http://x/api/cancel-order", { orderId: C }, ADMIN_UID, ADMIN_EMAIL));
  const kD = firstKey(await rec(D, A));
  for (const from of ["Confirmed", "Packed", "Shipped", "Out For Delivery"]) {
    await advanceItem(post("http://x/api/seller/advance-item", { recordId: `${D}_${A}`, itemKey: kD, fromStatus: from }, ADMIN_UID, ADMIN_EMAIL));
  }
  const mOrder = (await db.collection("orders").doc(M).get()).data() as any;

  // ============ 1. Authentication ============
  const u1 = await list(null), u2 = await detail(null, M), u3 = await ship(null, M, { trackingNumber: "x" });
  const cust = await list(BUYER);
  const custDetail = await detail(BUYER, M);
  record("1  signed-out list/detail/shipping 401; a customer (no seller account) gets 403 on the list and the SAME 404 on their own order's seller view",
    u1.status === 401 && u2.status === 401 && u3.status === 401 && cust.status === 403 && custDetail.status === 404,
    `${u1.status}/${u2.status}/${u3.status}/${cust.status}/${custDetail.status}`);

  // ============ 2. Seller A on the multi-seller order: exact shape ============
  const a = await detail(A, M);
  const v = a.body.order || {};
  record("2  seller A's view of the A+B order: EXACT allow-listed keys (order, items, customer, payment, shipping, delivery, share)",
    a.status === 200 &&
    sortKeys(v) === expect(SELLER_ORDER_DETAIL_KEYS) &&
    (v.items || []).every((i: any) => sortKeys(i) === expect(SELLER_ORDER_ITEM_KEYS)) &&
    sortKeys(v.customer) === "address,name,phone" && sortKeys(v.payment) === "method,status" &&
    sortKeys(v.shipping) === "courierPartner,dispatchDate,expectedDelivery,sellerNotes,shipmentWeightKg,trackingNumber" &&
    sortKeys(v.delivery) === "companyName,partnerName" && sortKeys(v.sellerShare) === "commission,earning,netSubtotal,rawSubtotal",
    `keys=${sortKeys(v)}`);

  record("3  A sees ONLY A's lines (pa ×1, ₹300) and A's own item value (₹300 — not the ₹800 order), commission ₹0; multi-seller flag set, not cancellable by A",
    v.items?.length === 1 && v.items[0].productId === "pa" && v.items[0].qty === 1 && v.items[0].price === 300 &&
    v.sellerShare?.rawSubtotal === 300 && v.sellerShare?.commission === 0 && v.isSoleSeller === false && v.cancellable === false &&
    v.customer?.name === "Priya Buyer" && v.customer?.phone === "9898989898" && v.customer?.address.startsWith("12 Lotus"),
    JSON.stringify({ items: v.items?.map((i: any) => i.productId), share: v.sellerShare }));

  const aText = maskIds(a.text, [M]);
  const leaks = [
    B, "pb", "Item pb", "Shop seller_view_b", BUYER, BUYER_EMAIL, "userEmail", "userId", "vendorIds", "vendorId",
    "pay_PRIVATE123", "order_PRIVATE456", "UPI-TXN-PRIVATE", "TXN-PRIVATE-789", "dp_private_1", "rider_private_uid",
    "PRIVATECOUPON", "ADMIN-ONLY-NOTE", "needsReview", "owesRefund", "taxSnapshot",
    "SwiftShip", "Ravi Rider", "finalTotal", "shippingCharge", "couponCode", "rewardValue", "sellerEarning",
    "paymentAmount", "commissionRate", "internalNote",
  ].filter((s) => aText.includes(s));
  const forbiddenNumbers = [Number(mOrder.finalTotal), Number(mOrder.total), 4321, 98765, 55555, 77, 500];
  const numberLeaks = numbersIn(v).filter((x) => forbiddenNumbers.includes(x));
  if (numberLeaks.length) leaks.push(`numbers ${numberLeaks.join(",")}`);
  record("4  nothing private in A's view: no seller B (uid, item, name), no customer uid/email, no vendorIds, no payment references/amounts, no coupon/reward/commission/earning/whole-order totals, no delivery partner ids or names (multi-seller), no internal/tax fields",
    leaks.length === 0, leaks.length ? `LEAKED: ${leaks.join(", ")}` : "clean");

  // ============ 5. Seller B's equivalent view ============
  const b = await detail(B, M);
  const bv = b.body.order || {};
  record("5  seller B's view of the same order: only B's line (pb ×2, ₹500), none of A's",
    b.status === 200 && bv.items?.length === 1 && bv.items[0].productId === "pb" && bv.items[0].qty === 2 &&
    bv.sellerShare?.rawSubtotal === 500 && !b.text.includes(A) && !b.text.includes("\"pa\"") && !b.text.includes("Item pa"),
    JSON.stringify(bv.items?.map((i: any) => i.productId)));

  // ============ 6. Fulfilment isolation ============
  const kA = firstKey(await rec(M, A));
  await advanceItem(post("http://x/api/seller/advance-item", { recordId: `${M}_${A}`, itemKey: kA, fromStatus: "Confirmed" }, A));
  const a2 = (await detail(A, M)).body.order;
  const b2 = await detail(B, M);
  record("6  A packs their item: A's view shows it Packed; B's view still shows only B's item at Confirmed and says nothing about A's progress",
    a2.items[0].status === "Packed" && a2.fulfilmentStage === "Packed" &&
    b2.body.order.items[0].status === "Confirmed" && b2.body.order.fulfilmentStage === "Confirmed" && !b2.text.includes("Packed"),
    `A=${a2.items[0].status} B=${b2.body.order.items[0].status}`);

  // ============ 7. Not found / isolation ============
  const nf: Record<string, number> = {
    unknown: (await detail(A, "no_such_order")).status,
    bOnAOnlyOrder: (await detail(B, S)).status,
    pending: (await detail(A, P)).status,
    dot: (await detail(A, ".")).status,
    dotdot: (await detail(A, "..")).status,
    reserved: (await detail(A, "__name__")).status,
    tooLong: (await detail(A, "x".repeat(201))).status,
  };
  record("7  unknown order, an order the seller has no items on, a Pending order and malformed ids are all the same 404",
    Object.values(nf).every((s) => s === 404), JSON.stringify(nf));

  // ============ 8. Single / cancelled / delivered ============
  const s = (await detail(A, S)).body.order;
  const c = (await detail(A, C)).body.order;
  const d = (await detail(A, D)).body.order;
  record("8  single-seller order: sole flag, cancellable, delivery names shown; cancelled order: status Cancelled, not cancellable; delivered order: Delivered with deliveredAt",
    s.isSoleSeller === true && s.cancellable === true && s.delivery.companyName === "SwiftShip Co" && s.delivery.partnerName === "Ravi Rider" &&
    c.orderStatus === "Cancelled" && c.cancellable === false &&
    d.orderStatus === "Delivered" && d.items[0].status === "Delivered" && !!d.deliveredAt && !!d.items[0].deliveredAt && d.cancellable === false,
    `S=${s.isSoleSeller}/${s.cancellable} C=${c.orderStatus}/${c.cancellable} D=${d.orderStatus}`);

  // ============ 9. List ============
  const la = await list(A);
  const ids = (la.body.orders || []).map((o: any) => o.orderId).sort();
  const mSummary = (la.body.orders || []).find((o: any) => o.orderId === M);
  const laText = maskIds(la.text, ids);
  const listLeaks = [B, "pb", BUYER, BUYER_EMAIL, "pay_PRIVATE123", "UPI-TXN-PRIVATE", "PRIVATECOUPON", "vendorIds", "userId", "\"phone\"", "\"address\""]
    .filter((x) => laText.includes(x));
  const listNumberLeaks = numbersIn(la.body).filter((x) => [4321, 98765, 55555, 800].includes(x));
  if (listNumberLeaks.length) listLeaks.push(`numbers ${listNumberLeaks.join(",")}`);
  record("9  list: A's confirmed orders only (multi, single, cancelled, delivered — never the Pending one or X's), exact summary keys, no private data (and no phone/address in summaries)",
    la.status === 200 && JSON.stringify(ids) === JSON.stringify([C, D, M, S].sort()) &&
    (la.body.orders || []).every((o: any) => sortKeys(o) === expect(SELLER_ORDER_SUMMARY_KEYS)) &&
    mSummary?.items.length === 1 && mSummary.items[0].productId === "pa" && listLeaks.length === 0,
    listLeaks.length ? `LEAKED: ${listLeaks.join(", ")}` : `ids=${ids.length}`);

  const lim: Record<string, number> = {
    zero: (await list(A, "?limit=0")).status,
    text: (await list(A, "?limit=abc")).status,
    tooBig: (await list(A, "?limit=501")).status,
    frac: (await list(A, "?limit=1.5")).status,
  };
  const two = await list(A, "?limit=2");
  const lb = await list(B);
  record("10 list limit validated (0, text, 501, fractional -> 400); limit=2 returns 2 newest; seller B's list is only the shared order, with B's line",
    Object.values(lim).every((x) => x === 400) && two.body.orders?.length === 2 &&
    lb.body.orders?.length === 1 && lb.body.orders[0].orderId === M && lb.body.orders[0].items[0].productId === "pb",
    `${JSON.stringify(lim)} two=${two.body.orders?.length} B=${lb.body.orders?.length}`);

  // ============ 11. Shipping route ============
  const notesBefore = (await db.collection("notifications").where("userId", "==", BUYER).where("type", "==", "shipping").get()).size;
  const shipBad: Record<string, number> = {
    unknownField: (await ship(A, S, { trackingNumber: "T1", status: "Delivered" })).status,
    moneyField: (await ship(A, S, { finalTotal: 1 })).status,
    nonString: (await ship(A, S, { trackingNumber: 123 })).status,
    tooLong: (await ship(A, S, { sellerNotes: "x".repeat(1001) })).status,
    empty: (await ship(A, S, {})).status,
    notOnOrder: (await ship(B, S, { trackingNumber: "B1" })).status,
    unknownOrder: (await ship(A, "no_such_order", { trackingNumber: "T" })).status,
    pending: (await ship(A, P, { trackingNumber: "T" })).status,
    cancelled: (await ship(A, C, { trackingNumber: "T" })).status,
    blocked: (await ship(X, XO, { trackingNumber: "T" })).status,
  };
  record("11 shipping route refuses: status/money/unknown fields, non-text, too long, empty, a seller not on the order (404), unknown/Pending (404), cancelled (409), blocked seller (403)",
    shipBad.unknownField === 400 && shipBad.moneyField === 400 && shipBad.nonString === 400 && shipBad.tooLong === 400 &&
    shipBad.empty === 400 && shipBad.notOnOrder === 404 && shipBad.unknownOrder === 404 && shipBad.pending === 404 &&
    shipBad.cancelled === 409 && shipBad.blocked === 403,
    JSON.stringify(shipBad));

  const shipMulti = await ship(A, M, { trackingNumber: "A-TRK-1", courierPartner: "A Courier", sellerNotes: "Fragile" });
  const mAfter = (await db.collection("orders").doc(M).get()).data() as any;
  const recA = await rec(M, A);
  const shipSole = await ship(A, S, { trackingNumber: "S-TRK-1", dispatchDate: "2026-09-28" });
  const sAfter = (await db.collection("orders").doc(S).get()).data() as any;
  const again = await ship(A, S, { trackingNumber: "S-TRK-1", dispatchDate: "2026-09-28" });
  const notesAfter = (await db.collection("notifications").where("userId", "==", BUYER).where("type", "==", "shipping").get()).size;
  const aView = (await detail(A, M)).body.order;
  const bView = await detail(B, M);
  record("12 shipping save: multi-seller -> only A's own record (shared order untouched; B never sees A's tracking); sole-seller -> record AND order; identical re-save is a no-op; the customer is notified once per real save",
    shipMulti.status === 200 && shipMulti.body.mirroredToOrder === false && recA.trackingNumber === "A-TRK-1" && !mAfter.trackingNumber &&
    shipSole.status === 200 && shipSole.body.mirroredToOrder === true && sAfter.trackingNumber === "S-TRK-1" &&
    again.body.unchanged === true && notesAfter === notesBefore + 2 &&
    aView.shipping.trackingNumber === "A-TRK-1" && aView.shipping.sellerNotes === "Fragile" && !bView.text.includes("A-TRK-1"),
    `multi=${JSON.stringify(shipMulti.body)} sole=${JSON.stringify(shipSole.body)} notes ${notesBefore}->${notesAfter}`);

  // ============ 13. Seller cancellation notifies the customer (server) ============
  const S2 = await place([{ id: "pa", qty: 1 }]);
  const cancelNotesBefore = (await db.collection("notifications").where("userId", "==", BUYER).where("title", "==", "Order Status Updated").get()).docs
    .filter((x) => /Cancelled/.test(x.data().message)).length;
  const sellerCancel = await json(await cancelOrder(post("http://x/api/cancel-order", { orderId: S2 }, A)));
  const cancelNotesAfter = (await db.collection("notifications").where("userId", "==", BUYER).where("title", "==", "Order Status Updated").get()).docs
    .filter((x) => /Cancelled/.test(x.data().message)).length;
  record("13 a seller cancellation notifies the customer from the server (the seller never holds the customer's uid)",
    sellerCancel.success === true && cancelNotesAfter === cancelNotesBefore + 1, `${cancelNotesBefore}->${cancelNotesAfter}`);

  // ============ 14. Concurrency / rate limits ============
  const burst = await Promise.all(Array.from({ length: 10 }, () => detail(A, M)));
  record("14 ten concurrent detail reads -> all 200 with identical, seller-scoped bodies",
    burst.every((r) => r.status === 200) && new Set(burst.map((r) => r.text)).size === 1, `${burst.map((r) => r.status).join(",")}`);

  await db.collection("rateLimits").doc(`seller-order-view_${A}`).set({ windowStart: Date.now(), count: 240 });
  await db.collection("rateLimits").doc(`seller-orders-list_${A}`).set({ windowStart: Date.now(), count: 120 });
  await db.collection("rateLimits").doc(`seller-order-shipping_${A}`).set({ windowStart: Date.now(), count: 60 });
  const rl = [(await detail(A, M)).status, (await list(A)).status, (await ship(A, S, { trackingNumber: "Z" })).status];
  record("15 rate limits: detail 240, list 120, shipping 60 per seller per 10 min -> 429", rl.every((x) => x === 429), rl.join(","));
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

// Leave the shared emulator clean for whichever suite runs next.
try { await clearAll(); } catch (error) { record("CLEANUP", false, String(error)); }

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
