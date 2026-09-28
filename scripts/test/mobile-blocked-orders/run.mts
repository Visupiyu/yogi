/*
 * F1 — blocked customers cannot place Customer App (mobile) orders.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST,
 * i.e. outside `firebase emulators:exec`). Never touches production, never
 * reads the real service account (a throwaway key is generated below) and
 * never calls the real Razorpay API: the `razorpay` package must resolve to
 * ../mobile-variant/razorpay-fake.mjs through
 * ../mobile-variant/tsconfig.harness.json. If this file is started without
 * that tsconfig it re-runs itself with it (see ensureRazorpayFake below).
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/mobile-blocked-orders/run.mts"
 *
 * Covers:
 *   1  blocked customer -> 403 from mobile/place-order (COD)
 *   2  blocked customer -> 403 from mobile/create-payment-order
 *   3  neither creates an order / paymentIntent / Razorpay order, or touches
 *      stock, sales, the coupon or couponRedemptions
 *   4  the blocked customer's cart is left intact
 *   5  an active customer still succeeds on both routes
 *   6  a customer with no users/{uid} profile is treated as active
 *   7  a retry of an order placed BEFORE the block still returns that order
 *   8  spoofed uid / userId / email in the body, or another email in the
 *      token, cannot bypass the check (identity is the verified token uid)
 *   9  a payment intent created BEFORE the block can still be finalized
 *      (finalizeMobileOnlineOrder and the mobile/finalize-payment route)
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}

// ---- make sure `razorpay` is the local fake, never the real package ----
{
  const { default: RazorpayCtor } = (await import("razorpay")) as any;
  const probe = new RazorpayCtor({ key_id: "rzp_test_PROBE", key_secret: "probe" });
  // The real SDK instance carries many resources (customers, refunds, ...);
  // the fake only has orders + payments.
  const isFake = !("customers" in probe) && !("refunds" in probe);
  if (!isFake) {
    if (process.env.F1_HARNESS_REEXEC === "1") {
      console.error("REFUSING TO RUN: `razorpay` still resolves to the real package.");
      process.exit(2);
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repo = path.resolve(here, "../../..");
    const tsxCli = path.join(repo, "node_modules/tsx/dist/cli.mjs");
    const harness = path.join(repo, "scripts/test/mobile-variant/tsconfig.harness.json");
    console.log("[f1] re-running with --tsconfig scripts/test/mobile-variant/tsconfig.harness.json (fake Razorpay)");
    const child = spawnSync(process.execPath, [tsxCli, "--tsconfig", harness, fileURLToPath(import.meta.url)], {
      stdio: "inherit",
      cwd: repo,
      env: { ...process.env, F1_HARNESS_REEXEC: "1" },
    });
    process.exit(child.status ?? 1);
  }
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

// Fake Identity Toolkit: token "test:<uid>:<email>:<emailVerified>".
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
const { couponRedemptionId } = await import("../../../lib/coupons/couponRules.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { POST: mobileFinalizePayment } = await import("../../../app/api/mobile/finalize-payment/route.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { control } = await import("../mobile-variant/control.mjs");
const { Timestamp } = await import("firebase-admin/firestore");

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
async function clearRateLimits() { await db.recursiveDelete(db.collection("rateLimits")); }

function req(url: string, body: unknown, uid: string, email = `${uid}@example.com`) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${email}:true`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

const VENDOR = "vendor_f1_1";
const PRODUCT = "prod_f1_kettle";
const START_STOCK = 100;
const COUPON = "SAVE10";
const MOB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road", deliverySlot: "" };

const BLOCKED = "f1_blocked";
const ACTIVE = "f1_active";
const NOPROFILE = "f1_noprofile";
const LATER = "f1_blocked_later";

let key = 0;
const nextKey = () => `f1key${++key}${Date.now()}`;

async function seed() {
  await db.collection("settings").doc("global").set({ commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  await db.collection("coupons").add({ code: COUPON, discount: 10, active: true, createdAt: Timestamp.now() });
  await db.collection("products").doc(PRODUCT).set({ name: "F1 Kettle", price: 1000, sellingPrice: 1000, mrp: 1500, gstPercent: 0, stock: START_STOCK, sales: 0, active: true, vendorId: VENDOR, vendorName: "F1 Traders" });
  await db.collection("users").doc(BLOCKED).set({ name: "Blocked Buyer", email: `${BLOCKED}@example.com`, status: "Blocked" });
  await db.collection("users").doc(ACTIVE).set({ name: "Active Buyer", email: `${ACTIVE}@example.com`, status: "Active" });
  await db.collection("users").doc(LATER).set({ name: "Later Buyer", email: `${LATER}@example.com`, status: "Active" });
  // NOPROFILE deliberately has no users/{uid} document.
}

async function setCart(uid: string, quantity = 2) {
  const existing = await db.collection("cart").where("userId", "==", uid).get();
  for (const d of existing.docs) await d.ref.delete();
  await db.collection("cart").add({ userId: uid, savedForLater: false, productId: PRODUCT, quantity, name: "F1 Kettle", price: 1 });
}
async function cartState(uid: string) {
  const snap = await db.collection("cart").where("userId", "==", uid).get();
  return snap.docs.map((d) => `${d.id}:${d.data().productId}:${d.data().quantity}:${d.data().savedForLater}`).sort().join("|");
}

// Everything a blocked request must leave untouched.
async function worldState(uid: string) {
  const product = (await db.collection("products").doc(PRODUCT).get()).data() as any;
  const coupon = (await db.collection("coupons").where("code", "==", COUPON).get()).docs[0]?.data() ?? {};
  return {
    orders: (await db.collection("orders").get()).size,
    ordersForUid: (await db.collection("orders").where("userId", "==", uid).get()).size,
    intents: (await db.collection("paymentIntents").get()).size,
    redemptions: (await db.collection("couponRedemptions").get()).size,
    redemption: (await db.collection("couponRedemptions").doc(couponRedemptionId(uid, COUPON)).get()).exists,
    stock: product?.stock,
    sales: product?.sales,
    coupon: JSON.stringify(coupon),
    cart: await cartState(uid),
  };
}
function sameWorld(a: Awaited<ReturnType<typeof worldState>>, b: Awaited<ReturnType<typeof worldState>>) {
  const diffs: string[] = [];
  for (const k of Object.keys(a) as (keyof typeof a)[]) if (a[k] !== b[k]) diffs.push(`${k}: ${a[k]} -> ${b[k]}`);
  return diffs;
}

const BLOCK_MSG = /blocked/i;

async function codAs(uid: string, extra: Record<string, unknown> = {}, email?: string, idempotencyKey = nextKey()) {
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, idempotencyKey, ...extra }, uid, email));
  return { status: res.status, json: await json(res), idempotencyKey };
}
async function onlineAs(uid: string, extra: Record<string, unknown> = {}, email?: string) {
  control.reset();
  const res = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", { ...MOB_BODY, ...extra }, uid, email));
  const j = await json(res);
  const intent = j.razorpayOrderId ? (await db.collection("paymentIntents").doc(j.razorpayOrderId).get()).data() : null;
  return { status: res.status, json: j, intent: intent as any, rzpCalls: control.calls.ordersCreate };
}

async function main() {
  await clearAll();
  await seed();

  // ---------- 1/3/4 blocked -> 403 from mobile/place-order, nothing mutated ----------
  {
    await clearRateLimits();
    await setCart(BLOCKED);
    const before = await worldState(BLOCKED);
    const r = await codAs(BLOCKED, { couponCode: COUPON });
    const after = await worldState(BLOCKED);
    const diffs = sameWorld(before, after);
    record("1  blocked customer -> 403 from mobile/place-order",
      r.status === 403 && BLOCK_MSG.test(String(r.json?.error ?? "")),
      `status=${r.status} error="${r.json?.error ?? ""}"`);
    record("3a place-order: no order / stock / sales / coupon / redemption mutation",
      diffs.filter((d) => !d.startsWith("cart")).length === 0 && after.ordersForUid === 0,
      diffs.length ? diffs.join("; ") : `orders=${after.orders} stock=${after.stock} sales=${after.sales} redemptions=${after.redemptions}`);
    record("4a place-order: blocked customer's cart remains intact",
      before.cart !== "" && before.cart === after.cart, `cart=${after.cart}`);
  }

  // ---------- 2/3/4 blocked -> 403 from mobile/create-payment-order ----------
  {
    await clearRateLimits();
    await setCart(BLOCKED);
    const before = await worldState(BLOCKED);
    const r = await onlineAs(BLOCKED, { couponCode: COUPON });
    const after = await worldState(BLOCKED);
    const diffs = sameWorld(before, after);
    record("2  blocked customer -> 403 from mobile/create-payment-order",
      r.status === 403 && BLOCK_MSG.test(String(r.json?.error ?? "")),
      `status=${r.status} error="${r.json?.error ?? ""}"`);
    record("3b create-payment-order: no Razorpay order, no paymentIntent",
      r.rzpCalls === 0 && after.intents === before.intents && !r.json?.razorpayOrderId,
      `razorpay.orders.create calls=${r.rzpCalls} intents=${after.intents}`);
    record("3c create-payment-order: no order / stock / sales / coupon / redemption mutation",
      diffs.filter((d) => !d.startsWith("cart")).length === 0,
      diffs.length ? diffs.join("; ") : `orders=${after.orders} stock=${after.stock} sales=${after.sales} redemptions=${after.redemptions}`);
    record("4b create-payment-order: blocked customer's cart remains intact",
      before.cart !== "" && before.cart === after.cart, `cart=${after.cart}`);
  }

  // ---------- 5 active customer succeeds on both routes ----------
  {
    await clearRateLimits();
    await setCart(ACTIVE);
    const cod = await codAs(ACTIVE);
    const order = cod.json?.orderId ? (await db.collection("orders").doc(cod.json.orderId).get()).data() as any : null;
    record("5a active customer -> mobile/place-order succeeds",
      cod.status === 200 && cod.json?.success === true && order?.userId === ACTIVE,
      `status=${cod.status} orderId=${cod.json?.orderId ?? "-"} error="${cod.json?.error ?? ""}"`);
    await setCart(ACTIVE);
    const online = await onlineAs(ACTIVE);
    record("5b active customer -> mobile/create-payment-order succeeds (fake Razorpay)",
      online.status === 200 && !!online.json?.razorpayOrderId && online.rzpCalls === 1 && online.intent?.uid === ACTIVE,
      `status=${online.status} rzpCalls=${online.rzpCalls} intentUid=${online.intent?.uid ?? "-"} error="${online.json?.error ?? ""}"`);
  }

  // ---------- 6 missing profile treated as active ----------
  {
    await clearRateLimits();
    const noDoc = !(await db.collection("users").doc(NOPROFILE).get()).exists;
    await setCart(NOPROFILE);
    const cod = await codAs(NOPROFILE);
    await setCart(NOPROFILE);
    const online = await onlineAs(NOPROFILE);
    record("6  no users/{uid} profile -> treated as active on both routes",
      noDoc && cod.status === 200 && cod.json?.success === true && online.status === 200 && !!online.json?.razorpayOrderId,
      `profileMissing=${noDoc} cod=${cod.status} online=${online.status} errors="${cod.json?.error ?? ""}|${online.json?.error ?? ""}"`);
  }

  // ---------- 7 pre-block order retry still returns the existing order ----------
  {
    await clearRateLimits();
    await db.collection("users").doc(LATER).set({ status: "Active" }, { merge: true });
    await setCart(LATER);
    const first = await codAs(LATER);
    await db.collection("users").doc(LATER).set({ status: "Blocked" }, { merge: true });
    const ordersBefore = (await db.collection("orders").where("userId", "==", LATER).get()).size;
    const retry = await codAs(LATER, {}, undefined, first.idempotencyKey);
    const ordersAfter = (await db.collection("orders").where("userId", "==", LATER).get()).size;
    record("7a order placed before the block: retry (same idempotencyKey) returns the existing order",
      first.status === 200 && retry.status === 200 && retry.json?.alreadyPlaced === true &&
        retry.json?.orderId === first.json?.orderId && ordersAfter === ordersBefore,
      `first=${first.status} retry=${retry.status} alreadyPlaced=${retry.json?.alreadyPlaced} sameId=${retry.json?.orderId === first.json?.orderId} orders ${ordersBefore}->${ordersAfter}`);
    await setCart(LATER);
    const fresh = await codAs(LATER);
    record("7b ...but a NEW order (new idempotencyKey) after the block -> 403",
      fresh.status === 403, `status=${fresh.status} error="${fresh.json?.error ?? ""}"`);
  }

  // ---------- 8 spoofed uid / email cannot bypass ----------
  {
    await clearRateLimits();
    await setCart(BLOCKED);
    const spoof = { uid: ACTIVE, userId: ACTIVE, customerId: ACTIVE, email: `${ACTIVE}@example.com`, customerEmail: `${ACTIVE}@example.com` };
    const before = await worldState(BLOCKED);
    const cod = await codAs(BLOCKED, spoof);
    const online = await onlineAs(BLOCKED, spoof);
    // Blocked uid presenting a token that carries the ACTIVE customer's email.
    const codEmail = await codAs(BLOCKED, {}, `${ACTIVE}@example.com`);
    const onlineEmail = await onlineAs(BLOCKED, {}, `${ACTIVE}@example.com`);
    const after = await worldState(BLOCKED);
    record("8a blocked token + body uid/userId/email of an active customer -> 403 on both routes",
      cod.status === 403 && online.status === 403, `cod=${cod.status} online=${online.status}`);
    record("8b blocked uid with an active customer's email in the token -> 403 on both routes",
      codEmail.status === 403 && onlineEmail.status === 403, `cod=${codEmail.status} online=${onlineEmail.status}`);
    record("8c spoof attempts mutated nothing (orders/intents/stock/coupon/cart)",
      sameWorld(before, after).length === 0 && online.rzpCalls === 0 && onlineEmail.rzpCalls === 0,
      sameWorld(before, after).join("; ") || "unchanged");
    // Reverse: an ACTIVE token naming the blocked uid in the body is judged
    // on the token uid only (body identity is ignored).
    await setCart(ACTIVE);
    const rev = await codAs(ACTIVE, { uid: BLOCKED, userId: BLOCKED, email: `${BLOCKED}@example.com` });
    const revOrder = rev.json?.orderId ? (await db.collection("orders").doc(rev.json.orderId).get()).data() as any : null;
    record("8d active token + body naming the blocked uid -> order belongs to the token uid",
      rev.status === 200 && revOrder?.userId === ACTIVE, `status=${rev.status} orderUid=${revOrder?.userId ?? "-"}`);
  }

  // ---------- 9 pre-block payment intent can still finalize ----------
  {
    // 9a — direct finalize (the webhook path)
    await clearRateLimits();
    await db.collection("users").doc(LATER).set({ status: "Active" }, { merge: true });
    await setCart(LATER);
    const s = await onlineAs(LATER);
    await db.collection("users").doc(LATER).set({ status: "Blocked" }, { merge: true });
    let fin: any = null;
    let finErr = "";
    if (s.intent) {
      try {
        fin = await finalizeMobileOnlineOrder({ razorpayPaymentId: "pay_f1_pre_1", razorpayOrderId: s.json.razorpayOrderId, intent: s.intent, capturedAmountPaise: s.intent.expectedAmountPaise, source: "webhook" });
      } catch (e) { finErr = (e as Error).message; }
    }
    const ord = (await db.collection("orders").where("razorpayOrderId", "==", s.json?.razorpayOrderId ?? "-").get()).docs[0]?.data() as any;
    record("9a intent created before the block -> finalizeMobileOnlineOrder still creates the paid order",
      s.status === 200 && !!ord && ord.userId === LATER && !finErr,
      `create=${s.status} order=${ord ? "yes" : "no"} finalize=${fin ? JSON.stringify(fin).slice(0, 80) : "-"} ${finErr}`);

    // 9b — the customer-facing mobile/finalize-payment route
    await clearRateLimits();
    await db.collection("users").doc(LATER).set({ status: "Active" }, { merge: true });
    await setCart(LATER);
    const s2 = await onlineAs(LATER);
    await db.collection("users").doc(LATER).set({ status: "Blocked" }, { merge: true });
    const rzpOrder = s2.json?.razorpayOrderId as string;
    const pay = "pay_f1_pre_2";
    control.reset();
    control.ordersFetch = () => ({ id: rzpOrder, notes: { verifiedUid: LATER, expectedAmount: String(s2.intent?.expectedAmountPaise) } });
    control.paymentsFetch = () => ({ id: pay, order_id: rzpOrder, status: "captured", amount: s2.intent?.expectedAmountPaise });
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${rzpOrder}|${pay}`).digest("hex");
    const res = await mobileFinalizePayment(req("http://x/api/mobile/finalize-payment", { razorpay_order_id: rzpOrder, razorpay_payment_id: pay, razorpay_signature: signature }, LATER));
    const rj = await json(res);
    const ord2 = (await db.collection("orders").where("razorpayOrderId", "==", rzpOrder ?? "-").get()).docs[0]?.data() as any;
    record("9b intent created before the block -> mobile/finalize-payment still creates the paid order",
      s2.status === 200 && res.status === 200 && !!ord2 && ord2.userId === LATER,
      `create=${s2.status} finalize=${res.status} order=${ord2 ? "yes" : "no"} error="${rj?.error ?? ""}"`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed !== results.length) {
    console.log("FAILED:");
    for (const r of results.filter((x) => !x.pass)) console.log(`  - ${r.name}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(3);
});
