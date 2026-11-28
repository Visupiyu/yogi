/*
 * LOCAL-ONLY emulator regression harness — Bulk Product Edit route
 * (app/api/seller/bulk-edit-products).
 *
 * Proves: the seller gates (signed in, ONE Approved vendor record); export
 * returns only the seller's own products; "check" writes nothing; "apply"
 * updates each valid row independently through the shared edit rules (₹499 /
 * MRP policy, derived discount, MRP change on a live product -> back to
 * pending review with an admin notification, price/stock edits stay live)
 * while invalid rows are refused; another seller's product or an unknown id
 * is never touched; variant stock is never set at product level; a product
 * that changed after export is skipped; re-applying, double-submitting, or two
 * concurrent applies never write a change twice; the 100-changes cap and the
 * rate limit hold.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/bulk-edit/route.mts"
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
process.env.RAZORPAY_KEY_ID = "rzp_test_LOCALHARNESS";
process.env.RAZORPAY_KEY_SECRET = "test_secret_local_harness";

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
const { POST: editRoute } = await import("../../../app/api/seller/bulk-edit-products/route.ts");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["products", "vendors", "counters", "rateLimits", "notifications"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const A = "seller_edit_a", B = "seller_edit_b", P = "seller_edit_pending", D = "seller_edit_dup";

async function edit(uid: string | null, body: unknown) {
  const res = await editRoute(new Request("http://x/api/seller/bulk-edit-products", {
    method: "POST",
    headers: { ...(uid ? { authorization: `Bearer test:${uid}:${uid}@example.com:true` } : {}), "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json().catch(() => ({})) as any };
}
const product = (vendorId: string, n: number, extra: Record<string, unknown> = {}) => ({
  vendorId, vendorName: `Shop ${vendorId}`, productNumber: `PCT${String(n).padStart(6, "0")}`, sku: `SKU-${n}`, title: `Product ${n}`,
  approvalStatus: "approved", approved: true, active: true, featured: false, mrp: 999, sellingPrice: 799, stock: 10, gstRate: 12,
  hsn: "9405", returnDays: 7, weight: 0.5, discount: 20, variants: [], sales: 0, createdAt: Timestamp.now(), ...extra,
});
async function getP(id: string) { return (await db.collection("products").doc(id).get()).data() as any; }
const statusOf = (res: any) => (res.body.results || []).map((r: any) => `${r.rowNumber}:${r.status}`).join(",");
const errOf = (res: any, n: number) => ((res.body.results || []).find((r: any) => r.rowNumber === n)?.errors || []).join(" ");

async function seed() {
  const vendor = (uid: string, status = "Approved") =>
    db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status, kycStatus: status });
  await vendor(A); await vendor(B); await vendor(P, "Pending"); await vendor(D); await vendor(D);
  const set = (id: string, data: Record<string, unknown>) => db.collection("products").doc(id).set(data);
  await set("a_price", product(A, 1));
  await set("a_mrp", product(A, 2));
  await set("a_stock", product(A, 3));
  await set("a_floor", product(A, 4));
  await set("a_variant", product(A, 5, { variants: [{ id: "v1", stock: 3, price: 0 }, { id: "v2", stock: 4, price: 0 }], stock: 7 }));
  await set("a_stale", product(A, 6));
  await set("a_pending", product(A, 7, { approvalStatus: "pending", approved: false, active: false }));
  await set("b_product", product(B, 100));
}

try {
  await clearAll();
  await seed();

  // ============ 1. Gates ============
  const g = [await edit(null, { mode: "export" }), await edit(P, { mode: "export" }), await edit(D, { mode: "export" }), await edit(A, { mode: "nope" }), await edit(A, "not json")];
  record("1 gates: signed out 401; Pending seller 403; two vendor records 403; bad mode / bad JSON 400",
    g.map((x) => x.status).join() === "401,403,403,400,400", g.map((x) => x.status).join());

  // ============ 2. Export ============
  const exp = await edit(A, { mode: "export" });
  const rows = exp.body.rows || [];
  const byId = new Map(rows.map((r: any) => [r.productId, r]));
  record("2 export: exactly seller A's 7 products (never B's), sorted by product number, each with its values and a version",
    exp.status === 200 && rows.length === 7 && !byId.has("b_product") && rows[0].productNumber === "PCT000001" &&
    rows.every((r: any) => typeof r.version === "string" && r.version.length === 16) && (byId.get("a_variant") as any)?.variants === "Yes (2)" &&
    (byId.get("a_price") as any)?.values?.sellingPrice === 799, `${rows.length} rows: ${rows.map((r: any) => r.productId).join(",")}`);
  const ver = (id: string) => (byId.get(id) as any)?.version as string;
  const row = (rowNumber: number, productId: string, values: Record<string, unknown>, version = ver(productId)) => ({ rowNumber, productId, version, values });

  // A sale after export: a_stale's stock drops 10 -> 9.
  await db.collection("products").doc("a_stale").update({ stock: 9 });

  const editRows = [
    row(2, "a_price", { sellingPrice: 749, stock: 10 }),           // price edit, stock unchanged
    row(3, "a_mrp", { mrp: 1099 }),                                // MRP on a live product -> review
    row(4, "a_stock", { stock: 25, hsn: "94051000" }),              // stock + HSN
    row(5, "a_floor", { sellingPrice: 498 }),                      // below ₹499
    row(6, "a_variant", { stock: 50 }),                            // variant stock at product level
    row(7, "a_stale", { sellingPrice: 749, stock: 10 }),           // product changed after export
    row(8, "b_product", { sellingPrice: 599 }, "0123456789abcdef"), // another seller's product
    row(9, "does_not_exist", { sellingPrice: 599 }, "0123456789abcdef"),
    row(10, "a_pending", { title: "Renamed", sellingPrice: 699 }),  // non-editable field
    row(11, "a_pending", { mrp: 1299 }),                           // unchanged? no: listed twice with row 10
  ];
  const before = Object.fromEntries(await Promise.all(["a_price", "a_mrp", "a_stock", "a_floor", "a_variant", "a_stale", "b_product", "a_pending"].map(async (id) => [id, await getP(id)])));

  // ============ 3. Check writes nothing ============
  const chk = await edit(A, { mode: "check", rows: editRows });
  const unchangedAfterCheck = (await Promise.all(Object.keys(before).map(async (id) => JSON.stringify(await getP(id)) === JSON.stringify(before[id])))).every(Boolean);
  record("3 check: per-row verdicts and NOTHING written",
    chk.status === 200 && statusOf(chk) === "2:ready,3:ready,4:ready,5:error,6:error,7:stale,8:error,9:error,10:error,11:error" && unchangedAfterCheck,
    statusOf(chk));
  const mrpCheck = (chk.body.results || []).find((r: any) => r.rowNumber === 3);
  const priceCheck = (chk.body.results || []).find((r: any) => r.rowNumber === 2);
  record("4 check shows each change (from -> to) and flags the MRP change as going for review",
    mrpCheck?.reReview === true && priceCheck?.reReview === false &&
    JSON.stringify(priceCheck?.changes) === JSON.stringify([{ field: "sellingPrice", from: 799, to: 749 }]), JSON.stringify(priceCheck?.changes));

  // ============ 5. Apply ============
  const notesBefore = (await db.collection("notifications").where("role", "==", "admin").get()).size;
  const app = await edit(A, { mode: "apply", rows: editRows });
  const pPrice = await getP("a_price"), pMrp = await getP("a_mrp"), pStock = await getP("a_stock");
  record("5 apply: valid rows updated independently; invalid / stale / foreign rows refused",
    app.status === 200 && statusOf(app) === "2:updated,3:updated,4:updated,5:error,6:error,7:stale,8:error,9:error,10:error,11:error" &&
    app.body.summary?.updated === 3, statusOf(app));
  record("6 shared edit rules applied: price -> discount re-derived and still LIVE; stock + HSN written; updatedAt stamped",
    pPrice.sellingPrice === 749 && pPrice.discount === 25 && pPrice.approvalStatus === "approved" && pPrice.active === true &&
    pStock.stock === 25 && pStock.hsn === "94051000" && pPrice.updatedAt && pStock.approvalStatus === "approved",
    JSON.stringify({ sp: pPrice.sellingPrice, d: pPrice.discount, st: pPrice.approvalStatus, stock: pStock.stock }));
  const notesAfter = (await db.collection("notifications").where("role", "==", "admin").get()).size;
  record("7 MRP change on a live product -> back to pending review, hidden, with an admin notification (bulk can't bypass approval)",
    pMrp.mrp === 1099 && pMrp.approvalStatus === "pending" && pMrp.approved === false && pMrp.active === false &&
    (pMrp.reReviewFields || []).includes("mrp") && notesAfter === notesBefore + 1, JSON.stringify({ st: pMrp.approvalStatus, notes: `${notesBefore}->${notesAfter}` }));
  const same = async (id: string) => JSON.stringify(await getP(id)) === JSON.stringify(before[id]);
  record("8 refused rows left exactly as stored: ₹498 (floor), variant stock, another seller's product, the non-editable field rows",
    (await same("a_floor")) && (await same("a_variant")) && (await same("b_product")) && (await same("a_pending")) &&
    /at least ₹499/.test(errOf(app, 5)) && /per variant with Edit/.test(errOf(app, 6)) && /can't be changed with Bulk Edit: title/.test(errOf(app, 10)) &&
    /also in row 10/.test(errOf(app, 11)), `${errOf(app, 5)} | ${errOf(app, 6)} | ${errOf(app, 10)}`);
  const stale = await getP("a_stale");
  record("9 the product that sold a unit after export is skipped as out of date — its stock stays 9 (the sale is not undone)",
    stale.stock === 9 && stale.sellingPrice === 799 && /changed after you downloaded/.test(errOf(app, 7)), `stock=${stale.stock}`);
  record("10 another seller's product and an unknown id get the same 'not found in your products' answer (no ownership oracle)",
    errOf(app, 8) === errOf(app, 9) && /not found in your products/.test(errOf(app, 8)), `${errOf(app, 8)} | ${errOf(app, 9)}`);

  // ============ 11. No repeated writes ============
  const stamp = (await getP("a_price")).updatedAt?.toMillis?.();
  const again = await edit(A, { mode: "apply", rows: editRows.slice(0, 3) });
  record("11 re-applying the same file -> 'unchanged', nothing written (updatedAt untouched)",
    statusOf(again) === "2:unchanged,3:unchanged,4:unchanged" && (await getP("a_price")).updatedAt?.toMillis?.() === stamp, statusOf(again));

  const exp2 = await edit(A, { mode: "export" });
  const v2 = new Map((exp2.body.rows || []).map((r: any) => [r.productId, r.version]));
  const race = await Promise.all([1, 2, 3].map(() => edit(A, { mode: "apply", rows: [{ rowNumber: 2, productId: "a_stock", version: v2.get("a_stock"), values: { stock: 40 } }] })));
  const raceStatuses = race.map((r) => r.body.results?.[0]?.status).sort().join(",");
  record("12 three concurrent applies of the same change -> applied once ('updated' once, 'unchanged' twice), stock 40",
    raceStatuses === "unchanged,unchanged,updated" && (await getP("a_stock")).stock === 40, raceStatuses);

  // ============ 13. Caps ============
  const many = Array.from({ length: 101 }, (_, i) => `bulk_${i}`);
  const batch = db.batch();
  many.forEach((id, i) => batch.set(db.collection("products").doc(id), product(A, 200 + i)));
  await batch.commit();
  const exp3 = await edit(A, { mode: "export" });
  const v3 = new Map((exp3.body.rows || []).map((r: any) => [r.productId, r.version]));
  const tooMany = await edit(A, { mode: "apply", rows: many.map((id, i) => ({ rowNumber: i + 2, productId: id, version: v3.get(id), values: { stock: 11 } })) });
  record("13 more than 100 changed products in one apply -> 400 and nothing written",
    tooMany.status === 400 && /at most 100/.test(tooMany.body.error) && (await getP("bulk_0")).stock === 10, `${tooMany.status} ${tooMany.body.error}`);

  await db.collection("rateLimits").doc(`bulk-edit-products_${A}`).set({ windowStart: Date.now(), count: 30 });
  const limited = await edit(A, { mode: "export" });
  record("14 rate limit: 30 requests per seller per 10 minutes -> 429", limited.status === 429, String(limited.status));
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

try { await clearAll(); } catch (error) { record("CLEANUP", false, String(error)); }

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
