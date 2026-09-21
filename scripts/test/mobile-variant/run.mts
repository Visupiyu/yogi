/*
 * LOCAL-ONLY emulator test harness for the mobile Razorpay + variant backend.
 * ---------------------------------------------------------------------------
 * Runs against the Firebase Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST is
 * injected by `firebase emulators:exec`). It NEVER touches production Firestore,
 * NEVER calls the real Razorpay API (the `razorpay` module is redirected to a
 * fake by hooks.mjs), and NEVER reads the real service-account secret (a throwaway
 * RSA key is generated here and set as FIREBASE_SERVICE_ACCOUNT_KEY for this
 * process only). Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Not part of the app runtime. Invoked by scripts/test/mobile-variant/run.sh via
 * `firebase emulators:exec ... "npx tsx --import ./hooks-register.mjs run.mts"`.
 */
import crypto from "node:crypto";

// ---- 0. Guard: refuse to run without the emulator (never hit prod) ----------
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. This harness must run under `firebase emulators:exec`.");
  process.exit(2);
}

// ---- 1. Test-only env, set BEFORE any app module is imported ----------------
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
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_local";
// no RESEND_API_KEY / GEMINI_API_KEY -> those integrations no-op.

// ---- 2. `razorpay` is redirected to the fake via tsconfig.harness.json paths.

// ---- 3. Fake Firebase Auth (verifyRequestUser uses global fetch) -----------
// Token format the harness sends: "test:<uid>:<email>:<emailVerified>".
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try {
      idToken = JSON.parse(init?.body ?? "{}").idToken ?? "";
    } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) {
      return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    }
    return new Response(
      JSON.stringify({
        users: [
          { localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(input, init);
}) as typeof fetch;

// ---- 4. Import app modules (env + hooks now in place) ----------------------
const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { POST: createPaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { POST: finalizePayment } = await import("../../../app/api/mobile/finalize-payment/route.ts");
const { finalizeMobileOnlineOrder } = await import("../../../lib/mobileOnlineOrder.ts");
const { control } = await import("./control.mjs");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

// ---- 5. Helpers ------------------------------------------------------------
const TEST_UID = "user_test_123";
const OTHER_UID = "user_other_999";
const P_NONVAR = "prod_coffee_nonvar";
const P_VAR = "prod_shirt_var";

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function deleteCollection(name: string) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function clearAll() {
  await Promise.all(["cart", "paymentIntents", "orders", "products", "notifications", "unmatchedPayments"].map(deleteCollection));
}

function freshVariants() {
  return [
    { id: "v_m_brown", attributes: { Size: "M", Color: "Brown" }, stock: 5, price: 599 },
    { id: "v_l_brown", attributes: { Size: "L", Color: "Brown" }, stock: 2, price: 599 },
  ];
}
async function seedProducts() {
  await db.collection("products").doc(P_NONVAR).set({
    name: "Test Coffee", price: 620, mrp: 750, discountPercent: 17, gstPercent: 0,
    vendorId: "vendor_1", vendorName: "Yogi Traders", stock: 10, active: true, sales: 0,
  });
  await db.collection("products").doc(P_VAR).set({
    name: "Test Shirt", price: 599, mrp: 1599, discountPercent: 63, gstPercent: 0,
    vendorId: "vendor_1", vendorName: "Yogi Traders", stock: 7, active: true, sales: 0,
    variants: freshVariants(),
  });
}
async function addCartLine(fields: Record<string, unknown>) {
  await db.collection("cart").add({
    userId: TEST_UID, savedForLater: false, quantity: 1,
    name: "Test Shirt", image: "", price: 599, mrp: 1599, discountPercent: 63, gstPercent: 0,
    vendorId: "vendor_1", vendorName: "Yogi Traders",
    ...fields,
  });
}
function reqFor(url: string, body: unknown, uid = TEST_UID, email = "t@example.com") {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${email}:true`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const CPO_BODY = { customerName: "Test User", phone: "9898989898", address: "cC/4 Test, Vadodara" };
async function callCPO(uid = TEST_UID) {
  control.reset();
  const res = await createPaymentOrder(reqFor("http://x/api/mobile/create-payment-order", CPO_BODY, uid));
  const json: any = await res.json().catch(() => ({}));
  const intents = await db.collection("paymentIntents").get();
  return { status: res.status, json, intentCount: intents.size, ordersCreateCalls: control.calls.ordersCreate };
}
function sig(orderId: string, paymentId: string) {
  return crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");
}

// ============================================================================
async function main() {
  await clearAll();
  await seedProducts();

  // ---------- PHASE 4 — create-payment-order ----------
  // A. Missing variantId on a stock-bearing variant product
  await deleteCollection("cart");
  await addCartLine({ productId: P_VAR, quantity: 1 }); // no variantId
  {
    const r = await callCPO();
    record("4A missing-variant -> 409, no Razorpay order, no paymentIntent",
      r.status === 409 && r.intentCount === 0 && r.ordersCreateCalls === 0,
      `status=${r.status} intents=${r.intentCount} rzpCalls=${r.ordersCreateCalls} msg="${r.json?.error ?? ""}"`);
  }

  // B. Stale variantId (not in the product's current variants)
  await deleteCollection("cart"); await deleteCollection("paymentIntents");
  await addCartLine({ productId: P_VAR, variantId: "v_DELETED", quantity: 1 });
  {
    const r = await callCPO();
    record("4B stale-variant -> 409, no Razorpay order, no paymentIntent",
      r.status === 409 && r.intentCount === 0 && r.ordersCreateCalls === 0,
      `status=${r.status} intents=${r.intentCount} rzpCalls=${r.ordersCreateCalls} msg="${r.json?.error ?? ""}"`);
  }

  // C. Insufficient selected-variant stock (v_l_brown has 2, ask 5)
  await deleteCollection("cart"); await deleteCollection("paymentIntents");
  await addCartLine({ productId: P_VAR, variantId: "v_l_brown", quantity: 5 });
  {
    const r = await callCPO();
    record("4C insufficient-variant-stock -> 409, no Razorpay order, no paymentIntent",
      r.status === 409 && r.intentCount === 0 && r.ordersCreateCalls === 0,
      `status=${r.status} intents=${r.intentCount} rzpCalls=${r.ordersCreateCalls} msg="${r.json?.error ?? ""}"`);
  }

  // D. Valid variant — client selectedVariants deliberately TAMPERED to prove
  //    the server re-derives from variantId and does not trust the client.
  await deleteCollection("cart"); await deleteCollection("paymentIntents");
  await addCartLine({ productId: P_VAR, variantId: "v_m_brown", quantity: 1, selectedVariants: { Size: "TAMPERED", Color: "TAMPERED" } });
  {
    const r = await callCPO();
    const intent = (await db.collection("paymentIntents").get()).docs[0]?.data() as any;
    const item = intent?.items?.[0];
    const okAttrs = item?.selectedVariants?.Size === "M" && item?.selectedVariants?.Color === "Brown";
    record("4D valid-variant -> 200, intent+order created, server-resolved attrs, client not trusted, amount correct",
      r.status === 200 && r.intentCount === 1 && r.ordersCreateCalls === 1 &&
      item?.variantId === "v_m_brown" && okAttrs && r.json?.amount === 59900,
      `status=${r.status} intents=${r.intentCount} rzpCalls=${r.ordersCreateCalls} amount=${r.json?.amount} variantId=${item?.variantId} attrs=${JSON.stringify(item?.selectedVariants)}`);
  }

  // E. Non-variant product via normal product-stock path
  await deleteCollection("cart"); await deleteCollection("paymentIntents");
  await addCartLine({ productId: P_NONVAR, name: "Test Coffee", price: 620, quantity: 2 });
  {
    const r = await callCPO();
    const item = ((await db.collection("paymentIntents").get()).docs[0]?.data() as any)?.items?.[0];
    record("4E non-variant -> 200 via product-stock path, amount correct",
      r.status === 200 && r.intentCount === 1 && r.ordersCreateCalls === 1 && !item?.variantId && r.json?.amount === 124000,
      `status=${r.status} intents=${r.intentCount} amount=${r.json?.amount} variantId=${item?.variantId ?? "(none)"}`);
  }

  // ---------- PHASE 5 — finalizeMobileOnlineOrder (direct) ----------
  function variantIntent(orderId: string, opts?: { qty?: number; uid?: string }) {
    const qty = opts?.qty ?? 1;
    return {
      platform: "mobile" as const, uid: opts?.uid ?? TEST_UID, email: "t@example.com",
      customerName: "Test User", phone: "9898989898", address: "cC/4 Test", deliverySlot: "",
      couponCode: null, cartItemIds: [],
      items: [{ id: "line1", userId: TEST_UID, productId: P_VAR, name: "Test Shirt", image: "",
        price: 599, mrp: 1599, discountPercent: 63, gstPercent: 0, quantity: qty,
        vendorId: "vendor_1", vendorName: "Yogi Traders", savedForLater: false as const,
        selectedVariants: { Size: "M", Color: "Brown" }, variantId: "v_m_brown" }],
      vendorIds: ["vendor_1"], subtotal: 599 * qty, gstAmount: 0, shipping: 0, deliveryCost: 0,
      freeDeliveryApplied: true, discountAmount: 0, finalTotal: 599 * qty,
      expectedAmountPaise: 599 * qty * 100, razorpayOrderId: orderId, status: "created" as const,
      createdAt: Timestamp.now(),
    };
  }

  // 5.1 valid variant finalization -> decrement selected variant, recalc stock, 1 order
  await deleteCollection("orders"); await seedProducts();
  {
    const pay = "pay_valid_1"; const ord = "order_valid_1";
    const out = await finalizeMobileOnlineOrder({ razorpayPaymentId: pay, razorpayOrderId: ord, intent: variantIntent(ord, { qty: 2 }) as any, capturedAmountPaise: 599 * 2 * 100, source: "mobile-app" });
    const prod = (await db.collection("products").doc(P_VAR).get()).data() as any;
    const vM = prod.variants.find((v: any) => v.id === "v_m_brown");
    const vL = prod.variants.find((v: any) => v.id === "v_l_brown");
    const orderDoc = (await db.collection("orders").doc(pay).get()).data() as any;
    const okStock = vM.stock === 3 && vL.stock === 2 && prod.stock === 5; // 5->3 (m), l untouched, sum 3+2=5
    record("5.1 variant finalization decrements selected variant + recomputes product.stock, one order",
      out.kind === "created" && okStock && orderDoc?.items?.[0]?.variantId === "v_m_brown" && orderDoc?.paymentMethod === "ONLINE" && orderDoc?.paymentStatus === "Paid",
      `kind=${out.kind} vM=${vM.stock} vL=${vL.stock} productStock=${prod.stock} orderVariant=${orderDoc?.items?.[0]?.variantId}`);
  }

  // 5.2 insufficient variant at finalization -> money-captured: create order, take what's there, flag review, no negative stock
  await deleteCollection("orders"); await seedProducts();
  {
    const pay = "pay_short_1"; const ord = "order_short_1";
    const out = await finalizeMobileOnlineOrder({ razorpayPaymentId: pay, razorpayOrderId: ord, intent: variantIntent(ord, { qty: 9 }) as any, capturedAmountPaise: 599 * 9 * 100, source: "mobile-app" });
    const prod = (await db.collection("products").doc(P_VAR).get()).data() as any;
    const vM = prod.variants.find((v: any) => v.id === "v_m_brown");
    const orderDoc = (await db.collection("orders").doc(pay).get()).data() as any;
    record("5.2 insufficient variant at finalize -> order still created, took available (no negative), flagged needsReview",
      out.kind === "created" && vM.stock === 0 && prod.stock === 2 && orderDoc?.needsReview === true && Array.isArray(orderDoc?.stockShortfall),
      `kind=${out.kind} vM=${vM.stock} productStock=${prod.stock} needsReview=${orderDoc?.needsReview}`);
  }

  // 5.3 (covered together with 6 below via duplicate finalize) — idempotency
  await deleteCollection("orders"); await seedProducts();
  {
    const pay = "pay_dup_1"; const ord = "order_dup_1";
    const first = await finalizeMobileOnlineOrder({ razorpayPaymentId: pay, razorpayOrderId: ord, intent: variantIntent(ord, { qty: 1 }) as any, capturedAmountPaise: 599 * 100, source: "mobile-app" });
    const second = await finalizeMobileOnlineOrder({ razorpayPaymentId: pay, razorpayOrderId: ord, intent: variantIntent(ord, { qty: 1 }) as any, capturedAmountPaise: 599 * 100, source: "webhook" });
    const orders = await db.collection("orders").get();
    const prod = (await db.collection("products").doc(P_VAR).get()).data() as any;
    const vM = prod.variants.find((v: any) => v.id === "v_m_brown");
    record("5.3/6 duplicate finalization idempotent — exactly one order, no double decrement",
      first.kind === "created" && second.kind === "already" && orders.size === 1 && vM.stock === 4,
      `first=${first.kind} second=${second.kind} orders=${orders.size} vM=${vM.stock}`);
  }

  // ---------- PHASE 5.4 / 5.5 — finalize-payment ROUTE (uid + amount) ----------
  // Seed a mobile paymentIntent, control the fake razorpay verification result.
  async function seedIntent(orderId: string, uid: string) {
    await db.collection("paymentIntents").doc(orderId).set(variantIntent(orderId, { uid, qty: 1 }));
  }
  // 5.4 UID mismatch: intent belongs to OTHER_UID, requester is TEST_UID -> 404, no order
  await deleteCollection("orders"); await deleteCollection("paymentIntents"); await seedProducts();
  {
    const ord = "order_uidmm"; const pay = "pay_uidmm";
    await seedIntent(ord, OTHER_UID);
    control.reset();
    control.ordersFetch = () => ({ id: ord, notes: { verifiedUid: TEST_UID, expectedAmount: String(599 * 100) } });
    control.paymentsFetch = () => ({ id: pay, order_id: ord, status: "captured", amount: 599 * 100 });
    const res = await finalizePayment(reqFor("http://x/api/mobile/finalize-payment", { razorpay_order_id: ord, razorpay_payment_id: pay, razorpay_signature: sig(ord, pay) }, TEST_UID));
    const json: any = await res.json().catch(() => ({}));
    const orders = await db.collection("orders").get();
    record("5.4 UID mismatch -> rejected (404), no order created",
      res.status === 404 && orders.size === 0,
      `status=${res.status} orders=${orders.size} msg="${json?.error ?? ""}"`);
  }
  // 5.5 amount mismatch: payment amount != order expectedAmount -> 400, no order
  await deleteCollection("orders"); await deleteCollection("paymentIntents"); await seedProducts();
  {
    const ord = "order_amtmm"; const pay = "pay_amtmm";
    await seedIntent(ord, TEST_UID);
    control.reset();
    control.ordersFetch = () => ({ id: ord, notes: { verifiedUid: TEST_UID, expectedAmount: String(599 * 100) } });
    control.paymentsFetch = () => ({ id: pay, order_id: ord, status: "captured", amount: 111 * 100 }); // wrong
    const res = await finalizePayment(reqFor("http://x/api/mobile/finalize-payment", { razorpay_order_id: ord, razorpay_payment_id: pay, razorpay_signature: sig(ord, pay) }, TEST_UID));
    const json: any = await res.json().catch(() => ({}));
    const orders = await db.collection("orders").get();
    record("5.5 amount mismatch -> rejected (400), no order created",
      res.status === 400 && orders.size === 0,
      `status=${res.status} orders=${orders.size} msg="${json?.error ?? ""}"`);
  }

  // ---------- PHASE 6 — webhook/callback race (route + finalizer share id) ----
  await deleteCollection("orders"); await deleteCollection("paymentIntents"); await seedProducts();
  {
    const ord = "order_race"; const pay = "pay_race";
    await db.collection("paymentIntents").doc(ord).set(variantIntent(ord, { uid: TEST_UID, qty: 1 }));
    control.reset();
    control.ordersFetch = () => ({ id: ord, notes: { verifiedUid: TEST_UID, expectedAmount: String(599 * 100) } });
    control.paymentsFetch = () => ({ id: pay, order_id: ord, status: "captured", amount: 599 * 100 });
    // "callback" via the route:
    const res = await finalizePayment(reqFor("http://x/api/mobile/finalize-payment", { razorpay_order_id: ord, razorpay_payment_id: pay, razorpay_signature: sig(ord, pay) }, TEST_UID));
    const jr: any = await res.json().catch(() => ({}));
    // "webhook" via the finalizer directly, same ids:
    const wh = await finalizeMobileOnlineOrder({ razorpayPaymentId: pay, razorpayOrderId: ord, intent: variantIntent(ord, { uid: TEST_UID, qty: 1 }) as any, capturedAmountPaise: 599 * 100, source: "webhook" });
    const orders = await db.collection("orders").get();
    const prod = (await db.collection("products").doc(P_VAR).get()).data() as any;
    const vM = prod.variants.find((v: any) => v.id === "v_m_brown");
    record("6 webhook/callback race -> one order (deterministic id), loser idempotent, single decrement",
      res.status === 200 && jr?.success === true && wh.kind === "already" && orders.size === 1 && orders.docs[0].id === pay && vM.stock === 4,
      `callbackStatus=${res.status} webhookKind=${wh.kind} orders=${orders.size} orderId=${orders.docs[0]?.id} vM=${vM.stock}`);
  }

  await clearAll();

  // ---- Summary ----
  const failed = results.filter((r) => !r.pass);
  console.log("\n=================== SUMMARY ===================");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("ALL SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
