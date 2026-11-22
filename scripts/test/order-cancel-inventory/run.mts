/*
 * LOCAL-ONLY emulator harness — cancellation inventory integrity
 * (app/api/cancel-order + lib/orderInventory.ts).
 * ---------------------------------------------------------------------------
 * A cancellation restores stock / sales ONLY with positive evidence that the
 * order took them at creation (rewardPointsStatus "pending"/"credited",
 * written by the server creation paths in the same transaction). A legacy
 * order with no evidence is cancelled normally but its inventory is left
 * alone and the skip is recorded. Sales never go below zero.
 *
 * Firestore EMULATOR only. Auth is faked by intercepting the Identity Toolkit
 * fetch. A throwaway RSA key stands in for the service account.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/order-cancel-inventory/run.mts"
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
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`, client_id: "0", token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;

const OWNER = "adminyogimart@gmail.com";
// Fake Firebase Auth: token "test:<uid>:<email>:<emailVerified>"
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
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { POST: cancelRoute } = await import("../../../app/api/cancel-order/route.ts");
const { inventoryDeductionEvidence, flooredSalesDecrement } = await import("../../../lib/orderInventory.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["orders", "users", "rewardTransactions", "rateLimits", "audit_logs", "sellerOrders", "notifications",
  "couponRedemptions", "deliveryJobs", "deliveryPersons", "products", "itemRequests"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }

const token = (uid: string, email = `${uid}@example.com`, verified = true) => `test:${uid}:${email}:${verified}`;
const ADMIN = token("admin_uid", OWNER);
const CUSTOMER = "cust_1";
async function call(res: Response) { return { status: res.status, body: await res.json().catch(() => ({})) as any }; }
const cancel = async (orderId: string, auth = ADMIN) => call(await cancelRoute(new Request("http://localhost/api/cancel-order", {
  method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ orderId }),
})));
const product = async (id: string) => (await db.collection("products").doc(id).get()).data() as any;
const order = async (id: string) => (await db.collection("orders").doc(id).get()).data() as any;
const auditFor = async (orderId: string) =>
  (await db.collection("audit_logs").where("targetId", "==", orderId).get()).docs.map((d) => d.data() as any);

const SELLER = "seller_1";
async function seedProduct(id: string, data: Record<string, unknown>) {
  await db.collection("products").doc(id).set({ vendorId: SELLER, title: id, price: 100, ...data });
}
async function seedOrder(id: string, data: Record<string, unknown>) {
  await db.collection("orders").doc(id).set({
    userId: CUSTOMER, userEmail: `${CUSTOMER}@example.com`, vendorIds: [SELLER], status: "Confirmed",
    paymentMethod: "COD", paymentStatus: "Pending", finalTotal: 100, ...data,
  });
}
const line = (id: string, qty: number, extra: Record<string, unknown> = {}) => ({ id, qty, vendorId: SELLER, price: 100, ...extra });

async function main() {
  // ---- U. unit: evidence helper + sales floor ----
  record("U1 evidence: pending -> server-atomic", inventoryDeductionEvidence({ rewardPointsStatus: "pending" }) === "server-atomic");
  record("U2 evidence: credited -> server-atomic", inventoryDeductionEvidence({ rewardPointsStatus: "credited" }) === "server-atomic");
  record("U3 evidence: absent / null / unexpected / non-object -> unverified",
    [{}, { rewardPointsStatus: null }, { rewardPointsStatus: "Pending" }, { rewardPointsStatus: "reversed" }, { rewardPointsStatus: 1 }, null, undefined, "pending"]
      .every((o) => inventoryDeductionEvidence(o) === "unverified"));
  const f1 = flooredSalesDecrement(5, 2), f2 = flooredSalesDecrement(1, 3), f3 = flooredSalesDecrement(undefined, 2), f4 = flooredSalesDecrement(-4, 1), f5 = flooredSalesDecrement("7", 0);
  record("U4 sales floor: min(restored, max(0, sales)); floorApplied only when it bites",
    f1.decrement === 2 && !f1.floorApplied && f2.decrement === 1 && f2.floorApplied && f3.decrement === 0 && f3.floorApplied
      && f4.decrement === 0 && f4.floorApplied && f5.decrement === 0 && !f5.floorApplied);

  // ---- 1. modern COD order: exact restore ----
  await clearAll();
  await seedProduct("p_cod", { stock: 7, sales: 3 });
  await seedOrder("o_cod", { items: [line("p_cod", 2)], rewardPointsStatus: "pending" });
  const r1 = await cancel("o_cod");
  const p1 = await product("p_cod"), o1 = await order("o_cod");
  record("1 modern COD order: stock +2, sales -2, inventoryRestore restored/server-atomic",
    r1.status === 200 && r1.body.inventoryRestored === true && o1.status === "Cancelled" && p1.stock === 9 && p1.sales === 1
      && o1.inventoryRestore?.status === "restored" && o1.inventoryRestore?.evidence === "server-atomic"
      && o1.inventoryRestore?.products?.p_cod?.stockRestored === 2 && o1.inventoryRestore?.products?.p_cod?.salesDecrement === 2,
    JSON.stringify({ status: r1.status, stock: p1.stock, sales: p1.sales }));
  record("1b no audit entry for a clean modern restore", (await auditFor("o_cod")).length === 0);

  // ---- 2. modern online shortfall: restore only what was taken ----
  await clearAll();
  await seedProduct("p_sf", { stock: 0, sales: 1 });
  await seedOrder("o_sf", {
    items: [line("p_sf", 3)], rewardPointsStatus: "pending", paymentMethod: "ONLINE", paymentStatus: "Paid",
    stockDeductedQty: { p_sf: 1 }, finalTotal: 300,
  });
  const r2 = await cancel("o_sf");
  const p2 = await product("p_sf"), o2 = await order("o_sf");
  record("2 online shortfall: stock +1 (recorded figure, not 3), sales 1 -> 0, refund Required",
    r2.status === 200 && p2.stock === 1 && p2.sales === 0 && o2.refundStatus === "Required" && o2.refundAmountDue === 300
      && o2.inventoryRestore?.products?.p_sf?.stockRestored === 1,
    JSON.stringify({ stock: p2.stock, sales: p2.sales, refund: o2.refundStatus }));

  // ---- 3. variant restore ----
  await clearAll();
  await seedProduct("p_var", { stock: 5, sales: 4, variants: [{ id: "v1", stock: 2 }, { id: "v2", stock: 3 }] });
  await seedOrder("o_var", { items: [line("p_var", 2, { variantId: "v1" })], rewardPointsStatus: "credited" });
  const r3 = await cancel("o_var");
  const p3 = await product("p_var"), o3 = await order("o_var");
  record("3 variant line: v1 2 -> 4, v2 untouched, stock re-derived 7, sales 4 -> 2",
    r3.status === 200 && p3.variants.find((v: any) => v.id === "v1").stock === 4 && p3.variants.find((v: any) => v.id === "v2").stock === 3
      && p3.stock === 7 && p3.sales === 2 && o3.inventoryRestore?.products?.p_var?.variants?.v1 === 2,
    JSON.stringify({ stock: p3.stock, sales: p3.sales, variants: p3.variants }));

  // ---- 4. legacy order, stock 10 / sales 0 (the P3 case) ----
  await clearAll();
  await seedProduct("p_leg", { stock: 10, sales: 0 });
  await seedOrder("o_leg", { items: [line("p_leg", 1)] }); // no rewardPointsStatus
  const r4 = await cancel("o_leg");
  const p4 = await product("p_leg"), o4 = await order("o_leg"), a4 = await auditFor("o_leg");
  record("4 legacy order: cancelled, stock stays 10, sales stays 0",
    r4.status === 200 && o4.status === "Cancelled" && p4.stock === 10 && p4.sales === 0,
    JSON.stringify({ stock: p4.stock, sales: p4.sales }));
  record("4b response says inventory NOT restored; order records skipped-unverified with the skipped quantities",
    r4.body.success === true && r4.body.inventoryRestored === false && r4.body.inventoryRestore?.status === "skipped-unverified"
      && r4.body.restockedItems === 0 && o4.inventoryRestore?.status === "skipped-unverified" && o4.inventoryRestore?.evidence === "unverified"
      && o4.inventoryRestore?.products?.p_leg?.skippedQty === 1,
    JSON.stringify(r4.body));
  record("4c audit entry records the evidence and skipped restoration",
    a4.length === 1 && a4[0].action === "order_cancel_inventory" && a4[0].details?.status === "skipped-unverified"
      && a4[0].details?.evidence === "unverified" && a4[0].details?.products?.p_leg?.skippedQty === 1 && a4[0].actorUid === "admin_uid");

  // ---- 5. legacy order where the product has sales > 0 ----
  await clearAll();
  await seedProduct("p_leg2", { stock: 5, sales: 5 });
  await seedOrder("o_leg2", { items: [line("p_leg2", 2)], rewardPointsStatus: "Pending" /* unexpected value */ });
  const r5 = await cancel("o_leg2");
  const p5 = await product("p_leg2");
  record("5 legacy/unexpected-marker order with sales > 0: no inference from counters, nothing restored",
    r5.status === 200 && r5.body.inventoryRestored === false && p5.stock === 5 && p5.sales === 5);

  // ---- 6. modern order, sales below the restored quantity (anomaly) ----
  await clearAll();
  await seedProduct("p_anom", { stock: 0, sales: 1 });
  await seedOrder("o_anom", { items: [line("p_anom", 3)], rewardPointsStatus: "pending" });
  const r6 = await cancel("o_anom");
  const p6 = await product("p_anom"), o6 = await order("o_anom"), a6 = await auditFor("o_anom");
  record("6 sales-floor anomaly: stock fully restored (+3), sales floored at 0, never negative",
    r6.status === 200 && r6.body.inventoryRestored === true && p6.stock === 3 && p6.sales === 0
      && o6.inventoryRestore?.products?.p_anom?.salesFloorApplied === true,
    JSON.stringify({ stock: p6.stock, sales: p6.sales }));
  record("6b anomaly recorded in the audit log", a6.length === 1 && a6[0].details?.salesFloorAnomalies?.[0]?.productId === "p_anom"
    && a6[0].details?.salesFloorAnomalies?.[0]?.wanted === 3 && a6[0].details?.salesFloorAnomalies?.[0]?.applied === 1);

  // ---- 7. duplicate cancellation ----
  await clearAll();
  await seedProduct("p_dup", { stock: 4, sales: 2 });
  await seedOrder("o_dup", { items: [line("p_dup", 2)], rewardPointsStatus: "pending" });
  const d1 = await cancel("o_dup"), d2 = await cancel("o_dup");
  const p7 = await product("p_dup");
  record("7 duplicate cancel: second is alreadyCancelled, restore happens once",
    d1.status === 200 && d2.status === 200 && d2.body.alreadyCancelled === true && p7.stock === 6 && p7.sales === 0,
    JSON.stringify({ stock: p7.stock, sales: p7.sales }));

  // ---- 8. concurrent cancellation ----
  await clearAll();
  await seedProduct("p_cc", { stock: 1, sales: 3 });
  await seedOrder("o_cc", { items: [line("p_cc", 3)], rewardPointsStatus: "pending" });
  const [c1, c2] = await Promise.all([cancel("o_cc"), cancel("o_cc")]);
  const p8 = await product("p_cc");
  const winners = [c1, c2].filter((c) => c.status === 200 && !c.body.alreadyCancelled).length;
  record("8 concurrent cancels: exactly one restores; stock +3 once, sales 3 -> 0",
    winners === 1 && [c1, c2].every((c) => c.status === 200) && p8.stock === 4 && p8.sales === 0,
    JSON.stringify({ winners, stock: p8.stock, sales: p8.sales }));

  // ---- 9. already-cancelled order ----
  await clearAll();
  await seedProduct("p_ac", { stock: 2, sales: 1 });
  await seedOrder("o_ac", { items: [line("p_ac", 1)], rewardPointsStatus: "pending", status: "Cancelled" });
  const r9 = await cancel("o_ac");
  const p9 = await product("p_ac"), o9 = await order("o_ac");
  record("9 already-cancelled order: no writes, no inventoryRestore added",
    r9.status === 200 && r9.body.alreadyCancelled === true && p9.stock === 2 && p9.sales === 1 && o9.inventoryRestore === undefined);

  // ---- 10. multi-item / multi-product, duplicate lines, deleted product ----
  await clearAll();
  await seedProduct("p_a", { stock: 1, sales: 5 });
  await seedProduct("p_b", { stock: 0, sales: 1 });
  await seedProduct("p_untouched", { stock: 9, sales: 9 });
  await seedOrder("o_multi", {
    items: [line("p_a", 1), line("p_a", 2), line("p_b", 1), line("p_gone", 4), { productId: "p_b", quantity: 1, vendorId: SELLER, id: "cartdoc_x" }],
    rewardPointsStatus: "pending",
  });
  const r10 = await cancel("o_multi");
  const pa = await product("p_a"), pb = await product("p_b"), pu = await product("p_untouched"), o10 = await order("o_multi");
  record("10 multi-item: duplicate lines aggregated (p_a +3), mobile-shape line counted (p_b +2), other product untouched",
    r10.status === 200 && pa.stock === 4 && pa.sales === 2 && pb.stock === 2 && pb.sales === 0 && pu.stock === 9 && pu.sales === 9,
    JSON.stringify({ pa, pb }));
  record("10b deleted product skipped safely (no doc created, cancellation still commits)",
    o10.status === "Cancelled" && !(await db.collection("products").doc("p_gone").get()).exists
      && o10.inventoryRestore?.products?.p_gone === undefined && Array.isArray(o10.inventoryRestore?.missingProducts)
      && o10.inventoryRestore.missingProducts.includes("p_gone") && o10.inventoryRestore?.products?.p_b?.salesFloorApplied === true);

  // ---- 11. points / coupon / delivery-halt regression, modern AND legacy ----
  for (const variant of ["modern", "legacy"] as const) {
    await clearAll();
    await seedProduct("p_px", { stock: 3, sales: 1 });
    await db.collection("users").doc(CUSTOMER).set({ rewardPoints: 10 });
    await db.collection("couponRedemptions").doc(`${CUSTOMER}_SAVE10`).set({ orderId: `o_px_${variant}`, userId: CUSTOMER });
    await db.collection("deliveryJobs").doc(`job_${variant}`).set({ orderId: `o_px_${variant}`, status: "Created", shipmentNumber: "TRCK000001" });
    await seedOrder(`o_px_${variant}`, {
      items: [line("p_px", 1)], rewardValue: 50, couponCode: "SAVE10",
      ...(variant === "modern" ? { rewardPointsStatus: "pending" } : {}),
    });
    const r = await cancel(`o_px_${variant}`);
    const u = (await db.collection("users").doc(CUSTOMER).get()).data() as any;
    const coupon = await db.collection("couponRedemptions").doc(`${CUSTOMER}_SAVE10`).get();
    const job = (await db.collection("deliveryJobs").doc(`job_${variant}`).get()).data() as any;
    const p = await product("p_px");
    const stockOk = variant === "modern" ? p.stock === 4 && p.sales === 0 : p.stock === 3 && p.sales === 1;
    // Unchanged points rule (lib/rewardCredit shouldReverseEarnedPoints): a
    // "pending" order earned nothing yet (10 + 50 restored = 60); an order with
    // no rewardPointsStatus predates deferred crediting, so its creation-time
    // earn of floor(100 / 100) = 1 is reversed (10 + 50 - 1 = 59).
    const pointsWant = variant === "modern" ? 60 : 59;
    record(`11 ${variant}: redeemed points restored (balance ${pointsWant}), coupon released, delivery job halted; inventory ${variant === "modern" ? "restored" : "left alone"}`,
      r.status === 200 && u.rewardPoints === pointsWant && !coupon.exists && job.status === "Cancelled" && stockOk,
      JSON.stringify({ points: u.rewardPoints, coupon: coupon.exists, job: job.status, stock: p.stock, sales: p.sales }));
  }

  // ---- 12. replacement reservation is not touched by cancel-order ----
  await clearAll();
  await seedProduct("p_rep", { stock: 4, sales: 6 });
  await db.collection("itemRequests").doc("req_1").set({
    type: "replace", status: "APPROVED", productId: "p_rep", parentOrderId: "o_rep", qty: 1, replacement: { stockDecremented: true },
  });
  await seedOrder("o_rep", { items: [line("p_rep", 2)], rewardPointsStatus: "pending" });
  const r12 = await cancel("o_rep");
  const p12 = await product("p_rep");
  const req = (await db.collection("itemRequests").doc("req_1").get()).data() as any;
  record("12 replacement: request untouched (still APPROVED, stockDecremented), order lines alone restored (+2)",
    r12.status === 200 && req.status === "APPROVED" && req.replacement?.stockDecremented === true && p12.stock === 6 && p12.sales === 4);

  // ---- 13. customer cancel of a Pending legacy order: same rule, no admin-only leak ----
  await clearAll();
  await seedProduct("p_cp", { stock: 10, sales: 0 });
  await seedOrder("o_cp", { items: [line("p_cp", 1)], status: "Pending" });
  const r13 = await cancel("o_cp", token(CUSTOMER));
  const p13 = await product("p_cp"), a13 = await auditFor("o_cp");
  record("13 customer-cancelled legacy Pending order: inventory left alone, audit actor is the customer",
    r13.status === 200 && r13.body.inventoryRestored === false && p13.stock === 10 && p13.sales === 0 && a13.length === 1 && a13[0].actorUid === CUSTOMER);

  // ---- M1. online shortfall evidence (stockShortfall + stockDeductedQty) ----
  const online = { rewardPointsStatus: "pending", paymentMethod: "ONLINE", paymentStatus: "Paid", needsReview: true };

  // 14. all-zero shortfall: nothing taken, so no stockDeductedQty was stored
  await clearAll();
  await seedProduct("p_z", { stock: 0, sales: 0 });
  await seedOrder("o_z", { ...online, items: [line("p_z", 2)], stockShortfall: [{ id: "p_z", name: "p_z", wanted: 2, available: 0 }], finalTotal: 200 });
  const r14 = await cancel("o_z");
  const p14 = await product("p_z"), o14 = await order("o_z");
  record("14 all-zero shortfall (no stockDeductedQty): restores 0 stock, sales stay 0, refund still Required",
    r14.status === 200 && p14.stock === 0 && p14.sales === 0 && o14.status === "Cancelled" && o14.refundStatus === "Required"
      && o14.inventoryRestore?.shortfallLimited?.p_z?.requested === 2 && o14.inventoryRestore?.shortfallLimited?.p_z?.restorable === 0
      && o14.inventoryRestore?.products?.p_z === undefined,
    JSON.stringify({ stock: p14.stock, sales: p14.sales, inv: o14.inventoryRestore }));

  // 15. mixed: partial (1 of 3), short to zero (absent from map), fully deducted
  await clearAll();
  await seedProduct("p_part", { stock: 0, sales: 1 });   // had 1, took 1
  await seedProduct("p_zero", { stock: 0, sales: 0 });   // had 0, took 0
  await seedProduct("p_full", { stock: 3, sales: 1 });   // took 2; sales counter low (floor case)
  await seedOrder("o_mix", {
    ...online,
    items: [line("p_part", 3), line("p_zero", 1), line("p_full", 2)],
    stockShortfall: [{ id: "p_part", name: "p_part", wanted: 3, available: 1 }, { id: "p_zero", name: "p_zero", wanted: 1, available: 0 }],
    stockDeductedQty: { p_part: 1, p_full: 2 },
  });
  const r15 = await cancel("o_mix");
  const pp = await product("p_part"), pz = await product("p_zero"), pf = await product("p_full"), o15 = await order("o_mix"), a15 = await auditFor("o_mix");
  record("15 mixed shortfall: partial +1 (not +3), short-to-zero +0 (not +1), fully deducted +2",
    r15.status === 200 && pp.stock === 1 && pp.sales === 0 && pz.stock === 0 && pz.sales === 0 && pf.stock === 5,
    JSON.stringify({ p_part: [pp.stock, pp.sales], p_zero: [pz.stock, pz.sales], p_full: [pf.stock, pf.sales] }));
  record("15b sales floor still independent of stock: p_full sales 1 -> 0 (wanted 2), anomaly audited; response still fully restored",
    pf.sales === 0 && o15.inventoryRestore?.products?.p_full?.salesFloorApplied === true && r15.body.inventoryRestored === true
      && a15.length === 1 && a15[0].details?.salesFloorAnomalies?.some((x: any) => x.productId === "p_full" && x.wanted === 2 && x.applied === 1));

  // 16. ambiguous variant shortfall: two variants requested, only the product total is known
  await clearAll();
  await seedProduct("p_va", { stock: 0, sales: 1, variants: [{ id: "v1", stock: 0 }, { id: "v2", stock: 0 }] });
  await seedProduct("p_ok", { stock: 1, sales: 1 });
  await seedOrder("o_va", {
    ...online,
    items: [line("p_va", 2, { variantId: "v1" }), line("p_va", 1, { variantId: "v2" }), line("p_ok", 1)],
    stockShortfall: [{ id: "p_va", name: "p_va", wanted: 2, available: 1 }, { id: "p_va", name: "p_va", wanted: 1, available: 0 }],
    stockDeductedQty: { p_va: 1, p_ok: 1 },
  });
  const r16 = await cancel("o_va");
  const pva = await product("p_va"), pok = await product("p_ok"), o16 = await order("o_va"), a16 = await auditFor("o_va");
  record("16 ambiguous variant shortfall: no variant stock invented (v1 0, v2 0, stock 0, sales 1 untouched)",
    r16.status === 200 && pva.variants.find((v: any) => v.id === "v1").stock === 0 && pva.variants.find((v: any) => v.id === "v2").stock === 0
      && pva.stock === 0 && pva.sales === 1,
    JSON.stringify({ variants: pva.variants, stock: pva.stock, sales: pva.sales }));
  record("16b reliable product on the same order still restored (p_ok +1, sales 1 -> 0)", pok.stock === 2 && pok.sales === 0);
  record("16c recorded + audited: partially-restored, skippedQty 3 with variants, reason; response inventoryRestored false",
    o16.inventoryRestore?.status === "partially-restored" && o16.inventoryRestore?.products?.p_va?.skippedQty === 3
      && o16.inventoryRestore?.products?.p_va?.variants?.v1 === 2 && o16.inventoryRestore?.products?.p_va?.variants?.v2 === 1
      && o16.inventoryRestore?.products?.p_va?.reason === "variant-shortfall-ambiguous"
      && r16.body.inventoryRestored === false && r16.body.inventoryRestore?.status === "partially-restored" && r16.body.restockedItems === 1
      && a16.length === 1 && a16[0].details?.status === "partially-restored" && a16[0].details?.products?.p_va?.reason === "variant-shortfall-ambiguous",
    JSON.stringify({ inv: o16.inventoryRestore, body: r16.body }));

  // 17. single requested variant short: attribution is exact, restore exactly what was taken
  await clearAll();
  await seedProduct("p_sv", { stock: 5, sales: 1, variants: [{ id: "v1", stock: 0 }, { id: "v2", stock: 5 }] });
  await seedOrder("o_sv", {
    ...online, items: [line("p_sv", 3, { variantId: "v1" })],
    stockShortfall: [{ id: "p_sv", name: "p_sv", wanted: 3, available: 1 }], stockDeductedQty: { p_sv: 1 },
  });
  const r17 = await cancel("o_sv");
  const psv = await product("p_sv"), o17 = await order("o_sv");
  record("17 single-variant shortfall: v1 +1 (taken), not +3; v2 untouched; stock 6; sales 1 -> 0",
    r17.status === 200 && r17.body.inventoryRestored === true && psv.variants.find((v: any) => v.id === "v1").stock === 1
      && psv.variants.find((v: any) => v.id === "v2").stock === 5 && psv.stock === 6 && psv.sales === 0
      && o17.inventoryRestore?.shortfallLimited?.p_sv?.restorable === 1,
    JSON.stringify({ variants: psv.variants, stock: psv.stock, sales: psv.sales }));

  // 18. unreadable shortfall record fails safe: every product treated as short
  await clearAll();
  await seedProduct("p_m", { stock: 0, sales: 0 });
  await seedOrder("o_m", { ...online, items: [line("p_m", 2)], stockShortfall: { p_m: "?" } });
  const r18 = await cancel("o_m");
  const p18 = await product("p_m");
  record("18 malformed stockShortfall: treated as short, restores only the recorded deduction (none) -> stock 0",
    r18.status === 200 && p18.stock === 0 && p18.sales === 0);

  // 19. a shortfall order's legacy twin (no marker) still restores nothing and keeps its full request on record
  await clearAll();
  await seedProduct("p_lsf", { stock: 4, sales: 2 });
  await seedOrder("o_lsf", { items: [line("p_lsf", 3)], stockShortfall: [{ id: "p_lsf" }], stockDeductedQty: { p_lsf: 1 } });
  const r19 = await cancel("o_lsf");
  const p19 = await product("p_lsf"), o19 = await order("o_lsf");
  record("19 unverified order with shortfall fields: nothing restored, skip record keeps the full request (3)",
    r19.status === 200 && r19.body.inventoryRestored === false && p19.stock === 4 && p19.sales === 2
      && o19.inventoryRestore?.status === "skipped-unverified" && o19.inventoryRestore?.products?.p_lsf?.skippedQty === 3);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error("HARNESS CRASH:", e?.message || e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 50));
