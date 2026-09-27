/*
 * LOCAL-ONLY emulator regression harness — Seller Product Management, Phase 1
 * (product write hardening + lifecycle foundation).
 * ---------------------------------------------------------------------------
 *   app/api/seller/create-product, app/api/seller/update-product,
 *   app/api/seller/product-status, app/api/admin/products/[id]/moderation,
 *   app/api/admin/products/[id]/manage, app/api/reviews/sync-rating
 *
 * Proves: the browser can send only the seller product fields (anything else
 * is refused, never trimmed); identity and vendorName come from the verified
 * seller; only an Approved seller edits; editing approved content sends the
 * product back to the existing pending review; archive takes a product off
 * sale without deleting it (and it cannot be bought) while its orders stay
 * readable; a rejected product can be resubmitted but never self-published;
 * moderation is audit-logged and notifies the seller; admin feature/delete go
 * through the server; and the product rating is recomputed on the server from
 * real reviews only.
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/seller-products/run.mts"
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
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { POST: createProduct } = await import("../../../app/api/seller/create-product/route.ts");
const { POST: updateProduct } = await import("../../../app/api/seller/update-product/route.ts");
const { POST: productStatus } = await import("../../../app/api/seller/product-status/route.ts");
const { POST: moderateRoute } = await import("../../../app/api/admin/products/[id]/moderation/route.ts");
const { POST: manageRoute } = await import("../../../app/api/admin/products/[id]/manage/route.ts");
const { POST: syncRating } = await import("../../../app/api/reviews/sync-rating/route.ts");
const { POST: webPlaceOrder } = await import("../../../app/api/place-order/route.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: confirmOrder } = await import("../../../app/api/confirm-order/route.ts");
const { GET: orderStatement } = await import("../../../app/api/seller/order-statement/route.ts");
const { isProductVisible, productModerationStatus } = await import("../../../lib/products/visibility.ts");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = [
  "cart", "paymentIntents", "orders", "sellerOrders", "products", "notifications", "unmatchedPayments",
  "vendors", "settings", "coupons", "couponRedemptions", "counters", "rateLimits", "withdrawals",
  "vendor_payouts", "itemRequests", "returns", "users", "deliveryJobs", "adminLogs", "audit_logs",
  "productReviews",
];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const ADMIN_UID = "admin_products_1";
const A = "seller_prod_a";
const B = "seller_prod_b";
const BL = "seller_prod_blocked";
const RJ = "seller_prod_rejected";
const BUYER = "buyer_prod_1";

function req(url: string, body: unknown, uid: string | null, method = "POST", email = uid ? `${uid}@example.com` : "") {
  return new Request(url, {
    method,
    headers: {
      ...(uid ? { authorization: `Bearer test:${uid}:${email}:true` } : {}),
      "content-type": "application/json",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }
async function call(fn: (r: Request) => Promise<Response>, url: string, body: unknown, uid: string | null, email?: string) {
  const res = await fn(req(url, body, uid, "POST", email));
  return { status: res.status, body: await json(res) };
}
const create = (uid: string, product: unknown) => call(createProduct, "http://x/api/seller/create-product", { product }, uid);
const update = (uid: string, productId: string, product: unknown) =>
  call(updateProduct, "http://x/api/seller/update-product", { productId, product }, uid);
const status = (uid: string, productId: string, action: string) =>
  call(productStatus, "http://x/api/seller/product-status", { productId, action }, uid);
async function moderate(id: string, body: unknown, uid = ADMIN_UID, email = ADMIN_EMAIL) {
  const res = await moderateRoute(req(`http://x/api/admin/products/${id}/moderation`, body, uid, "POST", email), { params: Promise.resolve({ id }) });
  return { status: res.status, body: await json(res) };
}
async function manage(id: string, action: string, uid = ADMIN_UID, email = ADMIN_EMAIL) {
  const res = await manageRoute(req(`http://x/api/admin/products/${id}/manage`, { action }, uid, "POST", email), { params: Promise.resolve({ id }) });
  return { status: res.status, body: await json(res) };
}
const sync = (uid: string, productId: string, email?: string) =>
  call(syncRating, "http://x/api/reviews/sync-rating", { productId }, uid, email);
async function getP(id: string) { return (await db.collection("products").doc(id).get()).data() as any; }
async function auditCount(action: string, targetId?: string) {
  const snap = await db.collection("audit_logs").where("action", "==", action).get();
  return snap.docs.filter((d) => !targetId || d.data().targetId === targetId).length;
}
async function sellerNotes(uid: string) {
  return (await db.collection("notifications").where("userId", "==", uid).where("role", "==", "seller").get()).docs.map((d) => d.data());
}

const BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road" };
let n = 0;
const key = () => `prodkey${++n}x${Date.now()}`;
async function webCod(productId: string) {
  const res = await webPlaceOrder(req("http://x/api/place-order", { ...BODY, paymentMethod: "PAY_ON_DELIVERY_UPI", idempotencyKey: key(), items: [{ id: productId, qty: 1 }] }, BUYER));
  return { status: res.status, body: await json(res) };
}
async function mobileCod(productId: string) {
  for (const d of (await db.collection("cart").where("userId", "==", BUYER).get()).docs) await d.ref.delete();
  await db.collection("cart").add({ userId: BUYER, savedForLater: false, productId, quantity: 1, name: "x", price: 1 });
  const res = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...BODY, deliverySlot: "", idempotencyKey: key() }, BUYER));
  return { status: res.status, body: await json(res) };
}

const VALID = {
  title: "Brass Lamp", description: "A lamp", brand: "Lumo", categoryId: "HOME", sellingPrice: 499, mrp: 799,
  stock: 20, gstRate: 12, thumbnail: "https://x/t.jpg", images: ["https://x/t.jpg"], slug: "brass-lamp", variants: [],
  specifications: { Material: "Brass", Height: "30cm" }, warranty: "", returnDays: 7,
};

async function seed() {
  await db.collection("settings").doc("global").set({
    commissionEnabled: true, commissionRate: 0.1, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49,
  });
  const vendor = (uid: string, status: string, businessName: string) =>
    db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName, fullName: `Owner ${uid}`, status, kycStatus: status, taxProfile: { gstStatus: "UNREGISTERED" } });
  await vendor(A, "Approved", "Asha Traders");
  await vendor(B, "Approved", "Bharat Stores");
  await vendor(BL, "Blocked", "Blocked Co");
  await vendor(RJ, "Rejected", "Rejected Co");
  for (const [id, uid] of [["p_blocked_seller", BL], ["p_rejected_seller", RJ]] as const) {
    await db.collection("products").doc(id).set({ ...VALID, vendorId: uid, vendorName: "x", approvalStatus: "approved", approved: true, active: true, sales: 0 });
  }
}

try {
  await clearAll();
  await seed();

  // ============ 1. Create: strict allow-list ============
  const forbidden: Record<string, unknown> = {
    vendorName: "YOMICO Official", vendorId: B, sales: 5000, rating: 5, reviewCount: 999, views: 100000,
    wishlistCount: 50, productNumber: "PCT999999", createdAt: "2020-01-01", approvalStatus: "approved",
    approved: true, active: true, featured: true, archived: false, rejectionReason: "x", moderatedBy: A, isBestSeller: true,
  };
  const createStatuses: Record<string, number> = {};
  for (const [k, v] of Object.entries(forbidden)) createStatuses[k] = (await create(A, { ...VALID, [k]: v })).status;
  record("1  create refuses (400) a body carrying ANY non-seller field — vendorName, vendorId, counters, productNumber, createdAt, approval/moderation/lifecycle flags, unknown keys; nothing created",
    Object.values(createStatuses).every((s) => s === 400) && (await db.collection("products").where("vendorId", "==", A).get()).empty,
    JSON.stringify(createStatuses));

  // ============ 2. Create: server-derived identity ============
  const c = await create(A, VALID);
  const P = c.body.productId as string;
  const p0 = await getP(P);
  record("2  valid create: vendorId from the token, vendorName from the seller's record (Asha Traders), counters 0, pending + hidden, server productNumber",
    c.status === 200 && p0.vendorId === A && p0.vendorName === "Asha Traders" &&
    p0.sales === 0 && p0.rating === 0 && p0.reviewCount === 0 && p0.views === 0 && p0.wishlistCount === 0 &&
    p0.approvalStatus === "pending" && p0.active === false && p0.approved === false && p0.featured === false &&
    /^PCT\d{6}$/.test(p0.productNumber) && !isProductVisible(p0),
    `${c.status} vendorName=${p0?.vendorName} status=${p0?.approvalStatus}`);

  const blockedCreate = await create(BL, VALID);
  const rejectedCreate = await create(RJ, VALID);
  record("3  Blocked and Rejected sellers cannot create (403, unchanged)",
    blockedCreate.status === 403 && rejectedCreate.status === 403, `${blockedCreate.status}/${rejectedCreate.status}`);

  // ============ 4. Update: strict allow-list, ownership, seller status ============
  const updStatuses: Record<string, number> = {};
  for (const [k, v] of Object.entries(forbidden)) updStatuses[k] = (await update(A, P, { stock: 21, [k]: v })).status;
  const pAfterForbidden = await getP(P);
  const otherSeller = await update(B, P, { stock: 1 });
  const blockedEdit = await update(BL, "p_blocked_seller", { stock: 1 });
  const rejectedEdit = await update(RJ, "p_rejected_seller", { stock: 1 });
  const noVendor = await update(BUYER, P, { stock: 1 });
  record("4  update refuses every non-seller field (400, nothing written — not even the valid stock beside it); other seller 403; Blocked / Rejected / no-vendor 403",
    Object.values(updStatuses).every((s) => s === 400) && pAfterForbidden.stock === 20 && pAfterForbidden.vendorName === "Asha Traders" &&
    otherSeller.status === 403 && blockedEdit.status === 403 && rejectedEdit.status === 403 && noVendor.status === 403 &&
    (await getP("p_blocked_seller")).stock === 20 && (await getP("p_rejected_seller")).stock === 20,
    `${JSON.stringify(updStatuses)} other=${otherSeller.status} blocked=${blockedEdit.status} rejected=${rejectedEdit.status} none=${noVendor.status}`);

  const pendingEdit = await update(A, P, { title: "Brass Lamp Pro", stock: 25, sellingPrice: 549 });
  const p1 = await getP(P);
  record("5  approved seller, pending product: title/stock/price edit applied, stays pending, no re-review flag",
    pendingEdit.status === 200 && pendingEdit.body.reReview === false && p1.title === "Brass Lamp Pro" && p1.stock === 25 &&
    p1.sellingPrice === 549 && p1.approvalStatus === "pending",
    `${pendingEdit.status} reReview=${pendingEdit.body.reReview}`);

  // ============ 6. Moderation: audit + seller notification ============
  const denied = await moderate(P, { action: "approve" }, A, `${A}@example.com`);
  const approve = await moderate(P, { action: "approve" });
  const p2 = await getP(P);
  const notes6 = await sellerNotes(A);
  record("6  admin approve (seller 403): live; audit_logs product_approve; the seller gets a 'Product approved' notification in their feed",
    denied.status === 403 && approve.status === 200 && isProductVisible(p2) && p2.approvalStatus === "approved" &&
    (await auditCount("product_approve", P)) === 1 &&
    notes6.some((x) => x.title === "Product approved" && x.type === "vendor" && x.read === false),
    `approve=${approve.status} audits=${await auditCount("product_approve", P)} notes=${notes6.length}`);

  // ============ 7. Live edits and re-review ============
  const priceEdit = await update(A, P, { sellingPrice: 599, stock: 30, mrp: 999, warranty: "1 year" });
  const p3 = await getP(P);
  const specReorder = await update(A, P, { specifications: { Height: "30cm", Material: "Brass" } });
  const p3b = await getP(P);
  record("7  approved product: price/stock/MRP/warranty edit and a key-reordered (identical) specifications save stay LIVE — no re-review",
    priceEdit.status === 200 && priceEdit.body.reReview === false && p3.sellingPrice === 599 && isProductVisible(p3) &&
    specReorder.status === 200 && specReorder.body.reReview === false && isProductVisible(p3b),
    `price=${priceEdit.body.reReview} spec=${specReorder.body.reReview}`);

  const titleEdit = await update(A, P, { title: "Totally Different Product" });
  const p4 = await getP(P);
  const adminNote = await db.collection("notifications").where("title", "==", "Product edit needs review").get();
  record("8  approved product: a TITLE edit is applied but sends it back to pending review (hidden), reReviewFields ['title'], admin notified",
    titleEdit.status === 200 && titleEdit.body.reReview === true && JSON.stringify(titleEdit.body.reReviewFields) === JSON.stringify(["title"]) &&
    p4.title === "Totally Different Product" && p4.approvalStatus === "pending" && p4.active === false && !isProductVisible(p4) &&
    adminNote.size === 1,
    `${titleEdit.status} ${JSON.stringify(titleEdit.body)}`);

  for (const [label, change] of [
    ["images", { images: ["https://x/other.jpg"] }],
    ["description", { description: "Now a different item" }],
    ["specifications", { specifications: { Material: "Plastic" } }],
    ["variant attributes", { variants: [{ id: "v1", attributes: { Colour: "Red" }, stock: 3, price: 0 }] }],
  ] as const) {
    await moderate(P, { action: "approve" });
    const r = await update(A, P, change);
    const p = await getP(P);
    record(`9  approved product: changing ${label} -> re-review (pending, hidden)`,
      r.status === 200 && r.body.reReview === true && p.approvalStatus === "pending" && !isProductVisible(p),
      `${r.status} fields=${JSON.stringify(r.body.reReviewFields)}`);
  }
  await moderate(P, { action: "approve" });
  const variantStock = await update(A, P, { variants: [{ id: "v1", attributes: { Colour: "Red" }, stock: 9, price: 650 }] });
  record("10 approved product: changing only a variant's stock/price does NOT trigger re-review",
    variantStock.status === 200 && variantStock.body.reReview === false && isProductVisible(await getP(P)),
    `reReview=${variantStock.body.reReview}`);

  // ============ 11. Order history, then archive ============
  const P2 = (await create(A, { ...VALID, title: "Oak Shelf", slug: "oak-shelf" })).body.productId as string;
  await moderate(P2, { action: "approve" });
  const order = await webCod(P2);
  const orderId = order.body.orderId as string;
  const confirmStatus = (await confirmOrder(req("http://x/api/confirm-order", { orderId }, ADMIN_UID, "POST", ADMIN_EMAIL))).status;
  const archiveOther = await status(B, P2, "archive");
  const archive = await status(A, P2, "archive");
  const pa = await getP(P2);
  const archiveAgain = await status(A, P2, "archive");
  record("11 seller archives own LIVE product: archived, active:false, from 'live', status 'archived', hidden; other seller 403; again 409",
    order.status === 200 && confirmStatus === 200 &&
    archiveOther.status === 403 && archive.status === 200 && pa.archived === true && pa.active === false &&
    pa.archivedFromStatus === "live" && productModerationStatus(pa) === "archived" && !isProductVisible(pa) &&
    archiveAgain.status === 409 && !!(await getP(P2)),
    `order=${order.status} confirm=${confirmStatus} archive=${archive.status} again=${archiveAgain.status}`);

  const buyWeb = await webCod(P2);
  const buyMobile = await mobileCod(P2);
  const orderDoc = (await db.collection("orders").doc(orderId).get()).data();
  const sellerOrder = await db.collection("sellerOrders").doc(`${orderId}_${A}`).get();
  const stmtRes = await orderStatement(req(`http://x/api/seller/order-statement?orderId=${orderId}`, null, A, "GET"));
  record("12 archived product cannot be purchased (web COD + mobile COD refused) while its EXISTING order, seller record and settlement statement stay readable",
    buyWeb.status !== 200 && buyMobile.status !== 200 &&
    !!orderDoc && orderDoc.status === "Confirmed" && sellerOrder.exists && stmtRes.status === 200,
    `web=${buyWeb.status} mobile=${buyMobile.status} order=${orderDoc?.status} statement=${stmtRes.status}`);

  const restore = await status(A, P2, "unarchive");
  const pr = await getP(P2);
  record("13 restoring an archived LIVE product puts it back on sale (archived:false, active:true, visible)",
    restore.status === 200 && pr.archived === false && pr.active === true && isProductVisible(pr) && !("archivedFromStatus" in pr),
    `${restore.status} active=${pr?.active}`);

  const P3 = (await create(A, { ...VALID, title: "Clay Pot", slug: "clay-pot" })).body.productId as string;
  await status(A, P3, "archive");
  const restorePending = await status(A, P3, "unarchive");
  const pp = await getP(P3);
  const blArchive = await status(BL, "p_blocked_seller", "archive");
  const blRestore = await status(BL, "p_blocked_seller", "unarchive");
  record("14 archive/restore of a PENDING product brings it back still pending + hidden (no self-publish); a Blocked seller may archive but not restore",
    restorePending.status === 200 && pp.approvalStatus === "pending" && pp.active === false && !isProductVisible(pp) &&
    blArchive.status === 200 && blRestore.status === 403 && (await getP("p_blocked_seller")).active === false,
    `restore=${restorePending.status} blArchive=${blArchive.status} blRestore=${blRestore.status}`);

  // ============ 15. Reject -> resubmit ============
  const reject = await moderate(P3, { action: "reject", reason: "Blurry photos" });
  const rejectNote = (await sellerNotes(A)).find((x) => x.title === "Product rejected");
  const resubmitOther = await status(B, P3, "resubmit");
  const resubmit = await status(A, P3, "resubmit");
  const prs = await getP(P3);
  const resubmitAgain = await status(A, P3, "resubmit");
  const resubmitLive = await status(A, P2, "resubmit");
  record("15 rejected product: seller notified with the reason; seller resubmits -> pending + hidden, rejectionReason cleared, lastRejectionReason kept; again 409; other seller 403; a live product can't be 'resubmitted'",
    reject.status === 200 && !!rejectNote && /Blurry photos/.test(rejectNote.message) &&
    resubmitOther.status === 403 && resubmit.status === 200 && prs.approvalStatus === "pending" && prs.active === false &&
    prs.approved === false && prs.rejectionReason === null && prs.lastRejectionReason === "Blurry photos" &&
    prs.resubmissionCount === 1 && !isProductVisible(prs) && resubmitAgain.status === 409 && resubmitLive.status === 409,
    `reject=${reject.status} resubmit=${resubmit.status} again=${resubmitAgain.status} live=${resubmitLive.status}`);

  const approveResubmitted = await moderate(P3, { action: "approve" });
  record("16 admin moderation still works on a resubmitted product (approve -> live), with its own audit entry",
    approveResubmitted.status === 200 && isProductVisible(await getP(P3)) && (await auditCount("product_approve", P3)) === 1 &&
    (await auditCount("product_reject", P3)) === 1,
    `${approveResubmitted.status}`);

  // ============ 17. Admin decisions on an archived product ============
  await status(A, P3, "archive");
  const blockArchived = await moderate(P3, { action: "block" });
  const pb = await getP(P3);
  const restoreBlocked = await status(A, P3, "unarchive");
  const unblockArchived = await moderate(P2, { action: "unblock" });
  record("17 admin can BLOCK a seller-archived product (archived cleared -> 'blocked'); the seller then can't restore it; unblock of a live product still refused",
    blockArchived.status === 200 && pb.archived === false && productModerationStatus(pb) === "blocked" &&
    restoreBlocked.status === 409 && unblockArchived.status === 409 && (await auditCount("product_block", P3)) === 1,
    `block=${blockArchived.status} restore=${restoreBlocked.status}`);

  // ============ 18. Admin manage route ============
  const featureSeller = await manage(P2, "feature", A, `${A}@example.com`);
  const feature = await manage(P2, "feature");
  const featured = (await getP(P2)).featured;
  const unfeature = await manage(P2, "unfeature");
  const deleteSold = await manage(P2, "delete");
  const P4 = (await create(A, { ...VALID, title: "Unsold Duplicate", slug: "dup" })).body.productId as string;
  const deleteUnsold = await manage(P4, "delete");
  record("18 admin feature/unfeature/delete via server (seller 403): featured toggles; a product with sales history can't be deleted (409); an unsold one can; all audit-logged",
    featureSeller.status === 403 && feature.status === 200 && featured === true && unfeature.status === 200 &&
    (await getP(P2)).featured === false && deleteSold.status === 409 && !!(await getP(P2)) &&
    deleteUnsold.status === 200 && !(await getP(P4)) &&
    (await auditCount("product_feature", P2)) === 1 && (await auditCount("product_delete", P4)) === 1,
    `feature=${feature.status} deleteSold=${deleteSold.status} deleteUnsold=${deleteUnsold.status}`);

  // ============ 19. Reviews: server-computed rating ============
  const addReview = (email: string, rating: number, ms: number) =>
    db.collection("productReviews").add({ productId: P2, userEmail: email, rating, review: "ok", customerName: "C", createdAt: Timestamp.fromMillis(ms) });
  const stranger = await sync("stranger_1", P2);
  await addReview("r1@example.com", 5, 1000);
  await addReview("r2@example.com", 3, 2000);
  await addReview("r1@example.com", 1, 3000); // same reviewer again: the newest counts, once
  const own = await sync("reviewer_1", P2, "r1@example.com");
  const pr1 = await getP(P2);
  const missing = await sync("reviewer_1", "no_such_product", "r1@example.com");
  const r2doc = (await db.collection("productReviews").where("userEmail", "==", "r2@example.com").get()).docs[0];
  await r2doc.ref.delete();
  const adminSync = await sync(ADMIN_UID, P2, ADMIN_EMAIL);
  const pr2 = await getP(P2);
  record("19 rating is recomputed on the server from real reviews: a user with no review 403; one review per reviewer (newest wins) -> (1+3)/2 = 2, count 2; admin re-sync after a deletion -> 1, count 1; unknown product 404",
    stranger.status === 403 && own.status === 200 && pr1.rating === 2 && pr1.reviewCount === 2 &&
    missing.status === 404 && adminSync.status === 200 && pr2.rating === 1 && pr2.reviewCount === 1,
    `stranger=${stranger.status} own=${own.status} rating=${pr1?.rating}/${pr1?.reviewCount} admin=${pr2?.rating}/${pr2?.reviewCount}`);
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
