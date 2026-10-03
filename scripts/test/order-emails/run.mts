/*
 * L17 — the shared order-status email (lib/orderStatusEmail.ts) and its
 * transition points: place-order, confirm-order, seller advance-item,
 * delivery reconcile, cancel-order and the Razorpay refund settlement.
 *
 * NEVER sends a real email: RESEND_API_KEY is removed and every send goes to an
 * in-process fake transport. Firestore EMULATOR only; Razorpay is the in-repo
 * fake (../mobile-variant/tsconfig.harness.json).
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/order-emails/run.mts"
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
delete process.env.RESEND_API_KEY;
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: confirmOrder } = await import("../../../app/api/confirm-order/route.ts");
const { POST: advanceItem } = await import("../../../app/api/seller/advance-item/route.ts");
const { POST: cancelOrder } = await import("../../../app/api/cancel-order/route.ts");
const { POST: sendOrderEmailRoute } = await import("../../../app/api/send-order-email/route.ts");
const { applyRefundWebhook } = await import("../../../lib/refunds/orderRefund.ts");
const { emailAfterReconcile } = await import("../../../lib/deliveryEngine/reconcile.ts");
const M = await import("../../../lib/orderStatusEmail.ts");

const db = getAdminDb();
const results: { name: string; pass: boolean }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const COLLECTIONS = ["products", "orders", "sellerOrders", "cart", "counters", "rateLimits", "settings", "notifications",
  "users", "rewardTransactions", "vendors", "vendors_public", "audit_logs", "deliveryJobs", "orderEmails", "couponRedemptions"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }
const json = async (res: Response) => res.json().catch(() => ({}));
const tok = (uid: string, email = `${uid}@example.com`) => `Bearer test:${uid}:${email}:true`;
function post(url: string, body: unknown, uid: string, email?: string) {
  return new Request(url, { method: "POST", headers: { authorization: tok(uid, email), "content-type": "application/json" }, body: JSON.stringify(body) });
}

// ---- fake transport ----
type Sent = { to: string; subject: string; html: string; text: string; key: string };
let sent: Sent[] = [];
let mode: "ok" | "fail" | "throw" = "ok";
M.setOrderEmailTransportForTests(async (message, key) => {
  if (mode === "throw") throw new Error("network down");
  if (mode === "fail") return { ok: false, error: "provider rejected" };
  sent.push({ to: message.to, subject: message.subject, html: message.html, text: message.text, key });
  return { ok: true, id: `fake_${sent.length}` };
});
const sentFor = (orderId: string, word: string) => sent.filter((s) => s.key === `order-email/${orderId}/${word}`);

const ADMIN_UID = "admin_mail_1";
const SELLER = "seller_mail_1";
const BUYER = "buyer_mail_1";
const BUYER_EMAIL = "real.buyer@example.com";
const BODY = { customerName: "Asha <b>Buyer</b> & Co", phone: "9797979797", address: "44 Lane, Surat" };
let n = 0;
const key = () => `mailkey${++n}x${Date.now()}`;

await clearAll();
await db.collection("settings").doc("global").set({ freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
await db.collection("vendors").add({ uid: SELLER, email: `${SELLER}@example.com`, businessName: "Mail Shop", status: "Approved", kycStatus: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } });
await db.collection("products").doc("pm").set({
  title: `Kettle "Pro" <img src=x onerror=alert(1)>`, name: "Kettle", price: 600, sellingPrice: 600, mrp: 900, gstRate: 0,
  stock: 100, sales: 0, active: true, approvalStatus: "approved", approved: true, vendorId: SELLER, vendorName: "Mail Shop",
});

async function place() {
  // place-order stores the verified account email on the order; every email
  // below must go to that stored address and nowhere else.
  const res = await webPlaceOrder(post("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: key(), items: [{ id: "pm", qty: 1 }] }, BUYER, BUYER_EMAIL));
  const j = await json(res);
  if (!j.orderId) throw new Error("place failed " + JSON.stringify(j));
  return j.orderId as string;
}

// ---------------- 1. placed ----------------
const O1 = await place();
{
  const p = sentFor(O1, "placed");
  record("1  placed: one email after place-order, to the order's stored address", p.length === 1 && p[0].to === BUYER_EMAIL, JSON.stringify(p.map((x) => x.to)));
  record("2  placed: subject + body say placed", /Order placed/.test(p[0]?.subject || "") && /Thank you for your order/.test(p[0]?.html || ""));
  record("3  HTML escaping: customer and product names are escaped, no raw tags",
    !!p[0] && p[0].html.includes("Asha &lt;b&gt;Buyer&lt;/b&gt; &amp; Co") && p[0].html.includes("&lt;img src=x onerror=alert(1)&gt;") &&
    !p[0].html.includes("<b>Buyer") && !p[0].html.includes("<img"), p[0]?.html.slice(0, 0));
  // Browser retry through the old route (owner) must not send a second email.
  const r = await sendOrderEmailRoute(post("http://x/api/send-order-email", { orderId: O1 }, BUYER, BUYER_EMAIL));
  const other = await sendOrderEmailRoute(post("http://x/api/send-order-email", { orderId: O1 }, "intruder_1", "intruder@example.com"));
  record("4  duplicate: the browser's send-order-email retry is a no-op (still 1 placed email)", r.status === 200 && sentFor(O1, "placed").length === 1);
  record("5  another account cannot trigger mail for this order (404, nothing sent to them)", other.status === 404 && !sent.some((s) => s.to === "intruder@example.com"));
}

// ---------------- 2. concurrency / direct duplicate ----------------
{
  const before = sentFor(O1, "placed").length;
  await Promise.all([M.sendOrderStatusEmail(O1, "placed"), M.sendOrderStatusEmail(O1, "placed"), M.sendOrderStatusEmail(O1, "placed")]);
  record("6  three concurrent retries of the same order + event send nothing more", sentFor(O1, "placed").length === before);
}

// ---------------- 3. confirmed ----------------
{
  const res = await confirmOrder(post("http://x/api/confirm-order", { orderId: O1 }, ADMIN_UID, ADMIN_EMAIL));
  const status = ((await db.collection("orders").doc(O1).get()).data() as any).status;
  record("7  confirmed: status saved, one 'confirmed' email", res.status === 200 && status === "Confirmed" && sentFor(O1, "confirmed").length === 1 && /Order confirmed/.test(sentFor(O1, "confirmed")[0]?.subject || ""));
  await confirmOrder(post("http://x/api/confirm-order", { orderId: O1 }, ADMIN_UID, ADMIN_EMAIL));
  record("8  repeat confirm: no second email", sentFor(O1, "confirmed").length === 1);
}

// ---------------- 4. shipped / out for delivery / delivered via advance-item ----------------
{
  const recId = `${O1}_${SELLER}`;
  const rec = (await db.collection("sellerOrders").doc(recId).get()).data() as any;
  const itemKey = Object.keys(rec?.itemFulfilment || {})[0];
  const adv = (from: string) => advanceItem(post("http://x/api/seller/advance-item", { recordId: recId, itemKey, fromStatus: from }, ADMIN_UID, ADMIN_EMAIL));
  await adv("Confirmed"); // -> Packed (no email)
  record("9  Packed sends no email", sent.filter((s) => s.key.startsWith(`order-email/${O1}/`)).length === 2);
  await adv("Packed"); // -> Shipped
  record("10 shipped: status saved, one email", ((await db.collection("orders").doc(O1).get()).data() as any).status === "Shipped" && sentFor(O1, "shipped").length === 1);
  await adv("Shipped"); // -> Out For Delivery
  record("11 out for delivery: one email", sentFor(O1, "out_for_delivery").length === 1 && /Out for delivery/.test(sentFor(O1, "out_for_delivery")[0]?.subject || ""));
  await adv("Out For Delivery"); // -> Delivered
  record("12 delivered: status saved, one email", ((await db.collection("orders").doc(O1).get()).data() as any).status === "Delivered" && sentFor(O1, "delivered").length === 1);
  await emailAfterReconcile({ reconciled: true, alreadyReconciled: false, jobId: "j1", orderId: O1, sellerOrderId: recId, parentStatus: "Delivered" } as any);
  record("13 delivery reconcile after a seller/admin delivery: still one 'delivered' email", sentFor(O1, "delivered").length === 1);
}

// ---------------- 5. reconcile-driven delivery ----------------
{
  const O2 = await place();
  await db.collection("orders").doc(O2).update({ status: "Delivered" });
  await emailAfterReconcile({ reconciled: false, alreadyReconciled: true, jobId: "j2", orderId: O2, sellerOrderId: "x", parentStatus: null } as any);
  record("14 an already-reconciled job sends nothing", sentFor(O2, "delivered").length === 0);
  await emailAfterReconcile({ reconciled: true, alreadyReconciled: false, jobId: "j2", orderId: O2, sellerOrderId: "x", parentStatus: "Out For Delivery" } as any);
  record("15 reconcile that does not complete the order sends no 'delivered'", sentFor(O2, "delivered").length === 0);
  await emailAfterReconcile({ reconciled: true, alreadyReconciled: false, jobId: "j2", orderId: O2, sellerOrderId: "x", parentStatus: "Delivered" } as any);
  record("16 reconcile that makes the order Delivered sends one 'delivered'", sentFor(O2, "delivered").length === 1);
}

// ---------------- 6. cancelled + failure never breaks the transition ----------------
{
  const O3 = await place();
  mode = "fail";
  const res = await cancelOrder(post("http://x/api/cancel-order", { orderId: O3 }, BUYER, BUYER_EMAIL));
  const order = (await db.collection("orders").doc(O3).get()).data() as any;
  const ledger = (await db.collection("orderEmails").doc(`${O3}_cancelled`).get()).data() as any;
  record("17 email provider failure: cancellation still succeeds and is saved", res.status === 200 && order.status === "Cancelled", `${res.status} ${order.status}`);
  record("18 the failure is recorded on the ledger, nothing sent", ledger?.status === "failed" && sentFor(O3, "cancelled").length === 0);
  mode = "throw";
  const thrown = await M.sendOrderStatusEmail(O3, "cancelled");
  record("19 a transport that throws never throws to the caller", thrown.status === "failed");
  mode = "ok";
  const retry = await M.sendOrderStatusEmail(O3, "cancelled");
  record("20 a later retry after failures sends exactly one 'cancelled' email", retry.status === "sent" && sentFor(O3, "cancelled").length === 1);
  const again = await M.sendOrderStatusEmail(O3, "cancelled");
  record("21 after success, retries never send again", again.status === "skipped" && sentFor(O3, "cancelled").length === 1);
}
{
  const O4 = await place();
  mode = "fail";
  for (let i = 0; i < 4; i++) await M.sendOrderStatusEmail(O4, "confirmed");
  mode = "ok";
  const capped = await M.sendOrderStatusEmail(O4, "confirmed");
  record("22 attempts are capped (3): no endless retries of a failing send", capped.status === "skipped" && (capped as any).reason === "too-many-attempts");
}

// ---------------- 7. refunded ----------------
{
  const O5 = "pay_mail_refund_1";
  await db.collection("orders").doc(O5).set({
    userId: BUYER, userEmail: BUYER_EMAIL, customerName: "Refund Buyer", orderNumber: "ORD-R1", status: "Cancelled",
    paymentMethod: "ONLINE", razorpayPaymentId: O5, refundStatus: "Processing", razorpayRefundId: "rfnd_mail_1", refundAmountDue: 500,
    items: [{ name: "Kettle", qty: 1 }], finalTotal: 500,
  });
  const out = await applyRefundWebhook({ id: "rfnd_mail_1", status: "processed", amount: 50000, payment_id: O5, notes: { yomicoOrderId: O5 } } as any);
  const order = (await db.collection("orders").doc(O5).get()).data() as any;
  const r = sentFor(O5, "refunded");
  record("23 refunded: refund saved first, then one email with the refunded amount", out.kind === "refunded" && order.refundStatus === "Refunded" && r.length === 1 && r[0].html.includes("₹500"), JSON.stringify(out));
  await applyRefundWebhook({ id: "rfnd_mail_1", status: "processed", amount: 50000, payment_id: O5, notes: { yomicoOrderId: O5 } } as any);
  record("24 a repeated refund webhook sends no second email", sentFor(O5, "refunded").length === 1);
}

// ---------------- 8. recipient + misc ----------------
{
  const O6 = "order_mail_norecipient";
  await db.collection("orders").doc(O6).set({ userId: "u", userEmail: "", status: "Confirmed", items: [] });
  const r = await M.sendOrderStatusEmail(O6, "confirmed");
  record("25 no stored address -> skipped (never falls back to a caller-supplied address)", r.status === "skipped" && (r as any).reason === "no-recipient");
  M.setOrderEmailTransportForTests(null);
  const nc = await M.sendOrderStatusEmail(O1, "refunded");
  record("26 without RESEND_API_KEY and no test transport, nothing is sent (not-configured)", nc.status === "skipped" && (nc as any).reason === "not-configured");
  record("27 every recorded email went to the stored order address only", sent.every((s) => s.to === BUYER_EMAIL));
  record("28 status-to-event mapping", M.emailEventForStatus("Shipped") === "shipped" && M.emailEventForStatus("Out For Delivery") === "out_for_delivery" && M.emailEventForStatus("Packed") === null);
}

await clearAll();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
