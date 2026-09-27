/*
 * LOCAL-ONLY emulator regression harness — Seller Business
 * (app/api/seller/business, app/api/seller/business/change-request,
 *  app/api/admin/business-change-requests[/document]).
 * ---------------------------------------------------------------------------
 * Proves the seller sees only their OWN business details, with bank account,
 * PAN and Aadhaar masked and no KYC document URL; that a change to business
 * identity, contact, address or bank details is only ever a validated REQUEST
 * (never applied by the seller); that only the verified admin can approve or
 * reject one, that approval applies exactly the recorded change (and refuses a
 * stale one) together with its audit entry; and that none of it moves a rupee
 * of the seller's payable or commission.
 *
 * Firestore + Storage EMULATORS only (injected by `firebase emulators:exec`).
 * Never touches production, never calls the real Razorpay API (aliased to the
 * fake via ../mobile-variant/tsconfig.harness.json), never reads the real
 * service account (a throwaway RSA key is generated). Auth is faked by
 * intercepting the Identity Toolkit fetch.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore,storage --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/seller-business/run.mts"
 */
import crypto from "node:crypto";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: the Firestore and Storage emulators must be running (firebase emulators:exec --only firestore,storage).");
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

const { getAdminDb, getAdminBucket } = await import("../../../lib/firebaseAdmin.ts");
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { GET: businessGet } = await import("../../../app/api/seller/business/route.ts");
const { POST: changeRequest } = await import("../../../app/api/seller/business/change-request/route.ts");
const { GET: adminList, POST: adminDecide } = await import("../../../app/api/admin/business-change-requests/route.ts");
const { GET: adminDocument } = await import("../../../app/api/admin/business-change-requests/document/route.ts");
const { GET: sellerPayable } = await import("../../../app/api/seller/payable/route.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = [
  "vendors", "vendors_public", "vendorChangeRequests", "audit_logs", "notifications", "rateLimits",
  "orders", "sellerOrders", "withdrawals", "vendor_payouts", "itemRequests", "returns", "settings", "counters",
];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const ADMIN_UID = "admin_business_1";
const A = "seller_biz_a";
const B = "seller_biz_b";
const P = "seller_biz_pending";
const X = "seller_biz_blocked";
const DUP = "seller_biz_dup";
const CUSTOMER = "customer_biz_1";

const tokenFor = (uid: string, email = `${uid}@example.com`, verified = true) => `test:${uid}:${email}:${verified}`;
const ADMIN = tokenFor(ADMIN_UID, ADMIN_EMAIL);
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

async function getBusiness(token: string | null) {
  const res = await businessGet(new Request("http://localhost/api/seller/business", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }));
  const text = await res.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text };
}
async function submit(token: string | null, body: unknown) {
  const res = await changeRequest(new Request("http://localhost/api/seller/business/change-request", {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await json(res) };
}
async function list(token: string, status = "PENDING") {
  const res = await adminList(new Request(`http://localhost/api/admin/business-change-requests?status=${status}`, {
    headers: { authorization: `Bearer ${token}` },
  }));
  return { status: res.status, body: await json(res) };
}
async function decide(token: string, body: unknown) {
  const res = await adminDecide(new Request("http://localhost/api/admin/business-change-requests", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await json(res) };
}
async function payable(uid: string) {
  const res = await sellerPayable(new Request("http://localhost/api/seller/payable", {
    headers: { authorization: `Bearer ${tokenFor(uid)}` },
  }));
  return json(res);
}
// The change-request route allows 20 requests per seller per 10 minutes; the
// validation matrix below alone sends more than that, so the window is reset
// between sections (the limiter itself is lib/rateLimit, tested elsewhere).
async function resetRateLimit(uid: string) {
  await db.collection("rateLimits").doc(`seller-business-change_${uid}`).delete();
}
let k = 0;
const key = () => `bizkey_${++k}_${Date.now()}`;

const A_VENDOR = {
  uid: A, fullName: "Asha Patel", email: "asha@shop-a.example", businessPhone: "9876543210",
  businessName: "Asha Traders", businessType: "Sole Proprietorship", gstNumber: "24ABCDE1234F1Z5",
  street: "12 Market Road", unit: "Shop 4", zipCode: "380001", city: "Ahmedabad", state: "Gujarat",
  accountHolder: "Asha Patel", bankName: "Test Bank", accountNumber: "123456789012", ifsc: "TEST0001234",
  panNumber: "ABCDE1234F", aadhaarNumber: "123412341234",
  gstDocUrl: "https://example.invalid/o/vendor-kyc%2Fseller_biz_a%2Fgst.pdf?alt=media&token=secret-token-a",
  aadhaarDocUrl: "https://example.invalid/o/vendor-kyc%2Fseller_biz_a%2Faadhaar.pdf?alt=media&token=secret-token-a2",
  chequeDocUrl: "https://example.invalid/o/vendor-kyc%2Fseller_biz_a%2Fcheque.pdf?alt=media&token=secret-token-a3",
  status: "Approved", kycStatus: "Approved", agreed: true, sellerNumber: "SELLER00001",
  commissionRate: 0, taxProfile: { gstStatus: "REGISTERED", gstin: "24ABCDE1234F1Z5", legalName: "Asha Patel", tradeName: "Asha Traders", pan: "ABCDE1234F", businessState: "Gujarat", gstRegistrationState: "Gujarat" },
  taxVerificationStatus: "VERIFIED",
};
const B_VENDOR = {
  ...A_VENDOR, uid: B, fullName: "Bharat Shah", email: "bharat@shop-b.example", businessName: "Bharat Stores",
  businessPhone: "9123456780", accountHolder: "Bharat Shah", accountNumber: "999988887777", panNumber: "PQRSX9876Z", aadhaarNumber: "987698769876",
  gstDocUrl: "", aadhaarDocUrl: "", chequeDocUrl: "", sellerNumber: "SELLER00002",
  taxProfile: { gstStatus: "UNREGISTERED" }, taxVerificationStatus: "PENDING",
};

async function seed() {
  await db.collection("vendors").doc("vdoc_a").set(A_VENDOR);
  await db.collection("vendors").doc("vdoc_b").set(B_VENDOR);
  await db.collection("vendors").doc("vdoc_p").set({ ...B_VENDOR, uid: P, status: "Pending", kycStatus: "Pending", businessName: "Pending Co" });
  await db.collection("vendors").doc("vdoc_x").set({ ...B_VENDOR, uid: X, status: "Blocked", businessName: "Blocked Co" });
  await db.collection("vendors").doc("vdoc_d1").set({ ...B_VENDOR, uid: DUP, businessName: "Dup One" });
  await db.collection("vendors").doc("vdoc_d2").set({ ...B_VENDOR, uid: DUP, businessName: "Dup Two" });
  for (const v of [A_VENDOR, B_VENDOR]) {
    await db.collection("vendors_public").doc(v.uid).set({
      uid: v.uid, businessName: v.businessName, fullName: v.fullName, email: v.email, businessPhone: v.businessPhone,
      businessType: v.businessType, city: v.city, state: v.state, status: "Approved", rating: 0,
    });
  }
  // One eligible order for A, so the money check below has a real balance.
  await db.collection("settings").doc("global").set({ commissionEnabled: true, commissionRate: 0.1, deliveryCost: 49 });
  await db.collection("orders").doc("biz_o1").set({
    userId: CUSTOMER, vendorIds: [A], items: [{ id: "p1", vendorId: A, price: 700, qty: 1 }],
    total: 700, finalTotal: 700, deliveryCost: 49, freeDeliveryApplied: true,
    status: "Delivered", paymentStatus: "Paid", paymentMethod: "ONLINE",
  });
  await db.collection("sellerOrders").doc(`biz_o1_${A}`).set({
    orderId: "biz_o1", vendorId: A, vendorSubtotal: 700, vendorCommission: 0, vendorEarning: 700, sellerDeliveryCharge: 49,
  });
}

const vendorA = async () => (await db.collection("vendors").doc("vdoc_a").get()).data() || {};
const requestsOf = async (uid: string) =>
  (await db.collection("vendorChangeRequests").where("vendorUid", "==", uid).get()).docs;

try {
  await clearAll();
  await seed();
  const payableBefore = await payable(A);

  // ============ 1. GET authorization ============
  const g401 = await getBusiness(null);
  const gCustomer = await getBusiness(tokenFor(CUSTOMER));
  const gDup = await getBusiness(tokenFor(DUP));
  record("1  GET: signed out 401; a customer with no seller record 403; two seller records for one login 409",
    g401.status === 401 && gCustomer.status === 403 && gDup.status === 409,
    `${g401.status}/${gCustomer.status}/${gDup.status}`);

  // ============ 2. GET masks sensitive data, no document URLs ============
  const gA = await getBusiness(tokenFor(A));
  const p = gA.body.profile || {};
  record("2  GET own profile: bank account / PAN / Aadhaar masked, KYC docs as present-only (no URL or token), tax + statuses shown",
    gA.status === 200 &&
    p.bank?.accountNumberMasked === "••••••••9012" && p.identity?.panMasked === "••••••234F" &&
    p.identity?.aadhaarMasked === "•••• •••• 1234" &&
    !gA.text.includes("123456789012") && !gA.text.includes("ABCDE1234F\"") && !gA.text.includes("123412341234") &&
    !gA.text.includes("secret-token") && !gA.text.includes("example.invalid") &&
    p.documents?.gst === true && p.documents?.cheque === true &&
    p.business?.businessName === "Asha Traders" && p.tax?.gstin === "24ABCDE1234F1Z5" &&
    p.tax?.verificationStatus === "VERIFIED" && p.sellerNumber === "SELLER00001" && p.kycStatus === "Approved" &&
    p.emailVerified === true && p.agreementAccepted === true,
    JSON.stringify({ bank: p.bank, identity: p.identity, documents: p.documents }));

  // ============ 3. Isolation ============
  const gB = await getBusiness(tokenFor(B));
  record("3  each seller gets only their OWN record — A's response carries none of B's details and vice versa",
    gB.status === 200 && gB.body.profile?.business?.businessName === "Bharat Stores" &&
    !gA.text.includes("Bharat") && !gB.text.includes("Asha") && !gB.text.includes("999988887777") && !gA.text.includes("9123456780"),
    `B=${gB.body.profile?.business?.businessName}`);

  // ============ 4. Submit validation ============
  const good = { businessName: "Asha Traders LLP", fullName: "Asha Patel", businessType: "LLP" };
  const v: Record<string, number> = {
    signedOut: (await submit(null, { action: "submit", section: "business", values: good, idempotencyKey: key() })).status,
    badAction: (await submit(tokenFor(A), { action: "apply", section: "business", values: good, idempotencyKey: key() })).status,
    badSection: (await submit(tokenFor(A), { action: "submit", section: "status", values: good, idempotencyKey: key() })).status,
    badKey: (await submit(tokenFor(A), { action: "submit", section: "business", values: good, idempotencyKey: "short" })).status,
    extraField: (await submit(tokenFor(A), { action: "submit", section: "business", values: { ...good, kycStatus: "Approved" }, idempotencyKey: key() })).status,
    crossSection: (await submit(tokenFor(A), { action: "submit", section: "business", values: { ...good, accountNumber: "111122223333" }, idempotencyKey: key() })).status,
    badType: (await submit(tokenFor(A), { action: "submit", section: "business", values: { ...good, businessType: "Trust" }, idempotencyKey: key() })).status,
    badPhone: (await submit(tokenFor(A), { action: "submit", section: "contact", values: { businessPhone: "12345", email: "a@b.co" }, idempotencyKey: key() })).status,
    badEmail: (await submit(tokenFor(A), { action: "submit", section: "contact", values: { businessPhone: "9876543210", email: "nope" }, idempotencyKey: key() })).status,
    badPin: (await submit(tokenFor(A), { action: "submit", section: "address", values: { street: "1 Road", unit: "", zipCode: "12", city: "Surat", state: "Gujarat" }, idempotencyKey: key() })).status,
    badIfsc: (await submit(tokenFor(A), { action: "submit", section: "bank", values: { accountHolder: "Asha", bankName: "Bank", accountNumber: "111122223333", ifsc: "BAD" }, documentPath: `vendor-kyc/${A}/p.pdf`, idempotencyKey: key() })).status,
    bankNoProof: (await submit(tokenFor(A), { action: "submit", section: "bank", values: { accountHolder: "Asha", bankName: "Bank", accountNumber: "111122223333", ifsc: "NEWB0001234" }, idempotencyKey: key() })).status,
    bankOtherFolder: (await submit(tokenFor(A), { action: "submit", section: "bank", values: { accountHolder: "Asha", bankName: "Bank", accountNumber: "111122223333", ifsc: "NEWB0001234" }, documentPath: `vendor-kyc/${B}/p.pdf`, idempotencyKey: key() })).status,
    bankTraversal: (await submit(tokenFor(A), { action: "submit", section: "bank", values: { accountHolder: "Asha", bankName: "Bank", accountNumber: "111122223333", ifsc: "NEWB0001234" }, documentPath: `vendor-kyc/${A}/../${B}/p.pdf`, idempotencyKey: key() })).status,
    docOnNonBank: (await submit(tokenFor(A), { action: "submit", section: "business", values: good, documentPath: `vendor-kyc/${A}/p.pdf`, idempotencyKey: key() })).status,
    noChange: (await submit(tokenFor(A), { action: "submit", section: "business", values: { businessName: "Asha Traders", fullName: "Asha Patel", businessType: "Sole Proprietorship" }, idempotencyKey: key() })).status,
    noVendor: (await submit(tokenFor(CUSTOMER), { action: "submit", section: "business", values: good, idempotencyKey: key() })).status,
    duplicate: (await submit(tokenFor(DUP), { action: "submit", section: "business", values: good, idempotencyKey: key() })).status,
    blocked: (await submit(tokenFor(X), { action: "submit", section: "business", values: good, idempotencyKey: key() })).status,
  };
  const expected: Record<string, number> = {
    signedOut: 401, badAction: 400, badSection: 400, badKey: 400, extraField: 400, crossSection: 400, badType: 400,
    badPhone: 400, badEmail: 400, badPin: 400, badIfsc: 400, bankNoProof: 400, bankOtherFolder: 400, bankTraversal: 400,
    docOnNonBank: 400, noChange: 400, noVendor: 403, duplicate: 409, blocked: 403,
  };
  record("4  submit refuses: bad action/section/key, admin-only or cross-section fields, invalid type/phone/email/PIN/IFSC, bank change without own-folder proof, no-op, no/duplicate/blocked seller — nothing stored",
    Object.entries(expected).every(([kk, s]) => v[kk] === s) &&
    (await db.collection("vendorChangeRequests").get()).empty,
    JSON.stringify(v));

  // ============ 5. A valid request is recorded, NOT applied ============
  await resetRateLimit(A);
  const k1 = key();
  const s1 = await submit(tokenFor(A), { action: "submit", section: "business", values: good, idempotencyKey: k1 });
  const r1 = (await db.collection("vendorChangeRequests").doc(`${A}_${k1}`).get()).data() || {};
  const after1 = await vendorA();
  const audit1 = (await db.collection("audit_logs").where("action", "==", "vendor_business_change_requested").get()).docs.map((d) => d.data());
  const notif1 = await db.collection("notifications").doc(`vendor_change_${A}_${k1}`).get();
  record("5  valid business change -> PENDING request with ONLY the changed fields + previous values; vendor record untouched; audit (fields, no values) + admin notification",
    s1.status === 200 && s1.body.status === "PENDING" &&
    JSON.stringify(r1.changes) === JSON.stringify({ businessName: "Asha Traders LLP", businessType: "LLP" }) &&
    JSON.stringify(r1.previous) === JSON.stringify({ businessName: "Asha Traders", businessType: "Sole Proprietorship" }) &&
    r1.vendorDocId === "vdoc_a" && r1.status === "PENDING" &&
    after1.businessName === "Asha Traders" && after1.businessType === "Sole Proprietorship" &&
    audit1.length === 1 && JSON.stringify(audit1[0].details?.fields) === JSON.stringify(["businessName", "businessType"]) &&
    !JSON.stringify(audit1[0]).includes("Asha Traders LLP") && notif1.exists && notif1.data()?.role === "admin",
    `${s1.status} ${JSON.stringify(r1.changes)}`);

  // ============ 6. Idempotency / one pending per section ============
  const again = await submit(tokenFor(A), { action: "submit", section: "business", values: good, idempotencyKey: k1 });
  const second = await submit(tokenFor(A), { action: "submit", section: "business", values: { ...good, businessName: "Other" }, idempotencyKey: key() });
  const kAddr = key();
  const addr = await submit(tokenFor(A), { action: "submit", section: "address", values: { street: "5 New Lane", unit: "", zipCode: "395001", city: "Surat", state: "Gujarat" }, idempotencyKey: kAddr });
  record("6  same key -> alreadySubmitted (one doc); a second business request while one is pending -> 409; another section may be requested",
    again.status === 200 && again.body.alreadySubmitted === true && second.status === 409 && addr.status === 200 &&
    (await requestsOf(A)).length === 2,
    `${again.status}/${second.status}/${addr.status}`);

  // ============ 7. Cancel ============
  const cOther = await submit(tokenFor(B), { action: "cancel", requestId: `${A}_${kAddr}` });
  const cOwn = await submit(tokenFor(A), { action: "cancel", requestId: `${A}_${kAddr}` });
  const cAgain = await submit(tokenFor(A), { action: "cancel", requestId: `${A}_${kAddr}` });
  const cBad = await submit(tokenFor(A), { action: "cancel", requestId: "a/b" });
  record("7  cancel: another seller -> 404 (looks missing); owner -> CANCELLED; again -> 409; bad id -> 400",
    cOther.status === 404 && cOwn.status === 200 && cAgain.status === 409 && cBad.status === 400 &&
    (await db.collection("vendorChangeRequests").doc(`${A}_${kAddr}`).get()).data()?.status === "CANCELLED",
    `${cOther.status}/${cOwn.status}/${cAgain.status}/${cBad.status}`);

  // ============ 8. Admin-only review ============
  const lSeller = await list(tokenFor(A));
  const lCustomer = await list(tokenFor(CUSTOMER));
  const lUnverified = await list(tokenFor("admin_unverified", ADMIN_EMAIL, false));
  const dSeller = await decide(tokenFor(A), { requestId: `${A}_${k1}`, action: "APPROVE" });
  const lAdmin = await list(ADMIN);
  record("8  admin list/decide: seller, customer, unverified admin email -> 403 (a seller cannot approve their own request); admin sees the pending request",
    lSeller.status === 403 && lCustomer.status === 403 && lUnverified.status === 403 && dSeller.status === 403 &&
    lAdmin.status === 200 && lAdmin.body.requests?.length === 1 && lAdmin.body.requests[0].id === `${A}_${k1}` &&
    (await vendorA()).businessName === "Asha Traders",
    `${lSeller.status}/${lCustomer.status}/${lUnverified.status}/${dSeller.status}/${lAdmin.status}`);

  // ============ 9. Decision validation ============
  const dNoReason = await decide(ADMIN, { requestId: `${A}_${k1}`, action: "REJECT" });
  const dBadAction = await decide(ADMIN, { requestId: `${A}_${k1}`, action: "APPLY" });
  const dMissing = await decide(ADMIN, { requestId: "no_such_request", action: "APPROVE" });
  const dCancelled = await decide(ADMIN, { requestId: `${A}_${kAddr}`, action: "APPROVE" });
  record("9  reject without reason 400; unknown action 400; unknown request 404; deciding a cancelled request 409",
    dNoReason.status === 400 && dBadAction.status === 400 && dMissing.status === 404 && dCancelled.status === 409,
    `${dNoReason.status}/${dBadAction.status}/${dMissing.status}/${dCancelled.status}`);

  // ============ 10. Approve applies exactly the change ============
  const approve = await decide(ADMIN, { requestId: `${A}_${k1}`, action: "APPROVE" });
  const va = await vendorA();
  const pubA = (await db.collection("vendors_public").doc(A).get()).data() || {};
  const r1b = (await db.collection("vendorChangeRequests").doc(`${A}_${k1}`).get()).data() || {};
  const approveAgain = await decide(ADMIN, { requestId: `${A}_${k1}`, action: "APPROVE" });
  const audits10 = (await db.collection("audit_logs").where("action", "==", "vendor_business_change_approved").get()).size;
  record("10 admin approve: vendor gets exactly the changed fields (+ businessDetailsUpdatedAt), storefront mirror updated, request APPROVED with decider, audit entry; approving again -> 409",
    approve.status === 200 && va.businessName === "Asha Traders LLP" && va.businessType === "LLP" && va.fullName === "Asha Patel" &&
    va.status === "Approved" && va.kycStatus === "Approved" && va.accountNumber === "123456789012" &&
    !!va.businessDetailsUpdatedAt && !va.bankDetailsUpdatedAt &&
    pubA.businessName === "Asha Traders LLP" && pubA.businessType === "LLP" && pubA.status === "Approved" &&
    r1b.status === "APPROVED" && r1b.decidedBy === ADMIN_UID && approveAgain.status === 409 && audits10 === 1,
    `${approve.status} name=${va.businessName} public=${pubA.businessName}`);

  // ============ 11. Bank change with proof ============
  await resetRateLimit(A);
  const proofPath = `vendor-kyc/${A}/bankproof-1-cheque.pdf`;
  const proofBytes = Buffer.from("%PDF-1.4 test cheque");
  await getAdminBucket().file(proofPath).save(proofBytes, { contentType: "application/pdf" });
  const kBank = key();
  const bank = await submit(tokenFor(A), {
    action: "submit", section: "bank", idempotencyKey: kBank, documentPath: proofPath,
    values: { accountHolder: "Asha Patel", bankName: "New Bank", accountNumber: "5555 6666 7777", ifsc: "newb0001234" },
  });
  const sellerView = await getBusiness(tokenFor(A));
  const bankReq = (sellerView.body.requests || []).find((r: any) => r.section === "bank");
  const adminView = (await list(ADMIN)).body.requests?.find((r: any) => r.section === "bank");
  const docSeller = await adminDocument(new Request(`http://localhost/api/admin/business-change-requests/document?requestId=${A}_${kBank}`, { headers: { authorization: `Bearer ${tokenFor(A)}` } }));
  const docAdmin = await adminDocument(new Request(`http://localhost/api/admin/business-change-requests/document?requestId=${A}_${kBank}&mode=view`, { headers: { authorization: `Bearer ${ADMIN}` } }));
  const docBytes = Buffer.from(await docAdmin.arrayBuffer());
  record("11 bank change: normalised (spaces, IFSC case), proof required; seller sees BOTH numbers masked; admin sees proposed in full + current masked; proof served to admin only",
    bank.status === 200 && bankReq?.changes?.accountNumber === "••••••••7777" && bankReq?.previous?.accountNumber === "••••••••9012" &&
    !sellerView.text.includes("555566667777") && !sellerView.text.includes("123456789012") &&
    adminView?.changes?.accountNumber === "555566667777" && adminView?.changes?.ifsc === "NEWB0001234" &&
    adminView?.previous?.accountNumber === "••••••••9012" && adminView?.hasDocument === true &&
    docSeller.status === 403 && docAdmin.status === 200 && docBytes.equals(proofBytes) &&
    docAdmin.headers.get("cache-control") === "private, no-store",
    `${bank.status} seller=${bankReq?.changes?.accountNumber} admin=${adminView?.changes?.accountNumber} doc=${docSeller.status}/${docAdmin.status}`);

  const approveBank = await decide(ADMIN, { requestId: `${A}_${kBank}`, action: "APPROVE" });
  const vb = await vendorA();
  record("12 approving the bank change updates only the bank fields, stamps bankDetailsUpdatedAt + bankProofPath; storefront mirror untouched",
    approveBank.status === 200 && vb.accountNumber === "555566667777" && vb.ifsc === "NEWB0001234" && vb.bankName === "New Bank" &&
    vb.accountHolder === "Asha Patel" && !!vb.bankDetailsUpdatedAt && vb.bankProofPath === proofPath &&
    !("accountNumber" in ((await db.collection("vendors_public").doc(A).get()).data() || {})),
    `${approveBank.status} acct=${vb.accountNumber}`);

  // ============ 13. Stale approval refused, rejection with reason ============
  const kB = key();
  const bContact = await submit(tokenFor(B), { action: "submit", section: "contact", values: { businessPhone: "9000000001", email: "new@shop-b.example" }, idempotencyKey: kB });
  await db.collection("vendors").doc("vdoc_b").update({ email: "admin-changed@shop-b.example" });
  const stale = await decide(ADMIN, { requestId: `${B}_${kB}`, action: "APPROVE" });
  const bAfterStale = (await db.collection("vendors").doc("vdoc_b").get()).data() || {};
  const reject = await decide(ADMIN, { requestId: `${B}_${kB}`, action: "REJECT", reason: "Email changed since request; please resubmit." });
  const bSeller = await getBusiness(tokenFor(B));
  const bReq = (bSeller.body.requests || []).find((r: any) => r.id === `${B}_${kB}`);
  record("13 a request whose field moved since submission is refused (409, nothing applied); rejection needs a reason the seller then sees",
    bContact.status === 200 && stale.status === 409 && JSON.stringify(stale.body.fields) === JSON.stringify(["email"]) &&
    bAfterStale.businessPhone === "9123456780" && bAfterStale.email === "admin-changed@shop-b.example" &&
    reject.status === 200 && bReq?.status === "REJECTED" && bReq?.decisionReason?.startsWith("Email changed"),
    `${bContact.status}/${stale.status}/${reject.status} ${bReq?.status}`);

  // ============ 14. Concurrency ============
  const burst = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      submit(tokenFor(B), { action: "submit", section: "address", values: { street: `${i + 1} Burst Road`, unit: "", zipCode: "400001", city: "Mumbai", state: "Maharashtra" }, idempotencyKey: key() })
    )
  );
  const bPendingAddr = (await requestsOf(B)).filter((d) => d.data().section === "address" && d.data().status === "PENDING");
  record("14 five concurrent address requests (different keys) -> exactly one PENDING request, the rest 409",
    burst.filter((r) => r.status === 200).length === 1 && burst.filter((r) => r.status === 409).length === 4 && bPendingAddr.length === 1,
    `statuses=${burst.map((r) => r.status).join(",")}`);

  // ============ 15. Money untouched ============
  const payableAfter = await payable(A);
  record("15 none of this moves money: A's payable breakdown identical before/after (700 − 49 delivery = 651), commission ₹0",
    JSON.stringify(payableBefore) === JSON.stringify(payableAfter) && payableAfter.payable === 651 &&
    payableAfter.breakdown?.commission === 0,
    `before=${payableBefore.payable} after=${payableAfter.payable}`);
} catch (error) {
  record("HARNESS ERROR", false, (error as Error)?.stack || String(error));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
