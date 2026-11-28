/*
 * LOCAL-ONLY emulator regression harness — Bulk Product Upload route
 * (app/api/seller/bulk-create-products).
 *
 * Proves: the same gates as single-product creation (signed in, Approved
 * seller with ONE vendor record, GST listing eligibility); request limits;
 * "check" writes nothing; "import" creates each valid row independently with
 * exactly the server-owned fields a form-created product gets (pending review,
 * hidden, server identity, fresh product number, derived discount) while
 * invalid rows — incl. a forged ₹100 price or another seller's photo — are
 * refused; and duplicates are impossible: re-submitting, two concurrent
 * submissions, the same SKU twice in one file, or a SKU already used by a
 * form-created product never produce a second product. SKUs are per seller.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Auth is faked by intercepting the Identity
 * Toolkit fetch; a throwaway service-account key is generated.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/bulk-upload/route.mts"
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
const { POST: bulkRoute } = await import("../../../app/api/seller/bulk-create-products/route.ts");
const { POST: createProduct } = await import("../../../app/api/seller/create-product/route.ts");
const { draftFromRow, withImages, MAX_BULK_ROWS } = await import("../../../lib/products/bulkUpload.ts");
const { selectFirebaseConfig } = await import("../../../lib/firebaseConfig.ts");
const { bulkProductDocId } = await import("../../../lib/products/bulkUploadServer.ts");

const db = getAdminDb();
const BUCKET = selectFirebaseConfig().storageBucket;

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["products", "vendors", "counters", "rateLimits"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const A = "seller_bulk_a", B = "seller_bulk_b", P = "seller_bulk_pending", G = "seller_bulk_gst_pending", D = "seller_bulk_dup";

async function call(fn: (r: Request) => Promise<Response>, url: string, body: unknown, uid: string | null) {
  const res = await fn(new Request(url, {
    method: "POST",
    headers: { ...(uid ? { authorization: `Bearer test:${uid}:${uid}@example.com:true` } : {}), "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json().catch(() => ({})) as any };
}
const bulk = (uid: string | null, body: unknown) => call(bulkRoute, "http://x/api/seller/bulk-create-products", body, uid);

const photo = (uid: string, name: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`products/${uid}/${name}`)}?alt=media&token=t`;
/** A row exactly as the seller page builds it. */
function pageRow(rowNumber: number, uid: string, over: Record<string, unknown> = {}, photos = 1) {
  const draft = draftFromRow({ rowNumber, cells: {
    sku: `SKU-${rowNumber}`, title: `Bulk Product ${rowNumber}`, description: "Made for the bulk test.", brand: "Lumo",
    categoryCode: "MEN_TSHIRT_ROUND_NECK", mrp: 999, sellingPrice: 799, stock: 10, gstRate: 12, imageFiles: "a.jpg", ...over,
  } as never });
  if (draft.errors.length) throw new Error(`test row ${rowNumber} invalid: ${draft.errors.join("; ")}`);
  const urls = Array.from({ length: photos }, (_, i) => photo(uid, `r${rowNumber}-${i}.jpg`));
  return { rowNumber, product: withImages(draft.product, urls) };
}
const noPhotos = (r: { rowNumber: number; product: Record<string, unknown> }) => {
  const { images: _i, thumbnail: _t, ...rest } = r.product;
  return { rowNumber: r.rowNumber, product: rest };
};
async function productsOf(uid: string) {
  return (await db.collection("products").where("vendorId", "==", uid).get()).docs.map((d) => ({ id: d.id, ...d.data() } as any));
}

async function seed() {
  const gst = { taxProfile: { gstStatus: "REGISTERED", gstin: "27AAPFU0939F1ZV" }, taxVerificationStatus: "VERIFIED" };
  const vendor = (uid: string, extra: Record<string, unknown>) =>
    db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status: "Approved", kycStatus: "Approved", ...gst, ...extra });
  await vendor(A, {});
  await vendor(B, {});
  await vendor(P, { status: "Pending", kycStatus: "Pending" });
  await vendor(G, { taxVerificationStatus: "PENDING" });
  await vendor(D, {});
  await vendor(D, {});
}

try {
  await clearAll();
  await seed();

  // ============ 1. Gates ============
  const unauth = await bulk(null, { mode: "check", rows: [pageRow(2, A)] });
  const pending = await bulk(P, { mode: "import", rows: [pageRow(2, P)] });
  const gstBlocked = await bulk(G, { mode: "import", rows: [pageRow(2, G)] });
  const dupVendor = await bulk(D, { mode: "import", rows: [pageRow(2, D)] });
  record("1 gates: signed out 401; Pending seller 403; GST not verified 403 GST_LISTING_BLOCKED; two vendor records 403 — and nothing written",
    unauth.status === 401 && pending.status === 403 && gstBlocked.status === 403 && gstBlocked.body.code === "GST_LISTING_BLOCKED" &&
    dupVendor.status === 403 && (await db.collection("products").get()).size === 0,
    `${unauth.status}/${pending.status}/${gstBlocked.status}:${gstBlocked.body.code}/${dupVendor.status}`);

  // ============ 2. Request shape ============
  const shapes = [
    await bulk(A, "not json"),
    await bulk(A, { mode: "publish", rows: [pageRow(2, A)] }),
    await bulk(A, { mode: "import", rows: [] }),
    await bulk(A, { mode: "import", rows: Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => pageRow(i + 2, A)) }),
    await bulk(A, { mode: "import", rows: [pageRow(2, A), { ...pageRow(3, A), rowNumber: 2 }] }),
  ];
  record(`2 bad requests -> 400 (invalid JSON, unknown mode, no rows, more than ${MAX_BULK_ROWS} rows, repeated row number); nothing written`,
    shapes.every((s) => s.status === 400) && (await db.collection("products").get()).size === 0, shapes.map((s) => s.status).join(","));

  // ============ 3. Check mode ============
  const good = [pageRow(2, A), pageRow(3, A, {}, 3), pageRow(4, A, { sellingPrice: 499, mrp: 499 })];
  const forged499 = { ...pageRow(5, A), product: { ...pageRow(5, A).product, sellingPrice: 100 } };
  const foreignPhoto = { ...pageRow(6, A), product: withImages(pageRow(6, A).product, [photo(B, "theirs.jpg")]) };
  const forgedField = { ...pageRow(7, A), product: { ...pageRow(7, A).product, approved: true, vendorId: B } };
  const checkRes = await bulk(A, { mode: "check", rows: [...good, forged499, forgedField].map(noPhotos) });
  const statusOf = (res: any) => res.body.results?.map((r: any) => `${r.rowNumber}:${r.status}`).join(",");
  record("3 check mode: valid rows 'ready', a forged ₹100 price and server-owned fields 'error' — and NOTHING is written",
    checkRes.status === 200 && statusOf(checkRes) === "2:ready,3:ready,4:ready,5:error,7:error" &&
    (await db.collection("products").get()).size === 0 && (await db.collection("counters").get()).size === 0, statusOf(checkRes));

  // ============ 4. Import: partial success ============
  const imp = await bulk(A, { mode: "import", rows: [...good, forged499, foreignPhoto, forgedField] });
  const created = await productsOf(A);
  const errOf = (n: number) => (imp.body.results || []).find((r: any) => r.rowNumber === n)?.errors?.join(" ") || "";
  record("4 import: the 3 valid rows are created, the 3 bad rows refused with reasons (₹499 floor, not your photo, fields that can't be set); one bad row never blocks the others",
    imp.status === 200 && statusOf(imp) === "2:created,3:created,4:created,5:error,6:error,7:error" && created.length === 3 &&
    /at least ₹499/.test(errOf(5)) && /ones you uploaded/.test(errOf(6)) && /can't be set: approved, vendorId/.test(errOf(7)) &&
    imp.body.summary?.created === 3 && imp.body.summary?.error === 3, `${statusOf(imp)} | ${errOf(5)} | ${errOf(6)} | ${errOf(7)}`);

  const p2 = created.find((p) => p.sku === "SKU-2");
  const p3 = created.find((p) => p.sku === "SKU-3");
  const numbers = created.map((p) => p.productNumber);
  record("5 a bulk product starts exactly like a form-created one: pending review and hidden, server identity and vendorName, counters 0, derived discount, fresh distinct product numbers",
    created.every((p) => p.approvalStatus === "pending" && p.approved === false && p.active === false && p.featured === false &&
      p.vendorId === A && p.vendorName === `Shop ${A}` && p.sales === 0 && p.rating === 0 && p.reviewCount === 0 &&
      p.views === 0 && p.wishlistCount === 0 && /^PCT\d{6}$/.test(p.productNumber) && p.createdAt) &&
    new Set(numbers).size === 3 && p2.discount === 20 && p3.images.length === 3 && p3.thumbnail === p3.images[0] &&
    p2.id === bulkProductDocId(A, "SKU-2") && imp.body.results[0].productNumber === p2.productNumber,
    JSON.stringify({ numbers, discount: p2?.discount, status: p2?.approvalStatus }));

  // The same fields through the single-product route, for the key-set comparison.
  const single = await call(createProduct, "http://x/api/seller/create-product", { product: { ...pageRow(40, A, { sku: "FORM-1" }).product } }, A);
  const formDoc = (await db.collection("products").doc(single.body.productId).get()).data() || {};
  // productsOf() adds the document id for convenience; it is not a stored field.
  const keys = (o: object) => Object.keys(o).filter((k) => k !== "id" || o === formDoc).sort().join(",");
  record("6 the stored key set of a bulk product equals that of a form-created product with the same fields (no server field missing or extra)",
    single.status === 200 && keys(formDoc) === keys(p2),
    `only form: ${Object.keys(formDoc).filter((k) => !(k in p2)).join(",")} | only bulk: ${Object.keys(p2).filter((k) => !(k in formDoc)).join(",")}`);

  // ============ 7. Duplicates ============
  const again = await bulk(A, { mode: "import", rows: good });
  record("7 re-submitting the same rows (double click / retry / same file again) -> all 'duplicate', no new product, no number burned",
    statusOf(again) === "2:duplicate,3:duplicate,4:duplicate" && (await productsOf(A)).length === 4, statusOf(again));

  const formSku = await bulk(A, { mode: "import", rows: [pageRow(41, A, { sku: "form-1" })] });
  record("8 a SKU already used by a form-created product (case-insensitive) -> 'duplicate'", statusOf(formSku) === "41:duplicate", statusOf(formSku));

  const checkDup = await bulk(A, { mode: "check", rows: [noPhotos(pageRow(2, A)), noPhotos(pageRow(9, A))] });
  record("9 check mode already reports an existing SKU as 'duplicate' (so its photos are never uploaded)", statusOf(checkDup) === "2:duplicate,9:ready", statusOf(checkDup));

  const twice = await bulk(A, { mode: "import", rows: [pageRow(10, A, { sku: "TWIN" }), pageRow(11, A, { sku: "twin" })] });
  record("10 the same SKU twice in one upload -> both rows refused, neither created",
    statusOf(twice) === "10:error,11:error" && !(await productsOf(A)).some((p) => p.sku.toUpperCase() === "TWIN"), statusOf(twice));

  const race = await Promise.all([1, 2, 3].map(() => bulk(A, { mode: "import", rows: [pageRow(12, A, { sku: "RACE-1" })] })));
  const raceDocs = (await productsOf(A)).filter((p) => p.sku === "RACE-1");
  const raceStatuses = race.map((r) => r.body.results?.[0]?.status).sort().join(",");
  record("11 three concurrent imports of the same new SKU -> exactly ONE product (one 'created', the others 'duplicate')",
    raceDocs.length === 1 && raceStatuses === "created,duplicate,duplicate", `${raceStatuses} docs=${raceDocs.length}`);

  const otherSeller = await bulk(B, { mode: "import", rows: [pageRow(2, B)] });
  const bDoc = (await productsOf(B))[0];
  record("12 SKUs are per seller: seller B may use SKU-2 too — a separate product under B, A's untouched",
    statusOf(otherSeller) === "2:created" && bDoc?.vendorId === B && bDoc.id !== p2.id && (await productsOf(A)).length === 5,
    statusOf(otherSeller));

  // ============ 13. Rate limit ============
  await db.collection("rateLimits").doc(`bulk-create-products_${A}`).set({ windowStart: Date.now(), count: 20 });
  const limited = await bulk(A, { mode: "check", rows: [noPhotos(pageRow(50, A))] });
  record("13 rate limit: 20 uploads per seller per 10 minutes -> 429", limited.status === 429, String(limited.status));
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

try { await clearAll(); } catch (error) { record("CLEANUP", false, String(error)); }

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
