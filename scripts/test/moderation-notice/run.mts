/*
 * Rejection notice accuracy (C1) — emulator test.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST;
 * a throwaway service-account key is generated, auth is faked through the
 * Identity Toolkit fetch). Proves, through the REAL routes:
 *   app/api/admin/products/[id]/moderation   (reject / approve)
 *   app/api/seller/product-status            (resubmit)
 * that:
 *   - a rejection notice promises "edit and resubmit" ONLY to a seller who can
 *     actually resubmit (shared approval model passes AND a uid-keyed vendors
 *     record is "Approved");
 *   - every other seller — no record, Pending, Blocked, Rejected, a refused
 *     mirror, a Blocked duplicate, a legacy-only vendors/{uid} record, or a
 *     lookup that fails — gets the neutral "hidden pending seller
 *     verification" wording with the reason and no resubmit promise;
 *   - the rejection itself is unchanged: same product fields, same audit_logs
 *     schema, one notification, vendorId untouched;
 *   - approved sellers can still resubmit; non-approved / missing sellers are
 *     refused; approve notices are unchanged.
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/moderation-notice/run.mts"
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

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { POST: moderate } = await import("../../../app/api/admin/products/[id]/moderation/route.ts");
const { POST: productStatus } = await import("../../../app/api/seller/product-status/route.ts");
const { rejectionNoticeFor } = await import("../../../lib/products/rejectionNotice.ts");
const { findUnapprovedSellers } = await import("../../../lib/sellerApproval.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const ADMIN_UID = "admin_notice_1";
const token = (uid: string, email = `${uid}@example.com`) => `test:${uid}:${email}:true`;
const ADMIN = token(ADMIN_UID, ADMIN_EMAIL);
const REASON = "Images do not match the listing.";
const RESUBMIT = "You can edit it and resubmit it for review.";
const NEUTRAL = "is hidden pending seller verification";

const S = {
  APPROVED: "seller_notice_approved", NONE: "seller_notice_none", PENDING: "seller_notice_pending",
  BLOCKED: "seller_notice_blocked", REJECTED: "seller_notice_rejected", MIRROR: "seller_notice_mirror",
  DUP: "seller_notice_dup", LEGACY: "seller_notice_legacy",
};
// "a/b" makes "vendors/a/b" / "vendors_public/a/b" an ODD-segment (collection)
// path, so lib/sellerApproval's .doc(uid) throws — the lookup itself fails.
// An Approved uid-keyed record is seeded for this same uid, so if the lookup did
// NOT throw it would PROMISE resubmission: neutral wording here can only come
// from the route's catch (fail closed), never from "no seller record".
const BAD_VENDOR_ID = "a/b";

async function clearAll() {
  for (const c of ["products", "vendors", "vendors_public", "audit_logs", "notifications", "rateLimits"]) await db.recursiveDelete(db.collection(c));
}
async function seed() {
  const v = (data: Record<string, unknown>) =>
    db.collection("vendors").add({ kycStatus: "Approved", taxProfile: { gstStatus: "UNREGISTERED" }, ...data });
  await v({ uid: S.APPROVED, status: "Approved" });
  await db.collection("vendors_public").doc(S.APPROVED).set({ uid: S.APPROVED, status: "Approved" });
  await v({ uid: S.PENDING, status: "Pending" });
  await v({ uid: S.BLOCKED, status: "Blocked" });
  await v({ uid: S.REJECTED, status: "Rejected" });
  await v({ uid: S.MIRROR, status: "Approved" });
  await db.collection("vendors_public").doc(S.MIRROR).set({ uid: S.MIRROR, status: "Blocked" });
  await v({ uid: S.DUP, status: "Approved" }); await v({ uid: S.DUP, status: "Blocked" });
  await db.collection("vendors").doc(S.LEGACY).set({ status: "Approved", taxProfile: { gstStatus: "UNREGISTERED" } }); // legacy: no uid field
  // S.NONE has no vendors record at all.
  await v({ uid: BAD_VENDOR_ID, status: "Approved" }); // see BAD_VENDOR_ID
}
const live = (id: string, vendorId: unknown, extra: Record<string, unknown> = {}) =>
  db.collection("products").doc(id).set({
    title: `Item ${id}`, price: 100, stock: 5, active: true, approved: false, sku: "SKU", ...(vendorId === undefined ? {} : { vendorId }), ...extra,
  });

async function call(handler: any, url: string, body: unknown, bearer: string, params?: Record<string, string>) {
  const req = new Request(url, { method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const res = params ? await handler(req, { params: Promise.resolve(params) }) : await handler(req);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const reject = (id: string) => call(moderate, `http://x/api/admin/products/${id}/moderation`, { action: "reject", reason: REASON }, ADMIN, { id });
const approve = (id: string) => call(moderate, `http://x/api/admin/products/${id}/moderation`, { action: "approve" }, ADMIN, { id });
const resubmit = (id: string, uid: string) => call(productStatus, "http://x/api/seller/product-status", { productId: id, action: "resubmit" }, token(uid));
const product = async (id: string) => (await db.collection("products").doc(id).get()).data() as any;
const noticesFor = async (uid: string) => (await db.collection("notifications").where("userId", "==", uid).get()).docs.map((d) => d.data() as any);
const auditFor = async (id: string) => (await db.collection("audit_logs").where("targetId", "==", id).get()).docs.map((d) => d.data() as any);

try {
  await clearAll();
  await seed();

  // ---------- pure wording ----------
  const pApproved = rejectionNoticeFor({ title: "X", reason: REASON, sellerCanResubmit: true });
  const pNeutral = rejectionNoticeFor({ title: "X", reason: REASON, sellerCanResubmit: false });
  const pNoReason = rejectionNoticeFor({ title: "X", reason: null, sellerCanResubmit: false });
  const pTruthy = rejectionNoticeFor({ title: "X", reason: REASON, sellerCanResubmit: "true" as unknown as boolean });
  record("wording (pure): verified seller keeps the existing resubmit guidance; anything else — false, or a truthy non-boolean — gets the neutral wording with the reason and no resubmit promise",
    pApproved.message === `"X" was not approved. Reason: ${REASON} ${RESUBMIT}` &&
      pNeutral.message === `"X" was not approved and ${NEUTRAL}. Reason: ${REASON}` &&
      pNoReason.message === `"X" was not approved and ${NEUTRAL}.` &&
      pTruthy.message === pNeutral.message && [pApproved, pNeutral].every((n) => n.title === "Product rejected") &&
      !/resubmit|reinstat|restore/i.test(pNeutral.message),
    pNeutral.message);

  // ---------- reject through the real route, per seller standing ----------
  const cases: [string, unknown, boolean][] = [
    ["approved seller (record Approved, mirror Approved)", S.APPROVED, true],
    ["no seller record (V1-like)", S.NONE, false],
    ["seller record Pending", S.PENDING, false],
    ["seller record Blocked", S.BLOCKED, false],
    ["seller record Rejected", S.REJECTED, false],
    ["record Approved but public mirror Blocked (approval model refuses)", S.MIRROR, false],
    ["duplicate records, one Blocked (approval model refuses)", S.DUP, false],
    ["legacy-only vendors/{uid} Approved, no uid-keyed record (product-status would refuse)", S.LEGACY, false],
    ["identity lookup throws although an Approved uid-keyed record exists (route catch, fail closed)", BAD_VENDOR_ID, false],
  ];
  const caseBad: string[] = [];
  const productKeySets: string[] = [];
  const auditKeySets: string[] = [];
  const caseOk: Record<string, boolean> = {};
  let i = 0;
  for (const [name, vendorId, canResubmit] of cases) {
    const id = `p_notice_${++i}`;
    await live(id, vendorId);
    const before = await product(id);
    const r = await reject(id);
    const after = await product(id);
    const notes = (await noticesFor(String(vendorId))).filter((n) => String(n.message).includes(`Item ${id}`));
    const audits = await auditFor(id);
    const note = notes[0];
    const msgOk = canResubmit
      ? note?.message === `"Item ${id}" was not approved. Reason: ${REASON} ${RESUBMIT}`
      : note?.message === `"Item ${id}" was not approved and ${NEUTRAL}. Reason: ${REASON}` && !/resubmit/i.test(note?.message);
    const changed = Object.keys({ ...before, ...after }).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
    productKeySets.push(changed.join(","));
    auditKeySets.push(Object.keys(audits[0]?.details || {}).sort().join(","));
    const fieldsOk = r.status === 200 && r.body.from === "live" && r.body.status === "rejected" &&
      after.approvalStatus === "rejected" && after.active === false && after.approved === false &&
      after.rejectionReason === REASON && after.moderatedBy === ADMIN_UID && typeof after.moderatedAt?.toMillis === "function" &&
      JSON.stringify(after.vendorId) === JSON.stringify(vendorId);
    const auditOk = audits.length === 1 && audits[0].action === "product_reject" && audits[0].actorUid === ADMIN_UID &&
      audits[0].details?.from === "live" && audits[0].details?.to === "rejected" && audits[0].details?.reason === REASON;
    const noteOk = notes.length === 1 && note.title === "Product rejected" && note.role === "seller" && note.type === "vendor" && note.read === false && msgOk;
    caseOk[String(vendorId)] = fieldsOk && auditOk && noteOk;
    if (!(fieldsOk && auditOk && noteOk)) caseBad.push(`${name}: fields=${fieldsOk} audit=${auditOk} notice=${noteOk} msg=${JSON.stringify(note?.message)}`);
  }
  record(`reject via the real route for ${cases.length} seller standings: resubmit guidance ONLY for the approved seller; neutral wording (with reason) for no record / Pending / Blocked / Rejected / refused mirror / Blocked duplicate / legacy-only / lookup failure`,
    caseBad.length === 0, caseBad.join(" | ") || "all as expected");
  record("rejection behaviour unchanged across all standings: identical product field changes and identical audit_logs details schema",
    productKeySets.every((k) => k === "active,approvalStatus,moderatedAt,moderatedBy,rejectionReason") &&
      auditKeySets.every((k) => k === "from,reason,to,vendorId"),
    `product=${[...new Set(productKeySets)].join(" | ")} audit=${[...new Set(auditKeySets)].join(" | ")}`);
  // ^ `approved` was already false on these legacy-shaped products, so it does not appear as changed.

  // ---------- the fail-closed (catch) branch is genuinely exercised ----------
  let lookupThrew = false;
  try { await findUnapprovedSellers(db, [BAD_VENDOR_ID]); } catch { lookupThrew = true; }
  const badRecord = await db.collection("vendors").where("uid", "==", BAD_VENDOR_ID).limit(1).get();
  record("catch branch: the identity lookup really THROWS for 'a/b', an Approved uid-keyed record exists for it, and the route still rejected (200) with the NEUTRAL wording — only the fail-closed catch can produce that",
    lookupThrew && !badRecord.empty && badRecord.docs[0].data().status === "Approved" && caseOk[BAD_VENDOR_ID] === true,
    `lookupThrew=${lookupThrew} approvedRecordExists=${!badRecord.empty} routeNeutral=${caseOk[BAD_VENDOR_ID]}`);

  // ---------- no vendorId: unchanged (no notification) ----------
  await live("p_notice_novendor", undefined);
  const nv = await reject("p_notice_novendor");
  const nvNotes = (await db.collection("notifications").get()).docs.filter((d) => String(d.data().message).includes("Item p_notice_novendor"));
  record("product with no vendorId: still rejected (200), still no notification (unchanged)",
    nv.status === 200 && (await product("p_notice_novendor")).approvalStatus === "rejected" && nvNotes.length === 0, `status=${nv.status} notes=${nvNotes.length}`);

  // ---------- approve notice unchanged ----------
  await live("p_notice_approve", S.APPROVED, { approvalStatus: "pending" });
  const ap = await approve("p_notice_approve");
  const apNote = (await noticesFor(S.APPROVED)).find((n) => String(n.message).includes("Item p_notice_approve"));
  record("approve notice unchanged: \"was approved and is now live.\"",
    ap.status === 200 && apNote?.title === "Product approved" && apNote?.message === `"Item p_notice_approve" was approved and is now live.`, apNote?.message ?? "-");

  // ---------- resubmission ----------
  const okResub = await resubmit("p_notice_1", S.APPROVED);
  const okAfter = await product("p_notice_1");
  record("approved seller can still resubmit a rejected product (200 -> pending, hidden, reason cleared)",
    okResub.status === 200 && okAfter.approvalStatus === "pending" && okAfter.active === false && okAfter.rejectionReason === null,
    `status=${okResub.status} ${JSON.stringify(okResub.body).slice(0, 120)}`);
  const denied: [string, string, string][] = [
    ["no seller record", "p_notice_2", S.NONE],
    ["Pending seller", "p_notice_3", S.PENDING],
    ["Blocked seller", "p_notice_4", S.BLOCKED],
    ["Rejected seller", "p_notice_5", S.REJECTED],
  ];
  const deniedBad: string[] = [];
  for (const [name, id, uid] of denied) {
    const r = await resubmit(id, uid);
    const p = await product(id);
    if (r.status !== 403 || p.approvalStatus !== "rejected" || p.rejectionReason !== REASON) deniedBad.push(`${name}: ${r.status} ${p.approvalStatus}`);
  }
  record("resubmission refused (403) for a seller without an Approved record — no record / Pending / Blocked / Rejected; product stays rejected",
    deniedBad.length === 0, deniedBad.join(" | ") || "all 403");
} catch (e) {
  record("HARNESS ERROR", false, (e as Error).stack || String(e));
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
if (passed !== results.length) {
  console.log("FAILED:");
  for (const r of results.filter((x) => !x.pass)) console.log(`  - ${r.name}`);
}
process.exit(passed === results.length ? 0 : 1);
