/*
 * LOCAL-ONLY emulator regression harness — F-10: product MRP / selling price /
 * discount integrity on the server write paths.
 * ---------------------------------------------------------------------------
 *   lib/products/sellerProductValidation.ts (validateSellerProductMoney,
 *   validateSellerProductPricing, deriveDiscountPercent, MIN_SELLING_PRICE),
 *   app/api/seller/create-product, app/api/seller/update-product
 *
 * Policy: MRP is mandatory, finite and > 0; sellingPrice, a seller-sent legacy
 * `price` and every PRICED variant (price 0 = "use the product price") are
 * within [MIN_SELLING_PRICE (₹499), MRP]; discount is derived by the server
 * from MRP and sellingPrice and any client figure is ignored; changing MRP on
 * an approved / legacy-live product sends it back to review. The pricing
 * policy runs on every create and on every update that changes sellingPrice,
 * price, mrp or variants, so a stock-only or content-only edit of a legacy
 * product is not forced to reprice first (nothing is migrated).
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production, never calls the real
 * Razorpay API (aliased to the fake via ../mobile-variant/tsconfig.harness.json),
 * never reads the real service account (a throwaway RSA key is generated).
 * Auth is faked by intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/product-mrp/run.mts"
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
const { POST: createProduct } = await import("../../../app/api/seller/create-product/route.ts");
const { POST: updateProduct } = await import("../../../app/api/seller/update-product/route.ts");
const validation: Record<string, any> = await import("../../../lib/products/sellerProductValidation.ts");
const { calculateDiscount } = await import("../../../lib/products/pricing.ts");
const { getDiscountPercentage } = await import("../../../lib/products/helpers.ts");
const { meetsMinimumDiscount } = await import("../../../lib/storefront/searchFilters.ts");
const { FREE_SHIPPING_THRESHOLD } = await import("../../../lib/shippingRules.ts");
const { isProductVisible } = await import("../../../lib/products/visibility.ts");
const { sellerEditPayload, editTouchesPricing, PRODUCT_FORM_MONEY_DEFAULTS } = await import("../../../lib/products/sellerProductEdit.ts");
const { pickSellerProductFields } = await import("../../../lib/products/sellerProductFields.ts");
const { validateProduct } = await import("../../../lib/products/validation.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["products", "vendors", "counters", "rateLimits", "notifications", "audit_logs"];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const SELLER = "seller_mrp_api";

function req(url: string, body: unknown, uid: string) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${uid}@example.com:true`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }
async function create(product: unknown) {
  const res = await createProduct(req("http://x/api/seller/create-product", { product }, SELLER));
  return { status: res.status, body: await json(res) };
}
async function update(productId: string, product: unknown) {
  const res = await updateProduct(req("http://x/api/seller/update-product", { productId, product }, SELLER));
  return { status: res.status, body: await json(res) };
}
async function getP(id: string) { return (await db.collection("products").doc(id).get()).data() as any; }
async function productCount() { return (await db.collection("products").get()).size; }

const VALID = {
  title: "MRP Lamp", description: "A lamp", brand: "Lumo", categoryId: "HOME", sellingPrice: 499, mrp: 799,
  stock: 20, gstRate: 12, thumbnail: "https://x/t.jpg", images: ["https://x/t.jpg"], slug: "mrp-lamp", variants: [],
};
const fn = (name: string) => (typeof validation[name] === "function" ? validation[name] : null);
// The complete server check for a NEW product (create-product runs both).
function serverAcceptsNew(p: Record<string, unknown>): boolean {
  const money = validation.validateSellerProductMoney(p);
  const pricing = fn("validateSellerProductPricing");
  return money.ok && (pricing ? pricing(p, { checkLegacyPrice: true }).ok : true);
}

async function main() {
  // ======================= V — validator =======================
  record("V0 policy constant MIN_SELLING_PRICE is 499 and is its own constant (not the free-delivery threshold import)",
    validation.MIN_SELLING_PRICE === 499 && typeof FREE_SHIPPING_THRESHOLD === "number",
    `MIN_SELLING_PRICE=${validation.MIN_SELLING_PRICE}`);

  const INVALID: [string, Record<string, unknown>][] = [
    ["mrp missing", { ...VALID, mrp: undefined }],
    ["mrp 0", { ...VALID, mrp: 0 }],
    ["mrp -1", { ...VALID, mrp: -1 }],
    ["mrp string", { ...VALID, mrp: "799" }],
    ["mrp null", { ...VALID, mrp: null }],
    ["mrp NaN", { ...VALID, mrp: NaN }],
    ["mrp Infinity", { ...VALID, mrp: Infinity }],
    ["sellingPrice above mrp (900 > 799)", { ...VALID, sellingPrice: 900 }],
    ["sellingPrice below the ₹499 floor (498)", { ...VALID, sellingPrice: 498 }],
    ["sellingPrice 100", { ...VALID, sellingPrice: 100 }],
    ["mrp below the floor (mrp 450, price 450)", { ...VALID, sellingPrice: 450, mrp: 450 }],
    ["legacy price above mrp", { ...VALID, price: 900 }],
    ["legacy price below the floor", { ...VALID, price: 300 }],
    ["priced variant above mrp", { ...VALID, variants: [{ id: "v", attributes: { Size: "L" }, stock: 1, price: 900 }] }],
    ["priced variant below the floor", { ...VALID, variants: [{ id: "v", attributes: { Size: "L" }, stock: 1, price: 100 }] }],
    ["variant price negative", { ...VALID, variants: [{ id: "v", attributes: {}, stock: 1, price: -1 }] }],
    ["variant price string", { ...VALID, variants: [{ id: "v", attributes: {}, stock: 1, price: "600" }] }],
    ["costPrice -1", { ...VALID, costPrice: -1 }],
    ["costPrice string", { ...VALID, costPrice: "300" }],
  ];
  const wrongly = INVALID.filter(([, p]) => serverAcceptsNew(p)).map(([n]) => n);
  record("V1 server validation REJECTS every malformed / inconsistent / out-of-policy money value",
    wrongly.length === 0, wrongly.length ? `ACCEPTED: ${wrongly.join(" | ")}` : `${INVALID.length} cases rejected`);

  const VALID_CASES: [string, Record<string, unknown>][] = [
    ["sellingPrice exactly the ₹499 floor", { ...VALID }],
    ["sellingPrice == mrp (no discount)", { ...VALID, sellingPrice: 799 }],
    ["variant price 0 (uses product price)", { ...VALID, variants: [{ id: "v", attributes: { Size: "L" }, stock: 1, price: 0 }] }],
    ["variant price == mrp", { ...VALID, variants: [{ id: "v", attributes: { Size: "L" }, stock: 1, price: 799 }] }],
    ["legacy price within [499, mrp]", { ...VALID, price: 599 }],
    ["costPrice 0 and costPrice 300", { ...VALID, costPrice: 300 }],
    ["client discount figure present (ignored, not validated)", { ...VALID, discount: 95 }],
  ];
  const wronglyRejected = VALID_CASES.filter(([, p]) => !serverAcceptsNew(p)).map(([n]) => n);
  record("V2 server validation ACCEPTS every in-policy product", wronglyRejected.length === 0,
    wronglyRejected.length ? `REJECTED: ${wronglyRejected.join(" | ")}` : `${VALID_CASES.length} cases accepted`);

  const derive = fn("deriveDiscountPercent");
  const D: [number, unknown, unknown][] = [
    [38, 799, 499], [0, 799, 799], [50, 1000, 499], [0, 799, 900], [0, undefined, 499], [0, "799", 499], [0, 0, 499],
  ];
  const badDerive = derive ? D.filter(([want, m, s]) => derive(m, s) !== want) : D;
  record("V3 deriveDiscountPercent: rounded (mrp - price) / mrp, 0 when there is no valid discount", badDerive.length === 0,
    derive ? (badDerive.length ? `WRONG: ${JSON.stringify(badDerive)}` : "7 cases") : "deriveDiscountPercent missing");

  // ======================= C — create-product =======================
  await clearAll();
  await db.collection("vendors").add({ uid: SELLER, status: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } });

  const createStatuses: string[] = [];
  for (const [label, p] of INVALID) {
    const r = await create(p);
    if (r.status !== 400) createStatuses.push(`${label}=${r.status}`);
  }
  record("C1 create-product refuses every invalid case with 400 and writes nothing",
    createStatuses.length === 0 && (await productCount()) === 0,
    createStatuses.length ? `NOT 400: ${createStatuses.join(" | ")}` : `${INVALID.length} refused, products=${await productCount()}`);

  const c2 = await create({ ...VALID, discount: 95 });
  const p2 = c2.body.productId ? await getP(c2.body.productId) : null;
  record("C2 create-product ignores the client discount (95) and stores the derived 38%",
    c2.status === 200 && p2?.discount === 38, `${c2.status} stored discount=${p2?.discount}`);

  const c3 = await create({ ...VALID, sellingPrice: 599, discount: "huge" });
  const p3 = c3.body.productId ? await getP(c3.body.productId) : null;
  record("C3 create-product with a malformed client discount still stores the derived 25%",
    c3.status === 200 && p3?.discount === 25, `${c3.status} stored discount=${p3?.discount}`);

  record("C4 stored discount matches every display derivation (product page helper, calculateDiscount, search min-discount filter)",
    !!p2 && getDiscountPercentage(p2.mrp, p2.sellingPrice) === p2.discount && calculateDiscount(p2.mrp, p2.sellingPrice) === p2.discount &&
    meetsMinimumDiscount({ mrp: p2.mrp, price: p2.sellingPrice }, p2.discount) &&
    !meetsMinimumDiscount({ mrp: p2.mrp, price: p2.sellingPrice }, p2.discount + 1),
    p2 ? `mrp=${p2.mrp} price=${p2.sellingPrice} discount=${p2.discount}` : "no product");

  // ======================= U — update-product =======================
  const LIVE = "p_mrp_live";
  const seedLive = () => db.collection("products").doc(LIVE).set({
    ...VALID, sellingPrice: 599, discount: 25, vendorId: SELLER, sales: 0,
    approvalStatus: "approved", approved: true, active: true, featured: false,
  });
  await seedLive();

  const bad: [string, Record<string, unknown>][] = [
    ["mrp below price (100)", { mrp: 100 }],
    ["mrp removed (null)", { mrp: null }],
    ["mrp string", { mrp: "999" }],
    ["sellingPrice 450 (below floor)", { sellingPrice: 450 }],
    ["sellingPrice 900 (> mrp 799)", { sellingPrice: 900 }],
    ["priced variant 900 (> mrp)", { variants: [{ id: "v", attributes: { Size: "L" }, stock: 1, price: 900 }] }],
    ["priced variant 200 (below floor)", { variants: [{ id: "v", attributes: { Size: "L" }, stock: 1, price: 200 }] }],
    ["legacy price 300 (below floor)", { price: 300 }],
    ["costPrice -1", { costPrice: -1 }],
  ];
  const updBad: string[] = [];
  for (const [label, change] of bad) {
    const r = await update(LIVE, change);
    if (r.status !== 400) updBad.push(`${label}=${r.status}`);
  }
  const afterBad = await getP(LIVE);
  record("U1 update-product refuses every invalid money edit (400) and the stored product is unchanged",
    updBad.length === 0 && afterBad.mrp === 799 && afterBad.sellingPrice === 599 && afterBad.discount === 25 &&
    Array.isArray(afterBad.variants) && afterBad.variants.length === 0 && isProductVisible(afterBad),
    updBad.length ? `NOT 400: ${updBad.join(" | ")}` : `mrp=${afterBad.mrp} price=${afterBad.sellingPrice} discount=${afterBad.discount}`);

  const u2 = await update(LIVE, { discount: 95 });
  record("U2 a client-only discount edit does not stick: the stored discount stays the derived 25%",
    u2.status === 200 && (await getP(LIVE)).discount === 25, `${u2.status} discount=${(await getP(LIVE)).discount}`);

  const u3 = await update(LIVE, { sellingPrice: 699, stock: 30 });
  const p3u = await getP(LIVE);
  record("U3 approved: an in-policy PRICE edit stays live (no re-review) and the discount is recalculated (699/799 -> 13%)",
    u3.status === 200 && u3.body.reReview === false && p3u.sellingPrice === 699 && p3u.discount === 13 && isProductVisible(p3u),
    `${u3.status} reReview=${u3.body.reReview} discount=${p3u.discount}`);

  const u4 = await update(LIVE, { mrp: 999 });
  const p4 = await getP(LIVE);
  record("U4 approved: an MRP change (799 -> 999) is applied but sends the product back to review (hidden), reReviewFields has 'mrp', discount 30%",
    u4.status === 200 && u4.body.reReview === true && (u4.body.reReviewFields || []).includes("mrp") &&
    p4.mrp === 999 && p4.discount === 30 && p4.approvalStatus === "pending" && !isProductVisible(p4),
    `${u4.status} ${JSON.stringify(u4.body)} discount=${p4.discount}`);

  const PENDING = "p_mrp_pending";
  await db.collection("products").doc(PENDING).set({
    ...VALID, vendorId: SELLER, sales: 0, discount: 38, approvalStatus: "pending", approved: false, active: false, featured: false,
  });
  const u5 = await update(PENDING, { mrp: 1000 });
  const p5 = await getP(PENDING);
  record("U5 pending product: an MRP change is validated and applied, discount recalculated (499/1000 -> 50%), stays pending",
    u5.status === 200 && p5.mrp === 1000 && p5.discount === 50 && p5.approvalStatus === "pending",
    `${u5.status} discount=${p5.discount}`);

  // ---- legacy product: no MRP, price below the floor, live (no approvalStatus) ----
  const LEGACY = "p_mrp_legacy";
  await db.collection("products").doc(LEGACY).set({
    title: "Legacy Mug", sellingPrice: 300, stock: 5, gstRate: 5, vendorId: SELLER, sales: 4, discount: 60,
    approved: true, active: true, featured: false,
  });
  const l1 = await update(LEGACY, { stock: 9 });
  const pl1 = await getP(LEGACY);
  record("U6 legacy (no MRP, ₹300): a STOCK-only edit is not forced to reprice (200); its stale discount 60 is reset to the derived 0",
    l1.status === 200 && pl1.stock === 9 && pl1.discount === 0 && isProductVisible(pl1),
    `${l1.status} stock=${pl1.stock} discount=${pl1.discount}`);
  const l2 = await update(LEGACY, { sellingPrice: 350 });
  record("U7 legacy: a PRICE edit runs the full policy -> refused (no MRP, below floor); stored unchanged",
    l2.status === 400 && (await getP(LEGACY)).sellingPrice === 300, `${l2.status} ${l2.body.error}`);
  const l3 = await update(LEGACY, { sellingPrice: 549, mrp: 799 });
  const pl3 = await getP(LEGACY);
  record("U8 legacy: repricing into policy (549 / MRP 799) is accepted; adding an MRP to a live product sends it to review; discount 31%",
    l3.status === 200 && pl3.sellingPrice === 549 && pl3.mrp === 799 && pl3.discount === 31 &&
    l3.body.reReview === true && (l3.body.reReviewFields || []).includes("mrp"),
    `${l3.status} ${JSON.stringify(l3.body)} discount=${pl3.discount}`);

  // ======================= L — the actual legacy UI payload =======================
  // ProductForm's edit state is `{ ...defaultProduct, ...existingProduct }`
  // and it sends lib/products/sellerProductEdit.ts sellerEditPayload(). The
  // form state is rebuilt here the same way: PRODUCT_FORM_MONEY_DEFAULTS is
  // the form's own money defaults, plus its other seller-field defaults.
  const FORM_DEFAULTS = {
    ...PRODUCT_FORM_MONEY_DEFAULTS, sku: "", slug: "", categoryId: "", subCategoryId: "", leafCategoryId: "",
    title: "", shortTitle: "", description: "", brand: "", model: "", currency: "INR", hsn: "",
    stock: 0, minStock: 5, maxStock: 1000, thumbnail: "", images: [], video: "", specifications: {},
    weight: 0, length: 0, width: 0, height: 0, warranty: "", returnDays: 7,
    metaTitle: "", metaDescription: "", keywords: [],
  };
  const formStateFor = (stored: Record<string, unknown>) => ({ ...FORM_DEFAULTS, ...stored });
  // A legacy, live product: complete listing content, but no MRP, no cost
  // price, no variants, and a price below today's floor.
  const LEGACY_UI = {
    title: "Legacy Cup", description: "A cup", brand: "Old", categoryId: "HOME", slug: "legacy-cup",
    thumbnail: "https://x/c.jpg", images: ["https://x/c.jpg"], sellingPrice: 300, stock: 5, gstRate: 5,
    returnDays: 7, vendorId: SELLER, sales: 0, discount: 0, approved: true, active: true, featured: false,
  };
  const seedLegacyUi = (id: string, extra: Record<string, unknown> = {}) =>
    db.collection("products").doc(id).set({ ...LEGACY_UI, ...extra });

  const LUI = "p_mrp_legacy_ui";
  await seedLegacyUi(LUI);
  {
    const stored = await getP(LUI);
    const form = { ...formStateFor(stored), stock: 12 }; // the seller changes only stock
    const payload = sellerEditPayload(stored, form);
    const client = validateProduct(form as never, { checkPricing: editTouchesPricing(stored, payload) });
    const clientStrict = validateProduct(form as never);
    const r = await update(LUI, payload);
    const after = await getP(LUI);
    record("L1 legacy (no MRP, ₹300) stock-only save from the UI: the untouched mrp / costPrice / variants defaults are NOT sent, the edit does not touch pricing, the form's own check passes",
      !("mrp" in payload) && !("costPrice" in payload) && !("variants" in payload) && payload.stock === 12 &&
      editTouchesPricing(stored, payload) === false && client.valid === true && clientStrict.valid === false,
      `payloadKeys=${Object.keys(payload).filter((k) => ["mrp", "costPrice", "variants", "sellingPrice", "stock"].includes(k)).join(",")} client=${client.valid} strict=${JSON.stringify(clientStrict.errors)}`);
    record("L2 ...and the API accepts it: 200, stock 12, no mrp / costPrice / variants written, discount derived 0, no re-review, still live",
      r.status === 200 && after.stock === 12 && !("mrp" in after) && !("costPrice" in after) && !("variants" in after) &&
      after.discount === 0 && r.body.reReview === false && isProductVisible(after),
      `${r.status} ${JSON.stringify(r.body)}`);

    // The server does NOT normalize: the raw form state (what the form sent
    // before sellerEditPayload) carries mrp 0 / variants [] and is refused.
    const raw = pickSellerProductFields({ ...formStateFor(await getP(LUI)), stock: 13 });
    const rr = await update(LUI, raw);
    const afterRaw = await getP(LUI);
    record("L3 server stays strict: the un-omitted payload (mrp 0, variants [], costPrice 0) is an MRP edit -> 400, nothing applied (stock still 12)",
      raw.mrp === 0 && Array.isArray(raw.variants) && rr.status === 400 && afterRaw.stock === 12 && !("mrp" in afterRaw),
      `${rr.status} ${rr.body.error}`);
  }

  // Intentional MRP edits on a legacy product are validated strictly, whether
  // they come from the UI payload or straight to the API.
  {
    const apiBad: [string, unknown][] = [["0", 0], ["-5", -5], ["'799' (string)", "799"], ["null", null], ["Infinity (JSON null)", Infinity]];
    const notRefused: string[] = [];
    for (const [label, mrp] of apiBad) {
      const r = await update(LUI, { mrp });
      if (r.status !== 400) notRefused.push(`${label}=${r.status}`);
    }
    const stored = await getP(LUI);
    const uiBad = sellerEditPayload(stored, { ...formStateFor(stored), mrp: -5 });
    const ui = await update(LUI, uiBad);
    const uiZeroOnHasMrp = sellerEditPayload({ ...stored, mrp: 799 }, { ...formStateFor({ ...stored, mrp: 799 }), mrp: 0 });
    record("L4 intentional MRP edits are strict: API mrp 0 / -5 / '799' / null / Infinity -> 400; a UI-entered MRP -5 is SENT (not omitted) -> 400; clearing an EXISTING MRP to 0 is sent",
      notRefused.length === 0 && uiBad.mrp === -5 && ui.status === 400 && uiZeroOnHasMrp.mrp === 0 && !("mrp" in (await getP(LUI))),
      notRefused.length ? `NOT 400: ${notRefused.join(" | ")}` : `ui=${ui.status} clearExisting.mrp=${uiZeroOnHasMrp.mrp}`);

    const good = sellerEditPayload(stored, { ...formStateFor(stored), mrp: 799, sellingPrice: 549 });
    const g = await update(LUI, good);
    const pg = await getP(LUI);
    record("L5 UI: the seller enters MRP 799 and price 549 on the legacy live product -> 200, discount derived 31%, re-review with 'mrp'",
      g.status === 200 && pg.mrp === 799 && pg.sellingPrice === 549 && pg.discount === 31 &&
      g.body.reReview === true && (g.body.reReviewFields || []).includes("mrp") && pg.approvalStatus === "pending",
      `${g.status} ${JSON.stringify(g.body)} discount=${pg.discount}`);
  }

  // ======================= VR — intentional variant edits / removal =======================
  {
    const VAR = "p_mrp_variants";
    const variants = [{ id: "v1", attributes: { Size: "L" }, stock: 2, price: 599 }];
    await db.collection("products").doc(VAR).set({
      ...VALID, sellingPrice: 549, discount: 31, variants, vendorId: SELLER, sales: 0,
      approvalStatus: "approved", approved: true, active: true, featured: false,
    });
    const s0 = await getP(VAR);
    const priceEdit = sellerEditPayload(s0, { ...formStateFor(s0), variants: [{ ...variants[0], price: 699 }] });
    const pe = await update(VAR, priceEdit);
    const p1 = await getP(VAR);
    record("VR1 approved: editing a variant's price within policy (599 -> 699) is sent, accepted, stays live (no re-review), discount unchanged 31%",
      editTouchesPricing(s0, priceEdit) && pe.status === 200 && p1.variants?.[0]?.price === 699 && pe.body.reReview === false &&
      isProductVisible(p1) && p1.discount === 31, `${pe.status} ${JSON.stringify(pe.body)}`);

    const over = sellerEditPayload(p1, { ...formStateFor(p1), variants: [{ ...variants[0], price: 900 }] });
    const ov = await update(VAR, over);
    record("VR2 approved: editing a variant's price above MRP (900 > 799) -> 400, stored variant unchanged",
      ov.status === 400 && (await getP(VAR)).variants?.[0]?.price === 699, `${ov.status} ${ov.body.error}`);

    const s1 = await getP(VAR);
    const removal = sellerEditPayload(s1, { ...formStateFor(s1), variants: [] });
    const rm = await update(VAR, removal);
    const p2 = await getP(VAR);
    record("VR3 approved: REMOVING all variants is an intentional edit — variants [] is SENT (the product had variants), accepted, variants [] stored, re-review 'variants', discount still derived 31%",
      Array.isArray(removal.variants) && (removal.variants as unknown[]).length === 0 && rm.status === 200 &&
      Array.isArray(p2.variants) && p2.variants.length === 0 && (rm.body.reReviewFields || []).includes("variants") && p2.discount === 31,
      `${rm.status} ${JSON.stringify(rm.body)}`);

    const LV = "p_mrp_legacy_variants";
    await seedLegacyUi(LV, { variants });
    const s2 = await getP(LV);
    const legacyRemoval = sellerEditPayload(s2, { ...formStateFor(s2), variants: [] });
    const lr = await update(LV, legacyRemoval);
    const p3 = await getP(LV);
    record("VR4 legacy (no MRP, ₹300) with variants: removing them is a price-field edit -> the MRP policy runs -> 400 (MRP required, ₹499 floor); stored variants unchanged",
      Array.isArray(legacyRemoval.variants) && lr.status === 400 && p3.variants?.length === 1 && p3.variants[0].price === 599,
      `${lr.status} ${lr.body.error}`);
    const legacyStock = sellerEditPayload(s2, { ...formStateFor(s2), stock: 8 });
    const ls = await update(LV, legacyStock);
    record("VR5 ...while a stock-only UI save of that same legacy product (variants untouched, so unchanged) is accepted",
      ls.status === 200 && (await getP(LV)).stock === 8 && (await getP(LV)).variants?.length === 1, `${ls.status} ${ls.body.error || ""}`);
  }

  const LEGACY_PRICE = "p_mrp_legacy_price";
  await db.collection("products").doc(LEGACY_PRICE).set({
    ...VALID, price: 350, sellingPrice: 549, discount: 31, vendorId: SELLER, sales: 0,
    approvalStatus: "approved", approved: true, active: true, featured: false,
  });
  const lp1 = await update(LEGACY_PRICE, { sellingPrice: 599 });
  const lp2 = await update(LEGACY_PRICE, { price: 350.5 });
  record("U9 a stored legacy `price` below the floor does not block a sellingPrice edit (200); editing `price` itself is policy-checked (400)",
    lp1.status === 200 && (await getP(LEGACY_PRICE)).sellingPrice === 599 && lp2.status === 400,
    `sellingPrice edit=${lp1.status} price edit=${lp2.status}`);

  const failed = results.filter((r) => !r.pass);
  console.log("\n=================== SUMMARY ===================");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name}`);
    process.exit(1);
  }
  console.log("ALL PRODUCT MRP SCENARIOS PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(3);
});
