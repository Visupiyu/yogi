/*
 * YOMICO B2 containment — admin order archive + refund parent-order guard.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * Never touches production and never reads the real service account (a
 * throwaway key is generated). Identity Toolkit is faked: token
 * "test:<uid>:<email>:<emailVerified>".
 *
 * Proves:
 *   - only a verified admin can archive an order (POST /api/admin/orders/{id}/archive);
 *   - archiving keeps the order document intact, adds only the marker and
 *     writes exactly one order_archived audit entry in the same transaction;
 *   - a return refund (item-level and old-style) is refused when the parent
 *     order is missing, with zero points, zero ledger rows, no refund number,
 *     no status/flag change and an unchanged seller payable;
 *   - a valid refund on an existing order still credits once, and a replay or
 *     parallel repeat never credits twice.
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/order-containment/run.mts"
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
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`, client_id: "000000000000000000000",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;
delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
delete process.env.RESEND_API_KEY;
delete process.env.GEMINI_API_KEY;

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
  if (url.includes("api.resend.com") || url.includes("generativelanguage")) throw new Error("TEST HARNESS: external call attempted");
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { POST: archiveOrder } = await import("../../../app/api/admin/orders/[id]/archive/route.ts");
const { POST: itemTransition } = await import("../../../app/api/item-request/transition/route.ts");
const { POST: returnStatus } = await import("../../../app/api/admin/returns/[id]/status/route.ts");
const { loadVendorPayableBreakdown } = await import("../../../lib/vendorPayableServer.ts");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["orders", "audit_logs", "itemRequests", "returns", "users", "rewardTransactions", "counters",
  "rateLimits", "notifications", "vendors", "sellerOrders", "vendor_payouts", "withdrawals"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }

const ADMIN = "admin_uid";
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const CUSTOMER = "cust_c1";
const VENDOR = "vendor_c1";
function req(url: string, body: unknown, uid: string | null, email = uid === ADMIN ? ADMIN_EMAIL : `${uid}@example.com`, verified = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (uid) headers.authorization = `Bearer test:${uid}:${email}:${verified}`;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}
const json = async (res: Response): Promise<any> => res.json().catch(() => ({}));
const archive = async (orderId: string, uid: string | null, body: unknown = { reason: "duplicate test order" }, email?: string, verified = true) => {
  const res = await archiveOrder(req(`http://x/api/admin/orders/${orderId}/archive`, body, uid, email, verified), { params: Promise.resolve({ id: orderId }) });
  return { status: res.status, json: await json(res) };
};
const move = async (requestId: string, toStatus: string, uid = ADMIN) => {
  const res = await itemTransition(req("http://x/api/item-request/transition", { requestId, toStatus }, uid));
  return { status: res.status, json: await json(res) };
};
const legacyMove = async (id: string, status: string, uid = ADMIN) => {
  const res = await returnStatus(req(`http://x/api/admin/returns/${id}/status`, { status }, uid), { params: Promise.resolve({ id }) });
  return { status: res.status, json: await json(res) };
};
const data = async (col: string, id: string) => (await db.collection(col).doc(id).get()).data() as any;
const balance = async (uid: string) => Number((await data("users", uid))?.rewardPoints ?? NaN);
const rowsFor = async (uid: string) => (await db.collection("rewardTransactions").where("userId", "==", uid).get()).docs.map((d) => d.data() as any);
const auditsFor = async (targetId: string) =>
  (await db.collection("audit_logs").where("targetId", "==", targetId).get()).docs.map((d) => d.data() as any);
const counter = async () => (await data("counters", "refund"))?.seq ?? null;
const setUser = (uid: string, points: number) => db.collection("users").doc(uid).set({ uid, role: "customer", email: `${uid}@example.com`, rewardPoints: points });
const clearRateLimits = () => db.recursiveDelete(db.collection("rateLimits"));
const stable = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

async function main() {
  await clearAll();
  await db.collection("vendors").doc(VENDOR).set({ uid: VENDOR, status: "Approved", storeName: "Containment Traders" });

  // ================= ARCHIVE =================
  const ORDER = "cust_c1_key0001";
  const orderData = {
    userId: CUSTOMER, vendorIds: [VENDOR], status: "Confirmed", paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending",
    total: 620, finalTotal: 532, discount: 62, rewardValue: 26, items: [{ id: "p1", vendorId: VENDOR, name: "Coffee", price: 620, quantity: 1 }],
    createdAt: Timestamp.fromMillis(Date.parse("2026-08-20T16:47:15Z")),
  };
  await db.collection("orders").doc(ORDER).set(orderData);
  const before = await data("orders", ORDER);

  {
    const anon = await archive(ORDER, null);
    const customer = await archive(ORDER, CUSTOMER);
    const vendor = await archive(ORDER, VENDOR);
    const unverifiedAdmin = await archive(ORDER, ADMIN, { reason: "x" }, ADMIN_EMAIL, false);
    const lookalike = await archive(ORDER, "someone", { reason: "x" }, "adminyogimart@gmail.com.evil.test");
    const after = await data("orders", ORDER);
    record("A1 archive refused for signed-out (401), customer, vendor, unverified-admin and look-alike email (403); order and audit trail untouched",
      anon.status === 401 && customer.status === 403 && vendor.status === 403 && unverifiedAdmin.status === 403 && lookalike.status === 403 &&
        stable(after) === stable(before) && (await auditsFor(ORDER)).length === 0,
      `anon=${anon.status} customer=${customer.status} vendor=${vendor.status} unverified=${unverifiedAdmin.status} lookalike=${lookalike.status}`);
  }

  {
    const badReason = await archive(ORDER, ADMIN, { reason: 12345 });
    const longReason = await archive(ORDER, ADMIN, { reason: "x".repeat(501) });
    record("A2 archive validates the reason (non-text 400, over 500 chars 400) and writes nothing",
      badReason.status === 400 && longReason.status === 400 && stable(await data("orders", ORDER)) === stable(before) && (await auditsFor(ORDER)).length === 0,
      `nonText=${badReason.status} long=${longReason.status}`);
  }

  {
    const res = await archive(ORDER, ADMIN, { reason: "  duplicate test order  " });
    const after = await data("orders", ORDER);
    const { archived, archivedAt, archivedBy, archiveReason, ...rest } = after || {};
    record("A3 admin archive succeeds and PRESERVES the order: every original field unchanged, only archived/archivedAt/archivedBy/archiveReason added",
      res.status === 200 && res.json?.archived === true && !!after && stable(rest) === stable(before) &&
        archived === true && archivedAt instanceof Timestamp && archivedBy === ADMIN && archiveReason === "duplicate test order",
      `status=${res.status} added=${Object.keys(after || {}).filter((k) => !(k in before)).join(",")}`);

    const audits = await auditsFor(ORDER);
    const a = audits[0];
    record("A4 archive writes exactly one order_archived audit entry (actor, target, reason, prior status/payment, same timestamp as the marker)",
      audits.length === 1 && a.action === "order_archived" && a.targetId === ORDER && a.actorUid === ADMIN && a.actorEmail === ADMIN_EMAIL &&
        a.details?.reason === "duplicate test order" && a.details?.status === "Confirmed" && a.details?.paymentMethod === "PAY_ON_DELIVERY_UPI" &&
        a.details?.paymentStatus === "Pending" && a.createdAt?.toMillis?.() === archivedAt?.toMillis?.(),
      `audits=${audits.length} action=${a?.action}`);

    const again = await archive(ORDER, ADMIN, { reason: "second" });
    const afterAgain = await data("orders", ORDER);
    record("A5 archiving again is refused (409): marker, reason and single audit entry unchanged",
      again.status === 409 && stable(afterAgain) === stable(after) && (await auditsFor(ORDER)).length === 1,
      `status=${again.status}`);

    const missing = await archive("no_such_order", ADMIN);
    const badId = await archive("a/b", ADMIN);
    record("A6 archiving a missing order is 404 and creates neither an order nor an audit entry",
      missing.status === 404 && badId.status === 404 && !(await db.collection("orders").doc("no_such_order").get()).exists &&
        (await auditsFor("no_such_order")).length === 0,
      `missing=${missing.status} badId=${badId.status}`);

    const noBody = await archiveOrder(new Request(`http://x/api/admin/orders/ord_nobody/archive`, {
      method: "POST", headers: { authorization: `Bearer test:${ADMIN}:${ADMIN_EMAIL}:true` },
    }), { params: Promise.resolve({ id: "ord_nobody" }) });
    await db.collection("orders").doc("ord_nobody2").set({ userId: CUSTOMER, status: "Pending", items: [] });
    const noBody2 = await archiveOrder(new Request(`http://x/api/admin/orders/ord_nobody2/archive`, {
      method: "POST", headers: { authorization: `Bearer test:${ADMIN}:${ADMIN_EMAIL}:true` },
    }), { params: Promise.resolve({ id: "ord_nobody2" }) });
    const nb = await data("orders", "ord_nobody2");
    record("A7 the reason is optional (no body -> archived with an empty reason)",
      noBody.status === 404 && noBody2.status === 200 && nb?.archived === true && nb?.archiveReason === "",
      `missing=${noBody.status} ok=${noBody2.status}`);
  }

  // ================= REFUND GUARD: item-level =================
  await clearRateLimits();
  const LIVE_ORDER = "cust_c1_live0001";
  await db.collection("orders").doc(LIVE_ORDER).set({
    userId: CUSTOMER, vendorIds: [VENDOR], status: "Delivered", paymentStatus: "Paid", paymentMethod: "ONLINE",
    total: 3180, finalTotal: 3180, items: [{ id: "p2", vendorId: VENDOR, price: 1199, quantity: 1 }, { id: "p3", vendorId: VENDOR, price: 1981, quantity: 1 }],
  });
  await setUser(CUSTOMER, 10);
  const irBase = { type: "return", status: "REFUND_PENDING", userId: CUSTOMER, userEmail: `${CUSTOMER}@example.com`, vendorId: VENDOR, productId: "p2", item: { qty: 1, name: "Watch" }, history: [] };

  {
    await db.collection("itemRequests").doc("ir_orphan").set({ ...irBase, orderId: "gone_order_1", refund: { amount: 1199 } });
    await db.collection("itemRequests").doc("ir_noorder").set({ ...irBase, refund: { amount: 500 } });
    const irBefore = await data("itemRequests", "ir_orphan");
    const noOrderBefore = await data("itemRequests", "ir_noorder");
    const payableBefore = await loadVendorPayableBreakdown(db, VENDOR);
    const counterBefore = await counter();

    const r1 = await move("ir_orphan", "REFUNDED");
    const r2 = await move("ir_noorder", "REFUNDED");
    record("R1 item refund is refused (409) when the parent order is missing, or the request names no order",
      r1.status === 409 && /no longer exists/.test(String(r1.json?.error)) && r2.status === 409,
      `missing=${r1.status} none=${r2.status}`);

    const payableAfter = await loadVendorPayableBreakdown(db, VENDOR);
    record("R2 a refused missing-order refund moves NOTHING: balance, ledger rows, refund counter, request (status/credited/refundNumber/history) and seller payable all unchanged",
      (await balance(CUSTOMER)) === 10 && (await rowsFor(CUSTOMER)).length === 0 && (await counter()) === counterBefore &&
        stable(await data("itemRequests", "ir_orphan")) === stable(irBefore) && stable(await data("itemRequests", "ir_noorder")) === stable(noOrderBefore) &&
        stable(payableAfter) === stable(payableBefore) &&
        (await db.collection("notifications").where("userId", "==", CUSTOMER).get()).empty,
      `balance=${await balance(CUSTOMER)} rows=${(await rowsFor(CUSTOMER)).length} counter=${await counter()}`);

    // Other transitions on an orphan request are not money moves and stay as before.
    await db.collection("itemRequests").doc("ir_orphan_early").set({ ...irBase, status: "REQUESTED", orderId: "gone_order_1", refund: { amount: 10 } });
    const early = await move("ir_orphan_early", "UNDER_REVIEW");
    record("R3 non-refund transitions on a request whose order is missing are unaffected (REQUESTED -> UNDER_REVIEW still 200)",
      early.status === 200 && (await data("itemRequests", "ir_orphan_early"))?.status === "UNDER_REVIEW", `status=${early.status}`);
  }

  {
    await db.collection("itemRequests").doc("ir_live").set({ ...irBase, orderId: LIVE_ORDER, refund: { amount: 1199 } });
    const ok = await move("ir_live", "REFUNDED");
    const ir = await data("itemRequests", "ir_live");
    const rows = await rowsFor(CUSTOMER);
    const lr = await data("rewardTransactions", "refunditem_ir_live");
    record("R4 a valid refund on an existing order still credits exactly once (+1199: 10 -> 1209), one refund_item row, refund number minted",
      ok.status === 200 && ir?.status === "REFUNDED" && ir?.refund?.credited === true && typeof ir?.refund?.refundNumber === "string" &&
        (await balance(CUSTOMER)) === 1209 && rows.length === 1 && lr?.kind === "refund_item" && lr?.delta === 1199 && lr?.requestId === "ir_live",
      `status=${ok.status} balance=${await balance(CUSTOMER)} rows=${rows.length}`);

    const replay = await move("ir_live", "REFUNDED");
    record("R5 replaying REFUNDED is refused and credits nothing more (balance 1209, one row)",
      replay.status !== 200 && (await balance(CUSTOMER)) === 1209 && (await rowsFor(CUSTOMER)).length === 1, `replay=${replay.status}`);

    await clearRateLimits();
    await db.collection("itemRequests").doc("ir_live_par").set({ ...irBase, orderId: LIVE_ORDER, productId: "p3", refund: { amount: 1981 } });
    const outs = await Promise.all(Array.from({ length: 5 }, () => move("ir_live_par", "REFUNDED")));
    record("R6 five parallel REFUNDED calls on a valid request -> exactly one credit (+1981 -> 3190) and one more row",
      outs.filter((o) => o.status === 200).length === 1 && (await balance(CUSTOMER)) === 3190 && (await rowsFor(CUSTOMER)).length === 2,
      `statuses=${outs.map((o) => o.status).join(",")} balance=${await balance(CUSTOMER)}`);
  }

  // ================= REFUND GUARD: old-style returns =================
  await clearRateLimits();
  {
    const U = "cust_c2";
    await setUser(U, 5);
    await db.collection("returns").doc("ret_orphan").set({ userId: U, userEmail: `${U}@example.com`, orderId: "gone_order_2", refundAmount: 18, status: "Approved" });
    await db.collection("returns").doc("ret_noorder").set({ userId: U, refundAmount: 40, status: "Approved" });
    const before1 = await data("returns", "ret_orphan");
    const before2 = await data("returns", "ret_noorder");
    const a = await legacyMove("ret_orphan", "Refunded");
    const b = await legacyMove("ret_noorder", "Refunded");
    record("R7 old-style return: Refunded is refused (409) on a missing or absent parent order; status, credit flag, balance and ledger unchanged",
      a.status === 409 && b.status === 409 && stable(await data("returns", "ret_orphan")) === stable(before1) &&
        stable(await data("returns", "ret_noorder")) === stable(before2) && (await balance(U)) === 5 && (await rowsFor(U)).length === 0,
      `missing=${a.status} none=${b.status} balance=${await balance(U)}`);

    const reject = await legacyMove("ret_orphan", "Rejected");
    record("R8 old-style return: a non-credit status change on a missing order is unaffected (Approved -> Rejected 200, no points)",
      reject.status === 200 && (await data("returns", "ret_orphan"))?.status === "Rejected" && (await balance(U)) === 5, `status=${reject.status}`);

    await db.collection("orders").doc("live_order_2").set({ userId: U, status: "Delivered", items: [] });
    await db.collection("returns").doc("ret_live").set({ userId: U, orderId: "live_order_2", refundAmount: 250, status: "Approved" });
    const c1 = await legacyMove("ret_live", "Refunded");
    const c2 = await legacyMove("ret_live", "Approved");
    const c3 = await legacyMove("ret_live", "Refunded");
    record("R9 old-style return on an existing order credits once (+250: 5 -> 255); Refunded -> Approved -> Refunded never pays twice",
      c1.status === 200 && c2.status === 200 && c3.status === 200 && (await balance(U)) === 255 && (await rowsFor(U)).length === 1 &&
        c1.json?.creditedPoints === 250 && c3.json?.creditedPoints === 0,
      `statuses ${c1.status}/${c2.status}/${c3.status} balance=${await balance(U)}`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error("order-containment harness crashed:", error);
  process.exit(3);
});
