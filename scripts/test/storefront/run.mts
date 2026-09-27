/*
 * LOCAL-ONLY emulator regression harness — Seller Storefront
 * (lib/storefront, app/store/[id] via loadPublicStorefront, app/api/seller/storefront).
 * ---------------------------------------------------------------------------
 * Proves the public storefront shows only an admin-Approved seller's store,
 * only customer-visible products (the shared visibility rule: pending,
 * rejected, blocked and archived excluded; out-of-stock kept), and only the
 * whitelisted public fields — never email, phone, address, bank/KYC, money
 * data or the seller uid; that legacy uid links redirect to the seller-number
 * URL without leaking a hidden store; and that the seller store API is the
 * caller's own store only, changing just the existing Store Settings fields
 * with own-folder images.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production. Auth is faked by
 * intercepting the Identity Toolkit fetch; a throwaway service-account key is
 * generated.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/storefront/run.mts"
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
delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS;

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
const { loadPublicStorefront } = await import("../../../lib/storefront/storefrontServer.ts");
const { GET: storeGet, POST: storePost } = await import("../../../app/api/seller/storefront/route.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function clearAll() {
  for (const name of ["vendors", "vendors_public", "products", "rateLimits"]) await db.recursiveDelete(db.collection(name));
}

const A = "seller_store_a_uid_77";
const B = "seller_store_b_uid_88";
const P = "seller_store_pending";
const X = "seller_store_blocked";
const R = "seller_store_rejected";
const L = "seller_store_legacy";
const D1 = "seller_store_dup_1";
const D2 = "seller_store_dup_2";

const storage = (uid: string, name: string) =>
  `https://firebasestorage.googleapis.com/v0/b/yogi-mart.appspot.com/o/${encodeURIComponent(`vendor-store/${uid}/${name}`)}?alt=media&token=t`;

const PRIVATE = {
  email: "asha.private@example.com", businessPhone: "9876501234", fullName: "Asha Privatename",
  street: "12 Secret Lane", unit: "Flat 9", zipCode: "380009",
  accountHolder: "Asha Privatename", bankName: "Hidden Bank", accountNumber: "112233445566", ifsc: "HIDN0001234",
  panNumber: "ABCDE1234F", aadhaarNumber: "123412341234", gstNumber: "24ABCDE1234F1Z5",
  gstDocUrl: "https://example.invalid/kyc-gst", aadhaarDocUrl: "https://example.invalid/kyc-aadhaar", chequeDocUrl: "https://example.invalid/kyc-cheque",
  pendingPayout: 4321, totalRevenue: 98765, kycStatus: "Approved",
};

const req = (url: string, uid: string | null, method = "GET", body?: unknown) =>
  new Request(url, {
    method,
    headers: { ...(uid ? { authorization: `Bearer test:${uid}:${uid}@example.com:true` } : {}), "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
async function json(res: Response) { return res.json().catch(() => ({})); }

async function seed() {
  const vendor = (uid: string, extra: Record<string, unknown>) =>
    db.collection("vendors").add({ uid, status: "Approved", businessName: `Shop ${uid}`, ...PRIVATE, ...extra });
  await vendor(A, {
    sellerNumber: "SELLER00001", businessName: "Asha Traders",
    storeLogo: storage(A, "logo.png"), storeBanner: storage(A, "banner.png"),
    aboutStore: "Handmade brass lamps.\nShipped from Gujarat.",
  });
  await vendor(B, { sellerNumber: "SELLER00002", businessName: "Bharat Stores", storeLogo: "https://evil.example/tracker.png" });
  await vendor(P, { sellerNumber: "SELLER00003", status: "Pending" });
  await vendor(X, { sellerNumber: "SELLER00004", status: "Blocked" });
  await vendor(R, { sellerNumber: "SELLER00005", status: "Rejected" });
  await vendor(L, { businessName: "Legacy Shop" }); // no sellerNumber
  await vendor(D1, { sellerNumber: "SELLER00009" });
  await vendor(D2, { sellerNumber: "SELLER00009" });
  await db.collection("vendors_public").doc(A).set({
    uid: A, businessName: "Asha Traders", fullName: PRIVATE.fullName, email: PRIVATE.email, businessPhone: PRIVATE.businessPhone,
    status: "Approved", rating: 4.5, storeLogo: storage(A, "logo.png"),
  });

  const product = (id: string, vendorId: string, extra: Record<string, unknown>) =>
    db.collection("products").doc(id).set({
      vendorId, vendorName: "Asha Traders", title: `Item ${id}`, sellingPrice: 500, mrp: 800, stock: 5, categoryId: "HOME",
      thumbnail: "https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg", images: [], costPrice: 271, productNumber: `PCT-${id}`,
      rating: 4, reviewCount: 2, createdAt: new Date(Date.now() - 1000 * id.length), ...extra,
    });
  await product("a_live", A, { approvalStatus: "approved", approved: true, active: true });
  await product("a_oos", A, { approvalStatus: "approved", approved: true, active: true, stock: 0 });
  await product("a_legacy", A, { approved: false, active: true, rating: 0, reviewCount: 0 }); // pre-approval catalog: visible
  await product("a_pending", A, { approvalStatus: "pending", approved: false, active: false });
  await product("a_pending_active", A, { approvalStatus: "pending", active: true }); // defence: still hidden
  await product("a_rejected", A, { approvalStatus: "rejected", approved: false, active: false, rejectionReason: "Counterfeit" });
  await product("a_blocked", A, { approvalStatus: "approved", approved: true, active: false });
  await product("a_archived", A, { approvalStatus: "approved", approved: true, active: false, archived: true, archivedFromStatus: "live" });
  await product("b_live", B, { approvalStatus: "approved", approved: true, active: true, title: "Bharat Kettle" });
  await product("b_pending", B, { approvalStatus: "pending", active: false });
  await product("l_live", L, { approvalStatus: "approved", approved: true, active: true });
}

try {
  await clearAll();
  await seed();

  // ============ 1. Unknown / malformed ============
  const unknown = await Promise.all(
    ["SELLER99999", "seller_nobody", "", "../SELLER00001", "a/b", "x".repeat(129), "bad id!", null, 42].map((id) =>
      loadPublicStorefront(db, id)
    )
  );
  record("1  unknown seller number, unknown uid and malformed ids (empty, path, too long, symbols, non-string) -> not-found",
    unknown.every((r) => r.kind === "not-found"), unknown.map((r) => r.kind).join(","));

  // ============ 2. Approved store by seller number ============
  const a = await loadPublicStorefront(db, "SELLER00001");
  const sf = a.kind === "ok" ? a.storefront : null;
  const ids = sf ? sf.products.map((p) => p.id).sort() : [];
  record("2  approved store: shows only customer-visible products (live, out-of-stock, legacy); pending, pending-but-active, rejected, blocked and archived excluded",
    a.kind === "ok" && JSON.stringify(ids) === JSON.stringify(["a_legacy", "a_live", "a_oos"]),
    JSON.stringify(ids));

  const oos = sf?.products.find((p) => p.id === "a_oos");
  record("3  out-of-stock product stays visible with inStock:false; in-stock products inStock:true",
    oos?.inStock === false && oos?.stock === 0 && sf?.products.find((p) => p.id === "a_live")?.inStock === true, JSON.stringify(oos));

  // ============ 4. Private fields never returned ============
  // Storage download URLs are addressed by object path, and uploads live in
  // owner-scoped folders (vendor-store/{uid}/, products/{uid}/), so an image
  // URL carries the uid as a path segment. That is checked separately below;
  // every OTHER part of the public payload must be free of private data.
  const withoutImageUrls = sf
    ? { ...sf, storeLogo: null, storeBanner: null, products: sf.products.map((p) => ({ ...p, image: "" })) }
    : a;
  const text = JSON.stringify(withoutImageUrls);
  const uidOnlyInImageUrls =
    !!sf && [sf.storeLogo, sf.storeBanner].every((u) => !u || u.includes(encodeURIComponent(`vendor-store/${A}/`)));
  const leaks = [
    A, PRIVATE.email, PRIVATE.businessPhone, PRIVATE.fullName, "Privatename", PRIVATE.street, PRIVATE.zipCode,
    PRIVATE.accountNumber, PRIVATE.ifsc, PRIVATE.bankName, PRIVATE.panNumber, PRIVATE.aadhaarNumber, PRIVATE.gstNumber,
    "kyc-gst", "kyc-aadhaar", "kyc-cheque", "vendorId", "costPrice", "pendingPayout", "totalRevenue", "PCT-", "productNumber",
    "rejectionReason", "Counterfeit", "approvalStatus", "vendorName", "email", "phone",
  ].filter((s) => text.includes(s));
  const storeKeys = sf ? Object.keys(sf).sort().join(",") : "";
  const productKeys = sf?.products[0] ? Object.keys(sf.products[0]).sort().join(",") : "";
  record("4  no private field anywhere in the public storefront: no uid, email, phone, owner name, address, bank, PAN, Aadhaar, GSTIN, KYC docs, payout/revenue, vendorId, costPrice, productNumber, moderation data (the uid appears only as a path segment inside Storage image URLs)",
    leaks.length === 0 && uidOnlyInImageUrls &&
    storeKeys === "about,categories,products,rating,reviewSummary,sellerNumber,storeBanner,storeLogo,storeName" &&
    productKeys === "brand,categoryId,categoryName,createdAtMs,id,image,inStock,mrp,name,price,rating,reviewCount,stock",
    leaks.length ? `LEAKED: ${leaks.join(", ")}` : `store=${storeKeys} product=${productKeys}`);

  record("5  store identity: business name (not owner name), About from Store Settings, logo/banner (Storage URLs), admin rating 4.5, product review summary",
    sf?.storeName === "Asha Traders" && sf?.about === "Handmade brass lamps.\nShipped from Gujarat." &&
    sf?.storeLogo === storage(A, "logo.png") && sf?.storeBanner === storage(A, "banner.png") && sf?.rating === 4.5 &&
    sf?.reviewSummary?.count === 4 && sf?.reviewSummary?.average === 4 && sf?.sellerNumber === "SELLER00001" &&
    sf?.categories.length === 1,
    JSON.stringify({ name: sf?.storeName, rating: sf?.rating, reviews: sf?.reviewSummary }));

  // ============ 6. Legacy uid links / casing ============
  const byUid = await loadPublicStorefront(db, A);
  const lower = await loadPublicStorefront(db, "seller00001");
  record("6  legacy uid link and lowercase seller number redirect to the canonical /store/SELLER00001",
    byUid.kind === "redirect" && byUid.sellerNumber === "SELLER00001" && lower.kind === "redirect" && lower.sellerNumber === "SELLER00001",
    `${byUid.kind}/${lower.kind}`);

  // ============ 7. Hidden / suspended stores ============
  const hidden = await Promise.all(["SELLER00003", "SELLER00004", "SELLER00005", P, X, R].map((id) => loadPublicStorefront(db, id)));
  record("7  Pending, Blocked and Rejected stores are not-found by seller number AND by uid (no redirect that would reveal their seller number)",
    hidden.every((r) => r.kind === "not-found"), hidden.map((r) => r.kind).join(","));

  // ============ 8. Zero visible products / other sellers ============
  const b = await loadPublicStorefront(db, "SELLER00002");
  const bsf = b.kind === "ok" ? b.storefront : null;
  record("8  seller B: only B's own visible product (never A's); A's list never contains B's products; untrusted external logo URL dropped (null)",
    JSON.stringify(bsf?.products.map((p) => p.id)) === JSON.stringify(["b_live"]) && !ids.includes("b_live") &&
    bsf?.storeLogo === null && bsf?.about === "" && bsf?.rating === null,
    JSON.stringify({ products: bsf?.products.map((p) => p.id), logo: bsf?.storeLogo }));

  await db.collection("products").doc("b_live").update({ active: false, archived: true });
  const bEmpty = await loadPublicStorefront(db, "SELLER00002");
  record("9  a store with zero visible products still renders, with an empty product list and no categories (empty state)",
    bEmpty.kind === "ok" && bEmpty.storefront.products.length === 0 && bEmpty.storefront.categories.length === 0 && bEmpty.storefront.reviewSummary === null,
    `${bEmpty.kind}`);

  const legacy = await loadPublicStorefront(db, L);
  const dup = await loadPublicStorefront(db, "SELLER00009");
  record("10 approved seller with no seller number renders at the uid URL (no redirect); a seller number held by two records -> not-found",
    legacy.kind === "ok" && legacy.storefront.sellerNumber === null && legacy.storefront.products.length === 1 &&
    !JSON.stringify(legacy).includes(L) && dup.kind === "not-found",
    `${legacy.kind}/${dup.kind}`);

  // ============ 11. Seller API: GET ============
  const unauth = await storeGet(req("http://x/api/seller/storefront", null));
  const customer = await storeGet(req("http://x/api/seller/storefront", "customer_1"));
  const dupSeller = await storeGet(req("http://x/api/seller/storefront", "seller_store_dup_same"));
  const own = await storeGet(req(`http://x/api/seller/storefront?vendorId=${B}&uid=${B}`, A));
  const ov = await json(own);
  record("11 seller GET: signed out 401, customer 403; A sees ONLY A's store (a vendorId in the URL is ignored): public, /store/SELLER00001, counts, preview == public storefront",
    unauth.status === 401 && customer.status === 403 && dupSeller.status === 403 && own.status === 200 &&
    ov.status?.isPublic === true && ov.publicPath === "/store/SELLER00001" &&
    JSON.stringify(ov.counts) === JSON.stringify({ total: 8, visible: 3, outOfStock: 1, pending: 2, rejected: 1, blocked: 1, archived: 1 }) &&
    JSON.stringify(ov.preview.products.map((p: any) => p.id).sort()) === JSON.stringify(ids) &&
    !JSON.stringify(ov).includes("Bharat") && ov.appearance?.aboutStore === "Handmade brass lamps.\nShipped from Gujarat.",
    `unauth=${unauth.status} customer=${customer.status} own=${own.status} counts=${JSON.stringify(ov.counts)}`);

  const blocked = await json(await storeGet(req("http://x/api/seller/storefront", X)));
  record("12 blocked seller sees their store as HIDDEN (with the reason) and no public link — the preview is still theirs",
    blocked.status?.isPublic === false && /blocked/i.test(blocked.status?.message || "") && blocked.publicPath === null && !!blocked.preview,
    JSON.stringify(blocked.status));

  // ============ 13. Seller API: POST ============
  const post = (uid: string, body: unknown) => storePost(req("http://x/api/seller/storefront", uid, "POST", body)).then(async (r) => ({ status: r.status, body: await json(r) }));
  const bad: Record<string, number> = {
    unknownField: (await post(A, { status: "Approved" })).status,
    businessName: (await post(A, { businessName: "Renamed" })).status,
    vendorUid: (await post(A, { storeLogo: storage(A, "x.png"), uid: B })).status,
    empty: (await post(A, {})).status,
    otherFolder: (await post(A, { storeLogo: storage(B, "logo.png") })).status,
    external: (await post(A, { storeBanner: "https://evil.example/b.png" })).status,
    traversal: (await post(A, { storeLogo: storage(A, "../x.png") })).status,
    nested: (await post(A, { storeLogo: storage(A, "deep/x.png") })).status,
    aboutTooLong: (await post(A, { aboutStore: "x".repeat(2001) })).status,
    aboutNotText: (await post(A, { aboutStore: 5 })).status,
    blockedSeller: (await post(X, { aboutStore: "hi" })).status,
  };
  const expectBad: Record<string, number> = {
    unknownField: 400, businessName: 400, vendorUid: 400, empty: 400, otherFolder: 400, external: 400, traversal: 400,
    nested: 400, aboutTooLong: 400, aboutNotText: 400, blockedSeller: 403,
  };
  const aAfterBad = (await db.collection("vendors").where("uid", "==", A).get()).docs[0].data();
  record("13 seller POST refuses: non-store fields, another seller's id, empty body, images outside the seller's own vendor-store/{uid}/ folder (other seller, external, traversal, nested), over-long / non-text About; a blocked seller 403 — nothing written",
    Object.entries(expectBad).every(([k, s]) => bad[k] === s) && aAfterBad.storeLogo === storage(A, "logo.png") && aAfterBad.businessName === "Asha Traders",
    JSON.stringify(bad));

  const good = await post(A, { storeLogo: storage(A, "logo2.png"), aboutStore: "  New about text\u0007  " });
  const aDoc = (await db.collection("vendors").where("uid", "==", A).get()).docs[0].data();
  const aPub = (await db.collection("vendors_public").doc(A).get()).data() || {};
  const bDoc = (await db.collection("vendors").where("uid", "==", B).get()).docs[0].data();
  const aPublicNow = await loadPublicStorefront(db, "SELLER00001");
  record("14 valid POST updates ONLY A's existing Store Settings fields (logo mirrored to vendors_public, About cleaned and NOT mirrored); B untouched; public storefront reflects it",
    good.status === 200 && aDoc.storeLogo === storage(A, "logo2.png") && aDoc.aboutStore === "New about text" &&
    aPub.storeLogo === storage(A, "logo2.png") && !("aboutStore" in aPub) && aPub.email === PRIVATE.email &&
    bDoc.storeLogo === "https://evil.example/tracker.png" &&
    aPublicNow.kind === "ok" && aPublicNow.storefront.about === "New about text" && aPublicNow.storefront.storeLogo === storage(A, "logo2.png"),
    `status=${good.status} about=${JSON.stringify(aDoc.aboutStore)}`);

  const clear = await post(A, { storeBanner: "" });
  const aCleared = (await db.collection("vendors").where("uid", "==", A).get()).docs[0].data();
  record("15 clearing the banner with \"\" is allowed (storefront shows the default)",
    clear.status === 200 && aCleared.storeBanner === "" && clear.body.preview?.storeBanner === null, `${clear.status}`);
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
