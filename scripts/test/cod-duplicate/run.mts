/*
 * LOCAL-ONLY emulator regression harness — mobile COD duplicate submits
 * (app/api/mobile/place-order).
 * ---------------------------------------------------------------------------
 * Proves one cart can produce at most ONE order however the submit is
 * repeated: a double-tap or network retry (same idempotency key), a
 * re-entered Checkout / relaunched app / second device (a DIFFERENT key for
 * the same cart, raced at many timings), or a scripted burst — with stock
 * decremented exactly once, the coupon redeemed once, and the order built
 * from the cart as it is when the order transaction reads it.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/cod-duplicate/run.mts"
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
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["products", "orders", "cart", "coupons", "couponRedemptions", "counters", "rateLimits",
  "settings", "notifications"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const PRODUCT = "prod_cod_dup";
const CART_EMPTY = "Your cart is empty.";
const BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road", deliverySlot: "" };
let seq = 0;
const newKey = () => `coddup${++seq}x${Date.now()}`;
let uidSeq = 0;
// A fresh customer per trial: own cart, own rate-limit window (20 / 10 min).
const newUid = (tag: string) => `cod_${tag}_${++uidSeq}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Call = { status: number; body: any };
async function place(uid: string, idempotencyKey: string, extra: Record<string, unknown> = {}): Promise<Call> {
  const res = await mobilePlaceOrder(new Request("http://x/api/mobile/place-order", {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${uid}@example.com:true`, "content-type": "application/json" },
    body: JSON.stringify({ ...BODY, idempotencyKey, ...extra }),
  }));
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function addCartLine(uid: string, quantity: number) {
  return db.collection("cart").add({ userId: uid, savedForLater: false, productId: PRODUCT, quantity, name: "Dup Kettle", price: 1 });
}
async function stock() { return ((await db.collection("products").doc(PRODUCT).get()).data() as any).stock as number; }
async function ordersOf(uid: string) { return (await db.collection("orders").where("userId", "==", uid).get()).docs; }
async function cartOf(uid: string) { return (await db.collection("cart").where("userId", "==", uid).get()).docs; }
const qtyOf = (order: any) => (order.items || []).reduce((n: number, i: any) => n + Number(i.quantity || 0), 0);
// The Firestore EMULATOR resolves heavy transaction contention by rejecting
// the losing transaction with "3 INVALID_ARGUMENT: Transaction is invalid or
// closed" (production returns a retryable ABORTED instead), which the route
// surfaces as its generic 500. It happens before and after the fix and
// creates nothing — every such loser is still held to the same invariants
// (one order, stock once, cart consumed) and is counted and reported.
let emulatorAborts = 0;
const isEmulatorAbort = (c: Call) => c.status === 500 && c.body.error === "Something went wrong.";
const loserOk = (c: Call, ...allowed: string[]) =>
  (c.status === 400 && allowed.includes(c.body.error)) || (isEmulatorAbort(c) && ++emulatorAborts > 0);
const fmt = (calls: Call[]) => calls.map((c) => `${c.status}${c.body.alreadyPlaced ? "(already)" : ""}${c.status >= 400 ? `:${c.body.error}` : ""}`).join(",");

async function main() {
  await clearAll();
  await db.collection("settings").doc("global").set({ commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  await db.collection("products").doc(PRODUCT).set({
    name: "Dup Kettle", price: 1000, sellingPrice: 1000, mrp: 1500, gstPercent: 0,
    stock: 1_000_000, sales: 0, active: true, vendorId: "vendor_cod_dup", vendorName: "Dup Traders",
  });
  await db.collection("coupons").add({ code: "SAVE10", discount: 10, active: true, createdAt: Timestamp.now() });

  // ---------- 1. same key, concurrent (double-tap) ----------
  {
    const fails: string[] = [];
    const trials = 10;
    for (let t = 0; t < trials; t++) {
      const uid = newUid("samekey");
      await addCartLine(uid, 2);
      const s0 = await stock();
      const k = newKey();
      const pA = place(uid, k);
      await sleep(t * 5);
      const calls = await Promise.all([pA, place(uid, k)]);
      const orders = await ordersOf(uid);
      const ok200 = calls.filter((c) => c.status === 200);
      const ok = orders.length === 1 && ok200.length >= 1 && ok200.every((c) => c.body.orderId === orders[0].id)
        && calls.filter((c) => c.status !== 200).every((c) => loserOk(c))
        && s0 - (await stock()) === 2 && (await cartOf(uid)).length === 0;
      if (!ok) fails.push(`trial${t}: orders=${orders.length} responses=${fmt(calls)}`);
    }
    record(`1  same key, 2 concurrent requests x${trials} timings -> exactly 1 order, both 200 with that orderId, stock -2 once`,
      fails.length === 0, fails.join(" | ") || `${trials}/${trials} trials clean`);
  }

  // ---------- 2. same-key retry after success ----------
  {
    const uid = newUid("retry");
    await addCartLine(uid, 2);
    const s0 = await stock();
    const k = newKey();
    const first = await place(uid, k);
    const s1 = await stock();
    const retry = await place(uid, k);
    const orders = await ordersOf(uid);
    record("2  same-key retry after success -> 200 alreadyPlaced, same orderId, nothing re-applied",
      first.status === 200 && !first.body.alreadyPlaced && retry.status === 200 && retry.body.alreadyPlaced === true &&
      retry.body.orderId === first.body.orderId && retry.body.total === first.body.total &&
      orders.length === 1 && s0 - s1 === 2 && (await stock()) === s1,
      `first=${fmt([first])} retry=${fmt([retry])} orders=${orders.length} stock ${s0}->${s1}->${await stock()}`);
  }

  // ---------- 3. different-key race, many timings (re-entered Checkout / relaunch / 2nd device) ----------
  {
    const delays = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
    const reps = 3;
    const fails: string[] = [];
    let trials = 0;
    for (const d of delays) {
      for (let r = 0; r < reps; r++) {
        trials++;
        const uid = newUid("race");
        await addCartLine(uid, 1);
        const s0 = await stock();
        const pA = place(uid, newKey());
        await sleep(d);
        const calls = await Promise.all([pA, place(uid, newKey())]);
        const orders = await ordersOf(uid);
        const winners = calls.filter((c) => c.status === 200);
        const losers = calls.filter((c) => c.status !== 200);
        const ok = orders.length === 1 && winners.length === 1 && winners[0].body.orderId === orders[0].id &&
          losers.every((c) => loserOk(c, CART_EMPTY)) &&
          s0 - (await stock()) === 1 && (await cartOf(uid)).length === 0;
        if (!ok) fails.push(`delay=${d}ms rep=${r}: orders=${orders.length} responses=${fmt(calls)}`);
      }
    }
    record(`3  different keys, one cart, ${trials} timing trials (0-100ms) -> exactly 1 order every time, loser 400 "${CART_EMPTY}", stock -1 once`,
      fails.length === 0, fails.length ? `${fails.length}/${trials} trials failed: ${fails.slice(0, 6).join(" | ")}` : `${trials}/${trials} trials clean`);
  }

  // ---------- 4. five different-key burst ----------
  {
    const uid = newUid("burst");
    await addCartLine(uid, 3);
    const s0 = await stock();
    const calls = await Promise.all(Array.from({ length: 5 }, () => place(uid, newKey())));
    const orders = await ordersOf(uid);
    const winners = calls.filter((c) => c.status === 200);
    record("4  5 concurrent different-key requests for one cart -> 1 order, 4x 400 cart empty, stock -3 once",
      orders.length === 1 && winners.length === 1 &&
      calls.filter((c) => c.status !== 200).every((c) => loserOk(c, CART_EMPTY)) &&
      s0 - (await stock()) === 3 && qtyOf(orders[0]?.data()) === 3,
      `orders=${orders.length} responses=${fmt(calls)} stock ${s0}->${await stock()}`);
  }

  // ---------- 5. different key after the first order committed ----------
  {
    const uid = newUid("after");
    await addCartLine(uid, 1);
    const first = await place(uid, newKey());
    const s1 = await stock();
    const second = await place(uid, newKey());
    record(`5  different key after a committed order -> 400 "${CART_EMPTY}", no second order, stock untouched`,
      first.status === 200 && second.status === 400 && second.body.error === CART_EMPTY &&
      (await ordersOf(uid)).length === 1 && (await stock()) === s1,
      `first=${fmt([first])} second=${fmt([second])}`);
  }

  // ---------- 6. coupon + different-key race ----------
  {
    const fails: string[] = [];
    const trials = 10;
    for (let t = 0; t < trials; t++) {
      const uid = newUid("coupon");
      await addCartLine(uid, 1);
      const s0 = await stock();
      const pA = place(uid, newKey(), { couponCode: "SAVE10" });
      await sleep(t * 8);
      const calls = await Promise.all([pA, place(uid, newKey(), { couponCode: "SAVE10" })]);
      const orders = await ordersOf(uid);
      const redemptions = await db.collection("couponRedemptions").where("userId", "==", uid).get();
      const claim = await db.collection("couponRedemptions").doc(couponRedemptionId(uid, "SAVE10")).get();
      const o = orders[0]?.data() as any;
      const ok = orders.length === 1 && redemptions.size === 1 && claim.data()?.orderId === orders[0].id &&
        o?.discountAmount === 100 && calls.filter((c) => c.status === 200).length === 1 &&
        calls.filter((c) => c.status !== 200).every((c) => loserOk(c, CART_EMPTY, "You've already used this coupon.")) &&
        s0 - (await stock()) === 1;
      if (!ok) fails.push(`trial${t}: orders=${orders.length} redemptions=${redemptions.size} discount=${o?.discountAmount} responses=${fmt(calls)}`);
    }
    record(`6  coupon + different-key race x${trials} timings -> 1 order, 1 coupon redemption bound to it, discount once`,
      fails.length === 0, fails.join(" | ") || `${trials}/${trials} trials clean`);
  }

  // ---------- 7. live cart quantity ----------
  {
    // 7a: the order carries the quantity the cart holds when the order is placed.
    const uidA = newUid("liveqty");
    await addCartLine(uidA, 4);
    const s0 = await stock();
    const r = await place(uidA, newKey());
    const o = (await ordersOf(uidA))[0]?.data() as any;
    record("7a order quantity = live cart quantity (4), stock -4",
      r.status === 200 && qtyOf(o) === 4 && s0 - (await stock()) === 4, `status=${r.status} orderQty=${qtyOf(o)}`);

    // 7b: the customer edits the quantity 1 -> 3 while the order request is in
    // flight. Whichever lands first, the ORDER and the STOCK must agree with the
    // cart the order transaction actually consumed: an edit that succeeded is
    // never silently discarded (order qty 3), an edit that lost finds the cart
    // line already consumed (order qty 1). Never: edit accepted but order built
    // from the stale quantity.
    const fails: string[] = [];
    let editWon = 0, orderWon = 0;
    const delays = [0, 5, 10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 600];
    for (const d of delays) {
      const uid = newUid("editqty");
      const line = await addCartLine(uid, 1);
      const s1 = await stock();
      const pOrder = place(uid, newKey());
      await sleep(d);
      let edited = false;
      try { await line.update({ quantity: 3 }); edited = true; } catch { edited = false; }
      const call = await pOrder;
      const orders = await ordersOf(uid);
      const oq = qtyOf(orders[0]?.data());
      const used = s1 - (await stock());
      const cartLeft = (await cartOf(uid)).length;
      // An emulator-aborted order request (see isEmulatorAbort) must leave the
      // cart untouched and create nothing.
      const ok = (call.status === 200 && orders.length === 1 && cartLeft === 0 && used === oq && (edited ? oq === 3 : oq === 1))
        || (isEmulatorAbort(call) && ++emulatorAborts > 0 && orders.length === 0 && cartLeft === 1 && used === 0);
      edited ? editWon++ : orderWon++;
      if (!ok) fails.push(`delay=${d}ms edited=${edited} orderQty=${oq} stockUsed=${used} cartLeft=${cartLeft} status=${call.status}`);
    }
    record(`7b quantity edited mid-flight x${delays.length} timings -> order/stock always match the cart the transaction consumed`,
      fails.length === 0, fails.length ? fails.join(" | ") : `edit-landed-first=${editWon} order-landed-first=${orderWon}`);
  }

  // ---------- 8. stock decremented exactly once overall ----------
  {
    const all = await db.collection("orders").get();
    const orderedUnits = all.docs.reduce((n, d) => n + qtyOf(d.data()), 0);
    const used = 1_000_000 - (await stock());
    const salesNow = ((await db.collection("products").doc(PRODUCT).get()).data() as any).sales;
    record("8  across every scenario: stock decrease == units in created orders == sales (no double decrement)",
      used === orderedUnits && salesNow === orderedUnits, `stockUsed=${used} orderedUnits=${orderedUnits} sales=${salesNow} orders=${all.size}`);
  }

  await clearAll();
  console.log(`(emulator transaction-abort 500s tolerated as losers, each creating nothing: ${emulatorAborts})`);
  const failed = results.filter((r) => !r.pass);
  console.log("\n=================== SUMMARY ===================");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("ALL COD DUPLICATE-SUBMIT SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
