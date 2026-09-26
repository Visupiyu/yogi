/*
 * LOCAL-ONLY emulator regression harness — product approval gate.
 * ---------------------------------------------------------------------------
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST injected by
 * `firebase emulators:exec`). Never touches production Firestore, never calls
 * the real Razorpay API (`razorpay` is aliased to the fake via
 * ../mobile-variant/tsconfig.harness.json), never reads the real service
 * account (a throwaway RSA key is generated). Auth is faked by intercepting
 * the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/product-approval/run.mts"
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
const { isProductVisible, productModerationStatus } = await import("../../../lib/products/visibility.ts");
const { isStorefrontVisible } = await import("../../../lib/products/legacyDisplay.ts");
const { planModeration } = await import("../../../lib/products/moderation.ts");
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { computeOrderPricing } = await import("../../../lib/orderPricing.ts");
const { POST: createProduct } = await import("../../../app/api/seller/create-product/route.ts");
const { POST: updateProduct } = await import("../../../app/api/seller/update-product/route.ts");
const { POST: moderate } = await import("../../../app/api/admin/products/[id]/moderation/route.ts");
const { POST: mobilePlaceOrder } = await import("../../../app/api/mobile/place-order/route.ts");
const { POST: mobileCreatePaymentOrder } = await import("../../../app/api/mobile/create-payment-order/route.ts");
const { control } = await import("../mobile-variant/control.mjs");

const db = getAdminDb();

const SELLER = "seller_appr_1";
const OTHER_SELLER = "seller_appr_2";
const BUYER = "buyer_appr_1";
const ADMIN_UID = "admin_appr_1";

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["products", "vendors", "orders", "cart", "paymentIntents", "counters", "rateLimits", "settings", "notifications", "users"];
async function clearAll() {
  for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name));
}
function req(url: string, body: unknown, uid: string, email = `${uid}@example.com`) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${email}:true`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }
async function getP(id: string) { return (await db.collection("products").doc(id).get()).data() as any; }
async function moderateAs(uid: string, email: string, id: string, body: unknown) {
  const res = await moderate(req(`http://x/api/admin/products/${id}/moderation`, body, uid, email), { params: Promise.resolve({ id }) });
  return { status: res.status, json: await json(res) };
}
const asAdmin = (id: string, body: unknown) => moderateAs(ADMIN_UID, ADMIN_EMAIL, id, body);

const VALID_PRODUCT = {
  title: "Approval Lamp", description: "d", brand: "b", categoryId: "HOME", sellingPrice: 499, mrp: 799,
  stock: 7, gstRate: 12, thumbnail: "t", images: ["t"], slug: "approval-lamp", variants: [],
};
const MOB_BODY = { customerName: "Test Buyer", phone: "9898989898", address: "1 Test Road", deliverySlot: "" };

async function main() {
  await clearAll();
  await db.collection("vendors").add({ uid: SELLER, status: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } });
  await db.collection("vendors").add({ uid: OTHER_SELLER, status: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } });

  // ================= A–E: the canonical visibility rule =================
  const cases: [string, any, boolean][] = [
    ["A  legacy: approved missing, active true -> visible", { active: true }, true],
    ["A2 legacy: approved false (41 live products), active true, no approvalStatus -> visible", { approved: false, active: true }, true],
    ["A3 legacy: no approved, no active -> visible", {}, true],
    ["B  legacy blocked: approved missing, active false -> hidden", { active: false }, false],
    ["C  new: approvalStatus pending, approved false, active false -> hidden", { approvalStatus: "pending", approved: false, active: false }, false],
    ["C2 pending even if active true -> hidden (defense)", { approvalStatus: "pending", active: true }, false],
    ["D  approved + active -> visible", { approvalStatus: "approved", approved: true, active: true }, true],
    ["E  approved + blocked -> hidden", { approvalStatus: "approved", approved: true, active: false }, false],
    ["E2 rejected -> hidden", { approvalStatus: "rejected", approved: false, active: false, rejectionReason: "x" }, false],
    ["E3 unknown approvalStatus -> hidden (fail closed)", { approvalStatus: "weird", active: true }, false],
  ];
  for (const [name, p, want] of cases) {
    const got = isProductVisible(p);
    record(name, got === want && isStorefrontVisible(p) === want, `isProductVisible=${got} isStorefrontVisible=${isStorefrontVisible(p)}`);
  }

  // ================= F, G: seller create cannot go live =================
  let createdId = "";
  {
    const res = await createProduct(req("http://x/api/seller/create-product", {
      product: { ...VALID_PRODUCT, approved: true, active: true, featured: true, approvalStatus: "approved", rejectionReason: "x", moderatedBy: SELLER },
    }, SELLER));
    const j = await json(res);
    createdId = j.productId;
    const p = await getP(createdId);
    record("F  seller cannot set approved/approvalStatus on create (stored approved:false, approvalStatus:pending)",
      res.status === 200 && p.approved === false && p.approvalStatus === "pending" && !("rejectionReason" in p) && !("moderatedBy" in p),
      `status=${res.status} approved=${p?.approved} approvalStatus=${p?.approvalStatus}`);
    record("G  seller cannot set active/featured on create (stored active:false, featured:false) and product is hidden",
      p.active === false && p.featured === false && !isProductVisible(p) && productModerationStatus(p) === "pending",
      `active=${p?.active} featured=${p?.featured} visible=${isProductVisible(p)}`);
  }

  // ================= H: seller update cannot change moderation fields =================
  {
    const res = await updateProduct(req("http://x/api/seller/update-product", {
      productId: createdId,
      product: { ...VALID_PRODUCT, title: "Approval Lamp v2", approved: true, active: true, featured: true, approvalStatus: "approved", rejectionReason: "hack", moderatedBy: SELLER },
    }, SELLER));
    const p = await getP(createdId);
    record("H  seller update cannot change approved/active/featured/approvalStatus (other edits still apply)",
      res.status === 200 && p.title === "Approval Lamp v2" && p.approved === false && p.active === false && p.featured === false &&
      p.approvalStatus === "pending" && !("rejectionReason" in p) && !("moderatedBy" in p),
      `status=${res.status} title=${p?.title} approved=${p?.approved} active=${p?.active} approvalStatus=${p?.approvalStatus}`);
  }

  // ================= I–L: admin moderation =================
  {
    const denied = await moderateAs(SELLER, `${SELLER}@example.com`, createdId, { action: "approve" });
    const bad = await asAdmin(createdId, { action: "publish" });
    const blockPending = await asAdmin(createdId, { action: "block" });
    const unblockPending = await asAdmin(createdId, { action: "unblock" });
    const p = await getP(createdId);
    record("I0 non-admin 403; invalid action 400; block/unblock of a PENDING product refused (409), nothing changed",
      denied.status === 403 && bad.status === 400 && blockPending.status === 409 && unblockPending.status === 409 && p.approvalStatus === "pending" && p.active === false,
      `nonAdmin=${denied.status} invalid=${bad.status} block=${blockPending.status} unblock=${unblockPending.status}`);
  }
  {
    const r = await asAdmin(createdId, { action: "approve" });
    const p = await getP(createdId);
    record("I  admin approve -> approved:true, active:true, approvalStatus:approved, rejectionReason null, moderatedBy/At set, visible",
      r.status === 200 && p.approved === true && p.active === true && p.approvalStatus === "approved" && p.rejectionReason === null &&
      p.moderatedBy === ADMIN_UID && !!p.moderatedAt && isProductVisible(p),
      `status=${r.status} ${JSON.stringify({ approved: p.approved, active: p.active, approvalStatus: p.approvalStatus })}`);
  }
  {
    const r = await asAdmin(createdId, { action: "block" });
    const p = await getP(createdId);
    record("K  admin block -> approved:true, active:false, hidden",
      r.status === 200 && p.approved === true && p.active === false && p.approvalStatus === "approved" && !isProductVisible(p) && productModerationStatus(p) === "blocked",
      `status=${r.status} active=${p.active}`);
  }
  {
    const r = await asAdmin(createdId, { action: "unblock" });
    const p = await getP(createdId);
    record("L  admin unblock -> approved:true, active:true, visible",
      r.status === 200 && p.approved === true && p.active === true && p.approvalStatus === "approved" && isProductVisible(p),
      `status=${r.status} active=${p.active}`);
  }
  {
    const noReason = await asAdmin(createdId, { action: "reject", reason: "   " });
    const r = await asAdmin(createdId, { action: "reject", reason: "Images do not match the product" });
    const p = await getP(createdId);
    record("J  admin reject -> approved:false, active:false, approvalStatus:rejected, rejectionReason stored, hidden (blank reason refused 400)",
      noReason.status === 400 && r.status === 200 && p.approved === false && p.active === false && p.approvalStatus === "rejected" &&
      p.rejectionReason === "Images do not match the product" && !isProductVisible(p) && productModerationStatus(p) === "rejected",
      `blank=${noReason.status} status=${r.status} reason=${p.rejectionReason}`);
    const again = await asAdmin(createdId, { action: "approve" });
    const p2 = await getP(createdId);
    record("J2 rejected product can be approved later; rejectionReason cleared",
      again.status === 200 && p2.approvalStatus === "approved" && p2.active === true && p2.rejectionReason === null, `status=${again.status}`);
  }
  {
    // Legacy product (approved:false stored, no approvalStatus) keeps working under block/unblock.
    await db.collection("products").doc("legacy_prod").set({ ...VALID_PRODUCT, vendorId: SELLER, approved: false, active: true, sales: 0 });
    const before = isProductVisible(await getP("legacy_prod"));
    const b = await asAdmin("legacy_prod", { action: "block" });
    const pb = await getP("legacy_prod");
    const u = await asAdmin("legacy_prod", { action: "unblock" });
    const pu = await getP("legacy_prod");
    record("L2 legacy product (approved:false, no approvalStatus) is visible, blockable and unblockable",
      before && b.status === 200 && !isProductVisible(pb) && u.status === 200 && isProductVisible(pu), `before=${before} block=${b.status} unblock=${u.status}`);
  }
  {
    const plan = planModeration({ approvalStatus: "pending", active: false }, "reject", "x".repeat(501));
    record("J3 rejection reason over 500 chars refused", plan.ok === false && (plan as any).status === 400);
  }

  // ================= M, N: server order paths =================
  await db.collection("settings").doc("global").set({ commissionEnabled: false, commissionRate: 0, freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  const P_PENDING = "prod_pending_active"; // approval missing but active forced true — isolates the approval check
  const P_INACTIVE = "prod_approved_inactive";
  const P_LEGACY = "prod_legacy_ok";
  await db.collection("products").doc(P_PENDING).set({ ...VALID_PRODUCT, vendorId: SELLER, approvalStatus: "pending", approved: false, active: true, sales: 0 });
  await db.collection("products").doc(P_INACTIVE).set({ ...VALID_PRODUCT, vendorId: SELLER, approvalStatus: "approved", approved: true, active: false, sales: 0 });
  await db.collection("products").doc(P_LEGACY).set({ ...VALID_PRODUCT, vendorId: SELLER, approved: false, active: true, sales: 0 });

  async function mobileAttempts(productId: string) {
    await db.recursiveDelete(db.collection("cart"));
    await db.collection("cart").add({ userId: BUYER, savedForLater: false, productId, quantity: 1, name: "x", price: 1 });
    const cod = await mobilePlaceOrder(req("http://x/api/mobile/place-order", { ...MOB_BODY, idempotencyKey: `appr${productId}${Date.now()}` }, BUYER));
    control.reset();
    const online = await mobileCreatePaymentOrder(req("http://x/api/mobile/create-payment-order", MOB_BODY, BUYER));
    return { cod: cod.status, online: online.status, rzp: control.calls.ordersCreate };
  }
  const orders0 = (await db.collection("orders").get()).size;
  {
    const web = await computeOrderPricing([{ id: P_PENDING, qty: 1 }], BUYER, null, false);
    const m = await mobileAttempts(P_PENDING);
    record("M  unapproved product rejected by web pricing (COD+ONLINE), mobile COD and mobile ONLINE (no Razorpay order)",
      web.ok === false && m.cod === 409 && m.online === 409 && m.rzp === 0,
      `web=${web.ok ? "OK" : (web as any).status} mobileCOD=${m.cod} mobileONLINE=${m.online} rzp=${m.rzp}`);
  }
  {
    const web = await computeOrderPricing([{ id: P_INACTIVE, qty: 1 }], BUYER, null, false);
    const m = await mobileAttempts(P_INACTIVE);
    record("N  inactive product rejected by web pricing, mobile COD and mobile ONLINE",
      web.ok === false && m.cod === 409 && m.online === 409 && m.rzp === 0,
      `web=${web.ok ? "OK" : (web as any).status} mobileCOD=${m.cod} mobileONLINE=${m.online}`);
  }
  {
    const web = await computeOrderPricing([{ id: P_LEGACY, qty: 1 }], BUYER, null, false);
    const m = await mobileAttempts(P_LEGACY);
    const ordersNow = (await db.collection("orders").get()).size;
    record("N2 legacy product (approved:false, no approvalStatus) still orderable — existing catalog unaffected",
      web.ok === true && m.cod === 200 && ordersNow === orders0 + 1, `web=${web.ok} mobileCOD=${m.cod}`);
  }

  // ================= O: delete + recreate is not immediately live =================
  {
    const first = await json(await createProduct(req("http://x/api/seller/create-product", { product: VALID_PRODUCT }, SELLER)));
    await asAdmin(first.productId, { action: "approve" });
    await asAdmin(first.productId, { action: "block" });
    await db.collection("products").doc(first.productId).delete(); // owner delete (allowed by rules)
    const again = await json(await createProduct(req("http://x/api/seller/create-product", { product: { ...VALID_PRODUCT, active: true, approved: true } }, SELLER)));
    const p = await getP(again.productId);
    record("O  re-created product starts pending + inactive, not visible",
      !!again.productId && again.productId !== first.productId && p.approvalStatus === "pending" && p.active === false && p.approved === false && !isProductVisible(p),
      `approvalStatus=${p?.approvalStatus} active=${p?.active}`);
  }

  await clearAll();
  const failed = results.filter((r) => !r.pass);
  console.log("\n=================== SUMMARY ===================");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("ALL PRODUCT-APPROVAL SCENARIOS PASSED");
  }
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exitCode = 3; });
