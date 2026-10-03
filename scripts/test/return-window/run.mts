/*
 * L15 — per-product return windows (lib/returnEligibility.ts).
 *
 * Seller returnDays validated server-side, snapshotted onto every order line at
 * creation (web COD, web online, mobile COD, mobile online), each line's
 * eligibility using its own window, order-level reward credit waiting for the
 * LONGEST window, and later product edits never changing an existing order.
 *
 * LOCAL-ONLY: Firestore EMULATOR (FIRESTORE_EMULATOR_HOST from
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json).
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/return-window/run.mts"
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
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { POST: createProduct } = await import("../../../app/api/seller/create-product/route.ts");
const { POST: updateProduct } = await import("../../../app/api/seller/update-product/route.ts");
const { control } = await import("../mobile-variant/control.mjs");
const RE = await import("../../../lib/returnEligibility.ts");
const { itemRequestEligibility, itemReturnWindowEndsAt } = await import("../../../lib/itemRequests.ts");
const { evaluateRewardCredit } = await import("../../../lib/rewardCredit.ts");
const { validateSellerProductMoney } = await import("../../../lib/products/sellerProductValidation.ts");

const db = getAdminDb();
const results: { name: string; pass: boolean }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const COLLECTIONS = ["products", "orders", "cart", "paymentIntents", "coupons", "couponRedemptions", "counters",
  "rateLimits", "settings", "notifications", "users", "rewardTransactions", "vendors", "sellerOrders", "deliveryJobs"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }
const json = async (res: Response) => res.json().catch(() => ({}));
function req(url: string, body: unknown, uid: string) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${uid}@example.com:true`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DAY = 24 * 60 * 60 * 1000;
const SELLER = "seller_rw_1";
const base = { stock: 1000, sales: 0, active: true, approved: true, approvalStatus: "approved", vendorId: SELLER, vendorName: "RW Traders", mrp: 2000, sellingPrice: 500, gstRate: 5 };
let seq = 0;
const key = () => `rwkey${++seq}${Date.now()}`;
const buyer = (tag: string) => `rw_${tag}_${++seq}`;
const BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };

// ---------------- 1. pure rules ----------------
record("1  platform default is 7 days; product without a value sells with it",
  RE.DEFAULT_RETURN_DAYS === 7 && RE.effectiveReturnDays({}) === 7 && RE.effectiveReturnDays(null) === 7);
record("2  seller-configured value is used when valid (1, 15, 30)",
  RE.effectiveReturnDays({ returnDays: 1 }) === 1 && RE.effectiveReturnDays({ returnDays: 15 }) === 15 && RE.effectiveReturnDays({ returnDays: 30 }) === 30);
{
  const bad = [0, -3, 31, 365, 7.5, NaN, Infinity, "10", null, true];
  record("3  invalid stored values fall back to the default (never extend or remove the window)",
    bad.every((v) => RE.effectiveReturnDays({ returnDays: v }) === 7 && RE.lineReturnDays({ returnDays: v }) === 7));
  // Only the returnDays verdict is under test here; the other fields of a full
  // product are covered by the money-integrity / seller-products suites.
  const returnDaysError = (extra: Record<string, unknown>) => {
    const r = validateSellerProductMoney({ sellingPrice: 100, stock: 1, gstRate: 5, ...extra });
    return !r.ok && r.errors.some((e) => e.startsWith("Return days"));
  };
  const accepted = bad.filter((v) => !returnDaysError({ returnDays: v }));
  record("4  server validation refuses every invalid seller value", accepted.length === 0, `accepted: ${JSON.stringify(accepted)}`);
  record("5  server validation accepts 1..30 and an absent value",
    [1, 7, 30].every((v) => !returnDaysError({ returnDays: v })) && !returnDaysError({}));
}
{
  const order = { status: "Delivered", deliveredAt: new Date("2026-01-01T10:00:00Z"), items: [{ returnDays: 3 }, { returnDays: 14 }, {}] };
  record("6  multi-item order: order window is the LONGEST line window (14)", RE.orderReturnDays(order) === 14);
  const end = RE.returnWindowEndsAt(order)!;
  record("7  order-level window end = delivered + 14 days", end.getTime() === new Date("2026-01-15T10:00:00Z").getTime(), end.toISOString());
  record("8  legacy order (no snapshots) keeps exactly 7 days", RE.orderReturnDays({ items: [{}, {}] }) === 7 && RE.orderReturnDays({}) === 7);
}
{
  const delivered = new Date("2026-02-01T08:00:00Z");
  const rec = { itemFulfilment: { k1: { status: "Delivered", deliveredAt: delivered } } };
  const end = itemReturnWindowEndsAt(rec, "k1", 10)!;
  const at = (ms: number) => itemRequestEligibility(rec, "k1", new Date(end.getTime() + ms), 10);
  record("9  boundary: eligible at the exact end instant, closed 1 ms later",
    at(0).eligible && !at(1).eligible && at(1).reason === "window-closed");
  record("10 each line uses its own window: a 3-day line closes while a 10-day line is open",
    !itemRequestEligibility(rec, "k1", new Date(delivered.getTime() + 5 * DAY), 3).eligible &&
    itemRequestEligibility(rec, "k1", new Date(delivered.getTime() + 5 * DAY), 10).eligible);
  record("11 no explicit window = default 7 (callers that predate snapshots behave as before)",
    itemReturnWindowEndsAt(rec, "k1")!.getTime() === delivered.getTime() + 7 * DAY);
}
{
  const delivered = new Date("2026-03-01T00:00:00Z");
  const order = { rewardPointsStatus: "pending", status: "Delivered", paymentStatus: "Paid", deliveredAt: delivered, finalTotal: 1000,
    items: [{ returnDays: 3 }, { returnDays: 20 }] };
  const after = (days: number, ms = 0) => evaluateRewardCredit(order as any, null, new Date(delivered.getTime() + days * DAY + ms));
  record("12 reward points: still held after the SHORT line's window (day 10)", !after(10).eligible && after(10).reason === "return-window-open", after(10).reason);
  record("13 reward points: held at the exact end of the longest window, released 1 ms after",
    !after(20).eligible && after(20, 1).eligible, `${after(20).reason} / ${after(20, 1).reason}`);
  const legacy = { ...order, items: [{}, {}] };
  const l = (d: number) => evaluateRewardCredit(legacy as any, null, new Date(delivered.getTime() + d * DAY + 1));
  record("14 reward points on a pre-snapshot order still release after 7 days", !l(6).eligible && l(7).eligible);
}

// ---------------- 2. seller create / update through the real routes ----------------
await clearAll();
await db.collection("settings").doc("global").set({ commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
await db.collection("vendors").add({ uid: SELLER, email: `${SELLER}@example.com`, businessName: "RW Traders", fullName: "Owner", status: "Approved", kycStatus: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } });
const VALID = {
  title: "Steel Bottle", description: "A bottle", brand: "Aqua", categoryId: "HOME", sellingPrice: 499, mrp: 799,
  stock: 20, gstRate: 12, thumbnail: "https://x/t.jpg", images: ["https://x/t.jpg"], slug: "steel-bottle", variants: [],
  specifications: { Material: "Steel" }, warranty: "",
};
{
  const statuses: number[] = [];
  for (const v of [0, 31, 2.5, "10", -1]) {
    const r = await createProduct(req("http://x/api/seller/create-product", { product: { ...VALID, returnDays: v } }, SELLER));
    statuses.push(r.status);
  }
  record("15 create-product refuses invalid returnDays (0, 31, 2.5, \"10\", -1)", statuses.every((s) => s === 400), statuses.join(","));
  const ok = await createProduct(req("http://x/api/seller/create-product", { product: { ...VALID, returnDays: 15 } }, SELLER));
  const okBody = await json(ok);
  const pid = okBody.productId || okBody.id;
  const stored = pid ? (await db.collection("products").doc(pid).get()).data() : null;
  record("16 create-product stores a valid seller window (15)", ok.status === 200 && stored?.returnDays === 15, `${ok.status} ${JSON.stringify(okBody).slice(0, 80)}`);
  if (pid) {
    const bad = await updateProduct(req("http://x/api/seller/update-product", { productId: pid, product: { returnDays: 90 } }, SELLER));
    const good = await updateProduct(req("http://x/api/seller/update-product", { productId: pid, product: { returnDays: 10 } }, SELLER));
    const after = (await db.collection("products").doc(pid).get()).data();
    record("17 update-product refuses 90, accepts 10", bad.status === 400 && good.status === 200 && after?.returnDays === 10, `${bad.status}/${good.status} stored=${after?.returnDays}`);
  }
}

// ---------------- 3. snapshot on every order path ----------------
await db.collection("products").doc("p_short").set({ ...base, name: "Short Window", title: "Short Window", returnDays: 3 });
await db.collection("products").doc("p_long").set({ ...base, name: "Long Window", title: "Long Window", returnDays: 20 });
await db.collection("products").doc("p_none").set({ ...base, name: "No Window", title: "No Window" });
await db.collection("products").doc("p_bad").set({ ...base, name: "Bad Window", title: "Bad Window", returnDays: 500 });

const lines = [{ id: "p_short", qty: 1 }, { id: "p_long", qty: 1 }, { id: "p_none", qty: 1 }, { id: "p_bad", qty: 1 }];
const daysOf = (items: any[]) => Object.fromEntries((items || []).map((i: any) => [i.id === undefined || String(i.id).startsWith("p_") ? i.id : i.productId, i.returnDays]));
const expected = (m: Record<string, unknown>) => m.p_short === 3 && m.p_long === 20 && m.p_none === 7 && m.p_bad === 7;

let webOrderId = "";
{
  const uid = buyer("webcod");
  const res = await webPlaceOrder(req("http://x/api/place-order", {
    ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: key(),
    // A forged client returnDays must be ignored.
    items: lines.map((l) => ({ ...l, returnDays: 365 })),
  }, uid));
  const j = await json(res);
  webOrderId = j.orderId;
  const order = j.orderId ? (await db.collection("orders").doc(j.orderId).get()).data() as any : null;
  const m = daysOf(order?.items);
  record("18 web COD: each line snapshots its window (3/20/default 7/invalid→7); client value ignored", res.status === 200 && expected(m), `${res.status} ${JSON.stringify(m)} ${j.error ?? ""}`);
  record("19 web COD order-level window = 20 (longest line)", RE.orderReturnDays(order) === 20);
}
{
  const uid = buyer("webonl");
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", { ...BODY, items: lines }, uid));
  const j = await json(res);
  const intent = j.id ? (await db.collection("paymentIntents").doc(j.id).get()).data() as any : null;
  record("20 web online: payment intent lines carry the snapshot (finalised order copies intent.pricing.items)",
    res.status === 200 && expected(daysOf(intent?.pricing?.items)), `${res.status} ${JSON.stringify(daysOf(intent?.pricing?.items))}`);
}
async function mobileCart(uid: string) {
  for (const l of lines) {
    await db.collection("cart").add({ userId: uid, savedForLater: false, productId: l.id, quantity: 1, name: "x", price: 1, returnDays: 365 });
  }
}
const mobileDays = (items: any[]) => Object.fromEntries((items || []).map((i: any) => [i.productId, i.returnDays]));
{
  const uid = buyer("mobcod");
  await mobileCart(uid);
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...BODY, deliverySlot: "", idempotencyKey: key() }, uid));
  const j = await json(res);
  const order = j.orderId ? (await db.collection("orders").doc(j.orderId).get()).data() as any : null;
  const m = mobileDays(order?.items);
  record("21 mobile COD: lines snapshot the product window; cart's forged value ignored", res.status === 200 && expected(m), `${res.status} ${JSON.stringify(m)} ${j.error ?? ""}`);
}
{
  const uid = buyer("mobonl");
  await mobileCart(uid);
  control.reset();
  const res = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", { ...BODY, deliverySlot: "" }, uid));
  const j = await json(res);
  const intent = j.razorpayOrderId ? (await db.collection("paymentIntents").doc(j.razorpayOrderId).get()).data() as any : null;
  let order: any = null;
  if (intent) {
    await finalizeMobileOnlineOrder({ razorpayPaymentId: `pay_${uid}`, razorpayOrderId: j.razorpayOrderId, intent, capturedAmountPaise: intent.expectedAmountPaise, source: "mobile-app" });
    const snap = await db.collection("orders").where("userId", "==", uid).get();
    order = snap.docs[0]?.data();
  }
  const m = mobileDays(order?.items);
  record("22 mobile online: finalised order lines carry the snapshot", expected(m), `${res.status} ${JSON.stringify(m)}`);
}

// ---------------- 4. later edits never rewrite an existing order ----------------
{
  await db.collection("products").doc("p_short").update({ returnDays: 30 });
  await db.collection("products").doc("p_long").update({ returnDays: 1 });
  const order = (await db.collection("orders").doc(webOrderId).get()).data() as any;
  const m = daysOf(order?.items);
  record("23 product windows changed afterwards (3→30, 20→1): the existing order keeps 3 and 20", m.p_short === 3 && m.p_long === 20, JSON.stringify(m));
  const delivered = new Date("2026-04-01T00:00:00Z");
  const ends = RE.returnWindowEndsAt({ ...order, status: "Delivered", deliveredAt: delivered });
  record("24 the existing order's window end is unchanged by the edit (delivered + 20 days)", ends?.getTime() === delivered.getTime() + 20 * DAY);
}

await clearAll();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
