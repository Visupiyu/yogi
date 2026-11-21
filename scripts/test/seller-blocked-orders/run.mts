/*
 * B1 — products of a seller who is not Approved cannot be purchased.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * Never touches production, never reads the real service account (a throwaway
 * key is generated below) and never calls the real Razorpay API: `razorpay`
 * must resolve to ../mobile-variant/razorpay-fake.mjs through
 * ../mobile-variant/tsconfig.harness.json (re-executes itself with it).
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/seller-blocked-orders/run.mts"
 *
 * Covers:
 *   1  blocked seller -> web COD (place-order) refused
 *   2  blocked seller -> web online (create-order) refused, no Razorpay order
 *   3  blocked seller -> mobile COD (mobile/place-order) refused
 *   4  blocked seller -> mobile online (mobile/create-payment-order) refused
 *   5  mixed approved + blocked cart refused ENTIRELY, on all four routes
 *   6  none of the above moved stock, sales, orders, intents, the coupon
 *      redemption, reward points, points holds or the points ledger
 *   7  lookup mismatches fail closed: no vendors record, vendorId missing on
 *      the product, a half-applied block (vendors Approved but the
 *      vendors_public mirror Blocked), duplicate vendor records with one
 *      Blocked, Pending and Rejected sellers
 *   8  blocking never touches the products' own active / approval fields
 *   9  unblocking restores ordering on all four routes
 *  10  a payment captured before the block is NOT lost: the finalizers still
 *      create the paid order, flagged needsReview + sellerNotApproved
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
  const isFake = !("customers" in probe) && !("refunds" in probe);
  if (!isFake) {
    if (process.env.B1_HARNESS_REEXEC === "1") {
      console.error("REFUSING TO RUN: `razorpay` still resolves to the real package.");
      process.exit(2);
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repo = path.resolve(here, "../../..");
    const tsxCli = path.join(repo, "node_modules/tsx/dist/cli.mjs");
    const harness = path.join(repo, "scripts/test/mobile-variant/tsconfig.harness.json");
    console.log("[b1] re-running with --tsconfig scripts/test/mobile-variant/tsconfig.harness.json (fake Razorpay)");
    const child = spawnSync(process.execPath, [tsxCli, "--tsconfig", harness, fileURLToPath(import.meta.url)], {
      stdio: "inherit",
      cwd: repo,
      env: { ...process.env, B1_HARNESS_REEXEC: "1" },
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
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: webCreateOrder } = await import("../../../app/api/create-order/route.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { finalizeOnlineOrder } = await import("../../../lib/onlineOrder.ts");
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
  "rateLimits", "settings", "notifications", "users", "rewardTransactions", "pointsHolds", "deliveryJobs",
  "unmatchedPayments", "vendors", "vendors_public"];
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

const GOOD = "b1_vendor_good";
const BAD = "b1_vendor_bad";
const P_GOOD = "b1_prod_good";
const P_BAD = "b1_prod_bad";
const START_STOCK = 50;
const COUPON = "B1SAVE";
const BUYER = "b1_buyer";
const POINTS = 200;
const CHECKOUT = { customerName: "B1 Buyer", phone: "9898989898", address: "1 Test Road" };

let key = 0;
const nextKey = () => `b1key${++key}${Date.now()}`;

// vendors doc ids are auto-ids keyed by a `uid` field (firestore.rules); the
// vendors_public mirror is keyed by uid. Both are written the way
// app/admin/vendors writes them.
async function setSeller(uid: string, status: string, mirror: string | null = status) {
  const existing = await db.collection("vendors").where("uid", "==", uid).get();
  for (const d of existing.docs) await d.ref.delete();
  await db.collection("vendors").add({ uid, status, kycStatus: "Approved", businessName: uid });
  if (mirror === null) await db.collection("vendors_public").doc(uid).delete();
  else await db.collection("vendors_public").doc(uid).set({ uid, status: mirror }, { merge: true });
}
async function removeSeller(uid: string) {
  const existing = await db.collection("vendors").where("uid", "==", uid).get();
  for (const d of existing.docs) await d.ref.delete();
  await db.collection("vendors_public").doc(uid).delete();
}

async function seed() {
  await db.collection("settings").doc("global").set({ commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  await db.collection("coupons").add({ code: COUPON, discount: 10, active: true, createdAt: Timestamp.now() });
  for (const [id, vendorId] of [[P_GOOD, GOOD], [P_BAD, BAD]]) {
    await db.collection("products").doc(id).set({
      name: id, title: id, price: 1000, sellingPrice: 1000, mrp: 1500, gstPercent: 0,
      stock: START_STOCK, sales: 0, active: true, approvalStatus: "approved", vendorId, vendorName: vendorId,
    });
  }
  await setSeller(GOOD, "Approved");
  await setSeller(BAD, "Approved");
  await db.collection("users").doc(BUYER).set({
    name: "B1 Buyer", email: `${BUYER}@example.com`, status: "Active",
    rewardPoints: POINTS, rewardsEligibleAt: Timestamp.now(), rewardsEligibleOrderId: "o_prev",
  });
}

async function setMobileCart(productIds: string[]) {
  const existing = await db.collection("cart").where("userId", "==", BUYER).get();
  for (const d of existing.docs) await d.ref.delete();
  for (const productId of productIds) {
    await db.collection("cart").add({ userId: BUYER, savedForLater: false, productId, quantity: 1, name: productId, price: 1 });
  }
}

async function productFlags(id: string) {
  const p = (await db.collection("products").doc(id).get()).data() as any;
  return { stock: p?.stock, sales: p?.sales, active: p?.active, approvalStatus: p?.approvalStatus };
}

// Everything a refused order must leave untouched.
async function worldState() {
  const user = (await db.collection("users").doc(BUYER).get()).data() as any;
  const good = await productFlags(P_GOOD);
  const bad = await productFlags(P_BAD);
  return {
    orders: (await db.collection("orders").get()).size,
    intents: (await db.collection("paymentIntents").get()).size,
    redemptions: (await db.collection("couponRedemptions").get()).size,
    holds: (await db.collection("pointsHolds").get()).size,
    ledger: (await db.collection("rewardTransactions").get()).size,
    rewardPoints: user?.rewardPoints,
    goodStock: good.stock, goodSales: good.sales,
    badStock: bad.stock, badSales: bad.sales,
  };
}
function diff(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} -> ${b[k]}`);
}

const SELLER_MSG = /seller/i;

// Each route, with coupon + points so a refusal is tested against every mutation.
async function webCod(productIds: string[]) {
  const res = await webPlaceOrder(req("http://x/api/place-order", {
    ...CHECKOUT, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: nextKey(),
    items: productIds.map((id) => ({ id, qty: 1 })), couponCode: COUPON, redeemPoints: true,
  }, BUYER));
  return { status: res.status, json: await json(res), rzp: 0 };
}
async function webOnline(productIds: string[]) {
  control.reset();
  const res = await webCreateOrder(req("http://x/api/create-order", {
    ...CHECKOUT, paymentMethod: "ONLINE", items: productIds.map((id) => ({ id, qty: 1 })),
    couponCode: COUPON, redeemPoints: true,
  }, BUYER));
  return { status: res.status, json: await json(res), rzp: control.calls.ordersCreate };
}
async function mobileCod(productIds: string[]) {
  await setMobileCart(productIds);
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", {
    ...CHECKOUT, deliverySlot: "", idempotencyKey: nextKey(), couponCode: COUPON,
  }, BUYER));
  return { status: res.status, json: await json(res), rzp: 0 };
}
async function mobileOnline(productIds: string[]) {
  await setMobileCart(productIds);
  control.reset();
  const res = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", {
    ...CHECKOUT, deliverySlot: "", couponCode: COUPON,
  }, BUYER));
  return { status: res.status, json: await json(res), rzp: control.calls.ordersCreate };
}
const ROUTES = [
  ["web COD", webCod],
  ["web online", webOnline],
  ["mobile COD", mobileCod],
  ["mobile online", mobileOnline],
] as const;

/** Runs `route` and asserts it was refused with nothing mutated. */
async function expectRefused(label: string, route: (ids: string[]) => Promise<any>, productIds: string[]) {
  await clearRateLimits();
  const before = await worldState();
  const r = await route(productIds);
  const after = await worldState();
  const changed = diff(before, after);
  record(`${label}: refused`,
    r.status === 409 && SELLER_MSG.test(String(r.json?.error ?? "")),
    `status=${r.status} error="${r.json?.error ?? ""}"`);
  record(`${label}: no stock/order/intent/coupon/points/Razorpay mutation`,
    changed.length === 0 && r.rzp === 0,
    changed.length ? changed.join("; ") : `unchanged, razorpay calls=${r.rzp}`);
}

// A successful order legitimately spends the one-use coupon and the points;
// give the next success case a fresh buyer state.
async function resetBuyer() {
  await clearRateLimits();
  await db.recursiveDelete(db.collection("couponRedemptions"));
  await db.recursiveDelete(db.collection("pointsHolds"));
  await db.collection("users").doc(BUYER).update({ rewardPoints: POINTS });
}

async function expectAllowed(label: string, route: (ids: string[]) => Promise<any>, productIds: string[]) {
  await resetBuyer();
  const r = await route(productIds);
  const ok = r.status === 200 && (r.json?.success === true || !!r.json?.id || !!r.json?.razorpayOrderId);
  record(`${label}: allowed`, ok, `status=${r.status} error="${r.json?.error ?? ""}"`);
  return r;
}

async function main() {
  await clearAll();
  await seed();

  // ---------- 1-4 + 6: blocked seller, single-seller cart ----------
  await setSeller(BAD, "Blocked");
  const flagsAtBlock = await productFlags(P_BAD);
  for (const [name, route] of ROUTES) await expectRefused(`1-4 blocked seller, ${name}`, route, [P_BAD]);

  // ---------- 5 + 6: mixed approved + blocked cart ----------
  for (const [name, route] of ROUTES) await expectRefused(`5  mixed approved+blocked cart, ${name}`, route, [P_GOOD, P_BAD]);

  // ---------- 8: blocking leaves the product's own flags alone ----------
  {
    const p = await productFlags(P_BAD);
    record("8  blocking the seller did not change the product's active / approvalStatus",
      p.active === true && p.approvalStatus === "approved" &&
        p.active === flagsAtBlock.active && p.approvalStatus === flagsAtBlock.approvalStatus,
      JSON.stringify(p));
  }

  // ---------- 7: lookup mismatches fail closed ----------
  {
    const cases: [string, () => Promise<void>][] = [
      ["no vendors record at all", async () => { await removeSeller(BAD); }],
      ["vendors Approved but vendors_public mirror Blocked (half-applied block)", async () => { await setSeller(BAD, "Approved", "Blocked"); }],
      ["duplicate vendors records, one Blocked", async () => {
        await setSeller(BAD, "Approved");
        await db.collection("vendors").add({ uid: BAD, status: "Blocked" });
      }],
      ["legacy vendors/{uid} doc Blocked alongside an Approved record", async () => {
        await setSeller(BAD, "Approved");
        await db.collection("vendors").doc(BAD).set({ status: "Blocked" });
      }],
      // The previous check read only limit(10) records: with 11 Approved
      // records sorting first, a Blocked 12th was never seen (fail-open).
      ["11 Approved records + a Blocked one sorting last (beyond the old limit(10))", async () => {
        await setSeller(BAD, "Approved");
        for (let i = 0; i < 11; i++) {
          await db.collection("vendors").doc(`b1dup_${String(i).padStart(2, "0")}`).set({ uid: BAD, status: "Approved" });
        }
        await db.collection("vendors").doc("b1dup_zz_blocked").set({ uid: BAD, status: "Blocked" });
      }],
      // More records than the check reads is refused outright, never sampled.
      ["26 Approved records (over the 25-record bound) -> refused, not sampled", async () => {
        await setSeller(BAD, "Approved");
        for (let i = 0; i < 25; i++) {
          await db.collection("vendors").doc(`b1many_${String(i).padStart(2, "0")}`).set({ uid: BAD, status: "Approved" });
        }
      }],
      ["Pending seller", async () => { await db.collection("vendors").doc(BAD).delete(); await setSeller(BAD, "Pending"); }],
      ["Rejected seller", async () => { await setSeller(BAD, "Rejected"); }],
    ];
    for (const [label, arrange] of cases) {
      await arrange();
      await expectRefused(`7  ${label}, web COD`, webCod, [P_BAD]);
      await expectRefused(`7  ${label}, mobile online`, mobileOnline, [P_BAD]);
    }
    // At the bound (25 records, all Approved) the seller still sells.
    await setSeller(BAD, "Approved");
    for (let i = 0; i < 24; i++) {
      await db.collection("vendors").doc(`b1bound_${String(i).padStart(2, "0")}`).set({ uid: BAD, status: "Approved" });
    }
    await expectAllowed("7  exactly 25 Approved records (at the bound), web COD", webCod, [P_BAD]);
    await resetBuyer(); // that order legitimately spent the one-use coupon

    // A product carrying no vendorId belongs to no Approved seller.
    await setSeller(BAD, "Approved");
    await db.collection("products").doc(P_BAD).update({ vendorId: "" });
    for (const [name, route] of ROUTES) await expectRefused(`7  product with no vendorId, ${name}`, route, [P_BAD]);
    await db.collection("products").doc(P_BAD).update({ vendorId: BAD });
  }

  // ---------- 9: unblocking restores ordering ----------
  {
    await setSeller(BAD, "Blocked");
    await expectRefused("9  still blocked, web COD", webCod, [P_BAD]);
    await setSeller(BAD, "Approved"); // what app/admin/vendors's Unblock writes for a KYC-approved seller
    for (const [name, route] of ROUTES) await expectAllowed(`9  after unblock, ${name}`, route, [P_GOOD, P_BAD]);
  }

  // ---------- 10: paid before the block -> kept and flagged ----------
  {
    // Web: intent priced while Approved, seller blocked, payment then finalized.
    await resetBuyer();
    await setSeller(BAD, "Approved");
    const web = await webOnline([P_BAD]);
    const rzpOrder = web.json?.id as string;
    const intent = rzpOrder ? (await db.collection("paymentIntents").doc(rzpOrder).get()).data() as any : null;
    await setSeller(BAD, "Blocked");
    let fin: any = null; let finErr = "";
    try {
      if (intent) fin = await finalizeOnlineOrder({ razorpayPaymentId: "pay_b1_web", razorpayOrderId: rzpOrder, intent, capturedAmountPaise: intent.expectedAmountPaise, source: "webhook" });
    } catch (e) { finErr = (e as Error).message; }
    const ord = fin?.orderId ? (await db.collection("orders").doc(fin.orderId).get()).data() as any : null;
    record("10a web: payment captured before the block still becomes a Paid order",
      web.status === 200 && !!ord && ord.paymentStatus === "Paid" && !finErr,
      `create=${web.status} finalize=${fin?.kind ?? "-"} ${finErr}`);
    record("10b web: that order is flagged needsReview with sellerNotApproved=[seller]",
      ord?.needsReview === true && Array.isArray(ord?.sellerNotApproved) && ord.sellerNotApproved.includes(BAD),
      `needsReview=${ord?.needsReview} sellerNotApproved=${JSON.stringify(ord?.sellerNotApproved)}`);

    // Mobile: same sequence through the mobile intent + finalizer.
    await resetBuyer();
    await setSeller(BAD, "Approved");
    const mob = await mobileOnline([P_BAD]);
    const mobIntent = mob.json?.razorpayOrderId
      ? (await db.collection("paymentIntents").doc(mob.json.razorpayOrderId).get()).data() as any : null;
    await setSeller(BAD, "Blocked");
    let mfin: any = null; let mErr = "";
    try {
      if (mobIntent) mfin = await finalizeMobileOnlineOrder({ razorpayPaymentId: "pay_b1_mob", razorpayOrderId: mob.json.razorpayOrderId, intent: mobIntent, capturedAmountPaise: mobIntent.expectedAmountPaise, source: "webhook" });
    } catch (e) { mErr = (e as Error).message; }
    const mord = mfin?.orderId ? (await db.collection("orders").doc(mfin.orderId).get()).data() as any : null;
    record("10c mobile: payment captured before the block still becomes an order",
      mob.status === 200 && !!mord && !mErr,
      `create=${mob.status} finalize=${mfin?.kind ?? "-"} ${mErr}`);
    record("10d mobile: that order is flagged needsReview with sellerNotApproved=[seller]",
      mord?.needsReview === true && Array.isArray(mord?.sellerNotApproved) && mord.sellerNotApproved.includes(BAD),
      `needsReview=${mord?.needsReview} sellerNotApproved=${JSON.stringify(mord?.sellerNotApproved)}`);

    // And a clean (approved) paid order carries no such flag.
    await resetBuyer();
    await setSeller(BAD, "Approved");
    const clean = await mobileOnline([P_GOOD]);
    const cIntent = clean.json?.razorpayOrderId
      ? (await db.collection("paymentIntents").doc(clean.json.razorpayOrderId).get()).data() as any : null;
    const cfin = cIntent ? await finalizeMobileOnlineOrder({ razorpayPaymentId: "pay_b1_clean", razorpayOrderId: clean.json.razorpayOrderId, intent: cIntent, capturedAmountPaise: cIntent.expectedAmountPaise, source: "webhook" }) : null;
    const cord = cfin && "orderId" in cfin ? (await db.collection("orders").doc(cfin.orderId).get()).data() as any : null;
    record("10e approved-seller paid order is not flagged",
      !!cord && cord.sellerNotApproved === undefined && cord.needsReview === undefined,
      `needsReview=${cord?.needsReview} sellerNotApproved=${JSON.stringify(cord?.sellerNotApproved)}`);
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
