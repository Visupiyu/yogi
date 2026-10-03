/*
 * Seller KYC review flow — admin approve / reject, the seller's status page
 * data, and resubmission after a rejection (app/api/admin/kyc/decision,
 * app/api/seller/kyc, lib/sellerKyc.ts, lib/sellerKycServer.ts).
 *
 * Firestore + Storage EMULATORS only (injected by `firebase emulators:exec`).
 * Never touches production. Auth is faked by intercepting the Identity Toolkit
 * lookup (token "test:<uid>:<email>:<verified>").
 *
 * Run:
 *   npx firebase emulators:exec --only firestore,storage --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/kyc/flow.mts"
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

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try { idToken = JSON.parse(init?.body ?? "{}").idToken ?? ""; } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    return new Response(
      JSON.stringify({ users: [{ localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true" }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb, getAdminBucket } = await import("../../../lib/firebaseAdmin.ts");
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { POST: decideRoute } = await import("../../../app/api/admin/kyc/decision/route.ts");
const { GET: kycGet, POST: kycPost } = await import("../../../app/api/seller/kyc/route.ts");
const { GET: documentRoute } = await import("../../../app/api/admin/kyc/document/route.ts");
const { kycStatusOf, validateRejectionReason, validateResubmission, kycDocumentObjectPath } = await import("../../../lib/sellerKyc.ts");

const db = getAdminDb();
const results: { name: string; pass: boolean }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
async function clearAll() {
  for (const name of ["vendors", "vendors_public", "audit_logs", "rateLimits"]) await db.recursiveDelete(db.collection(name));
}

const tokenFor = (uid: string, email = `${uid}@example.com`, verified = true) => `test:${uid}:${email}:${verified}`;
const ADMIN = tokenFor("admin_kyc_1", ADMIN_EMAIL);
const json = async (res: Response) => res.json().catch(() => ({}));

async function decide(token: string | null, body: unknown) {
  const res = await decideRoute(new Request("http://localhost/api/admin/kyc/decision", {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await json(res) };
}
async function status(uid: string) {
  const res = await kycGet(new Request("http://localhost/api/seller/kyc", { headers: { authorization: `Bearer ${tokenFor(uid)}` } }));
  return { status: res.status, body: await json(res) };
}
async function resubmit(uid: string, body: unknown) {
  const res = await kycPost(new Request("http://localhost/api/seller/kyc", {
    method: "POST",
    headers: { authorization: `Bearer ${tokenFor(uid)}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await json(res) };
}

const VALUES = {
  gstNumber: "",
  panNumber: "ABCDE1234F",
  aadhaarNumber: "123412341234",
  accountHolder: "Asha Traders",
  bankName: "State Bank",
  accountNumber: "123456789012",
  ifsc: "SBIN0001234",
};

async function seedVendor(docId: string, uid: string, extra: Record<string, unknown> = {}) {
  await db.collection("vendors").doc(docId).set({
    uid, businessName: `Shop ${uid}`, email: `${uid}@example.com`, kycStatus: "Pending", status: "Pending",
    gstDocUrl: "", aadhaarDocUrl: `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(`vendor-kyc/${uid}/aadhaar-1-a.pdf`)}?alt=media&token=t`,
    chequeDocUrl: "", ...VALUES, ...extra,
  });
  await db.collection("vendors_public").doc(uid).set({ uid, businessName: `Shop ${uid}`, status: extra.status ?? "Pending" });
}
const vendor = async (docId: string) => (await db.collection("vendors").doc(docId).get()).data() || {};
const publicStatus = async (uid: string) => (await db.collection("vendors_public").doc(uid).get()).data()?.status;

await clearAll();

// ---- pure rules ------------------------------------------------------------
record("1  kycStatusOf: explicit status, legacy approved status, default Pending",
  kycStatusOf({ kycStatus: "Rejected" }) === "Rejected" && kycStatusOf({ status: "Approved" }) === "Approved" && kycStatusOf({}) === "Pending");
record("2  rejection reason is required (empty / too short / too long refused)",
  !validateRejectionReason("").ok && !validateRejectionReason("   no ").ok && !validateRejectionReason("x".repeat(501)).ok &&
  validateRejectionReason("  PAN card image is blurry ").ok);
{
  const bad = validateResubmission("u1", { values: { ...VALUES, panNumber: "123", kycStatus: "Approved" }, documents: { aadhaar: "vendor-kyc/OTHER/x.pdf" } });
  const errs = bad.ok ? [] : bad.errors;
  record("3  resubmission validation: bad PAN, foreign field and another seller's file refused",
    !bad.ok && errs.some((e) => e.includes("PAN")) && errs.some((e) => e.includes("kycStatus")) && errs.some((e) => e.includes("aadhaar")), errs.join(" | "));
}
record("4  stored document pointer: download URL or object path both resolve",
  kycDocumentObjectPath("vendor-kyc/u/a.pdf") === "vendor-kyc/u/a.pdf" &&
  kycDocumentObjectPath("https://firebasestorage.googleapis.com/v0/b/x/o/vendor-kyc%2Fu%2Fa.pdf?alt=media") === "vendor-kyc/u/a.pdf" &&
  kycDocumentObjectPath("not a url") === null);

// ---- authorization -----------------------------------------------------------
await seedVendor("v_pending", "seller_pending");
{
  const anon = await decide(null, { vendorId: "v_pending", action: "APPROVE" });
  const self = await decide(tokenFor("seller_pending"), { vendorId: "v_pending", action: "APPROVE" });
  const unverifiedOwner = await decide(tokenFor("x", ADMIN_EMAIL, false), { vendorId: "v_pending", action: "APPROVE" });
  const v = await vendor("v_pending");
  record("5  approve refused: signed out 401, the seller themselves 403, unverified admin email 403; nothing changed",
    anon.status === 401 && self.status === 403 && unverifiedOwner.status === 403 && v.kycStatus === "Pending",
    `${anon.status}/${self.status}/${unverifiedOwner.status} kyc=${v.kycStatus}`);
  const selfReject = await decide(tokenFor("seller_pending"), { vendorId: "v_pending", action: "REJECT", reason: "a valid reason" });
  record("6  reject by a non-admin refused 403", selfReject.status === 403);
}

// ---- pending -> seller sees pending -----------------------------------------
{
  const s = await status("seller_pending");
  record("7  pending seller: status page shows Pending, no reason, no document URLs",
    s.status === 200 && s.body.kycStatus === "Pending" && s.body.rejectionReason === null && s.body.documents?.aadhaar === true &&
    !JSON.stringify(s.body).includes("firebasestorage"), JSON.stringify(s.body).slice(0, 160));
  const r = await resubmit("seller_pending", { values: VALUES, documents: {} });
  record("8  pending seller cannot 'resubmit' (409)", r.status === 409, `${r.status}`);
}

// ---- reject requires a reason --------------------------------------------------
{
  const noReason = await decide(ADMIN, { vendorId: "v_pending", action: "REJECT" });
  const blank = await decide(ADMIN, { vendorId: "v_pending", action: "REJECT", reason: "   " });
  record("9  admin reject without a reason refused (400), still Pending",
    noReason.status === 400 && blank.status === 400 && (await vendor("v_pending")).kycStatus === "Pending");
  const ok = await decide(ADMIN, { vendorId: "v_pending", action: "REJECT", reason: "Aadhaar photo is unreadable" });
  const v = await vendor("v_pending");
  record("10 admin reject with reason: Rejected + reason + reviewer stored, public mirror Rejected",
    ok.status === 200 && v.kycStatus === "Rejected" && v.status === "Rejected" && v.kycRejectionReason === "Aadhaar photo is unreadable" &&
    v.kycReviewedBy === "admin_kyc_1" && (await publicStatus("seller_pending")) === "Rejected");
  const audits = await db.collection("audit_logs").where("action", "==", "kyc_rejected").get();
  record("11 rejection audited with the reason", audits.size === 1 && audits.docs[0].data().details?.reason === "Aadhaar photo is unreadable");
  const again = await decide(ADMIN, { vendorId: "v_pending", action: "REJECT", reason: "again please" });
  record("12 repeat rejection refused (409)", again.status === 409);
}

// ---- seller sees the reason ------------------------------------------------------
{
  const s = await status("seller_pending");
  record("13 rejected seller sees status Rejected and the admin's reason",
    s.body.kycStatus === "Rejected" && s.body.rejectionReason === "Aadhaar photo is unreadable");
  const other = await status("someone_else");
  record("14 another account has no seller KYC record (404) — never someone else's", other.status === 404);
}

// ---- resubmission ------------------------------------------------------------------
{
  const nothing = await resubmit("seller_pending", { values: VALUES, documents: {} });
  record("15 resubmitting with nothing changed is refused (400)", nothing.status === 400, nothing.body.error);
  const missing = await resubmit("seller_pending", { values: VALUES, documents: { aadhaar: "vendor-kyc/seller_pending/aadhaar-2-new.pdf" } });
  record("16 a document that was never uploaded is refused (400)", missing.status === 400 && /upload/i.test(missing.body.error || ""), missing.body.error);
  const foreign = await resubmit("seller_pending", { values: VALUES, documents: { aadhaar: "vendor-kyc/seller_other/x.pdf" } });
  record("17 another seller's file path is refused (400)", foreign.status === 400);
  const selfApprove = await resubmit("seller_pending", { values: { ...VALUES, kycStatus: "Approved" }, documents: {} });
  record("18 resubmission cannot carry kycStatus (400)", selfApprove.status === 400 && (await vendor("v_pending")).kycStatus === "Rejected");

  await getAdminBucket().file("vendor-kyc/seller_pending/aadhaar-2-new.pdf").save(Buffer.from("%PDF-1.4 test"), { contentType: "application/pdf" });
  const ok = await resubmit("seller_pending", {
    values: { ...VALUES, panNumber: "abcde9999z" },
    documents: { aadhaar: "vendor-kyc/seller_pending/aadhaar-2-new.pdf" },
  });
  const v = await vendor("v_pending");
  record("19 resubmission with a corrected PAN + new Aadhaar file: back to Pending (kyc + account + public mirror)",
    ok.status === 200 && v.kycStatus === "Pending" && v.status === "Pending" && (await publicStatus("seller_pending")) === "Pending",
    `${ok.status} ${JSON.stringify(ok.body)}`);
  record("20 corrections stored; reason moved to previous; resubmission counted",
    v.panNumber === "ABCDE9999Z" && v.aadhaarDocUrl === "vendor-kyc/seller_pending/aadhaar-2-new.pdf" &&
    v.kycRejectionReason === undefined && v.kycPreviousRejectionReason === "Aadhaar photo is unreadable" && v.kycResubmissionCount === 1);
  const doc = await documentRoute(new Request("http://localhost/api/admin/kyc/document?vendorId=v_pending&type=aadhaar&mode=view", {
    headers: { authorization: `Bearer ${ADMIN}` },
  }));
  record("21 admin can open the resubmitted document (stored as an object path)", doc.status === 200 && (await doc.text()).startsWith("%PDF"));
  const twice = await resubmit("seller_pending", { values: { ...VALUES, panNumber: "ABCDE1111Z" }, documents: {} });
  record("22 a second resubmission while Pending is refused (409)", twice.status === 409);
}

// ---- approve -------------------------------------------------------------------------
{
  const ok = await decide(ADMIN, { vendorId: "v_pending", action: "APPROVE" });
  const v = await vendor("v_pending");
  const s = await status("seller_pending");
  record("23 admin approves: Approved everywhere, reason cleared, seller sees Approved",
    ok.status === 200 && v.kycStatus === "Approved" && v.status === "Approved" && v.kycRejectionReason === undefined &&
    (await publicStatus("seller_pending")) === "Approved" && s.body.kycStatus === "Approved");
  const again = await decide(ADMIN, { vendorId: "v_pending", action: "APPROVE" });
  record("24 repeat approval refused (409)", again.status === 409);
  const r = await resubmit("seller_pending", { values: { ...VALUES, panNumber: "ABCDE2222Z" }, documents: {} });
  record("25 approved seller cannot resubmit / change KYC through this route (409)", r.status === 409 && (await vendor("v_pending")).panNumber === "ABCDE9999Z");
}

// ---- blocked accounts --------------------------------------------------------------------
{
  await seedVendor("v_blocked", "seller_blocked", { kycStatus: "Pending", status: "Blocked" });
  await decide(ADMIN, { vendorId: "v_blocked", action: "APPROVE" });
  const v = await vendor("v_blocked");
  record("26 approving KYC never lifts a block (status stays Blocked)", v.kycStatus === "Approved" && v.status === "Blocked");
  await decide(ADMIN, { vendorId: "v_blocked", action: "REJECT", reason: "documents expired" });
  const r = await resubmit("seller_blocked", { values: { ...VALUES, panNumber: "ABCDE3333Z" }, documents: {} });
  record("27 a blocked seller cannot resubmit (403)", r.status === 403);
}
{
  const missing = await decide(ADMIN, { vendorId: "nope", action: "APPROVE" });
  const badAction = await decide(ADMIN, { vendorId: "v_pending", action: "DELETE" });
  record("28 unknown vendor 404, unknown action 400", missing.status === 404 && badAction.status === 400);
}

await clearAll();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
