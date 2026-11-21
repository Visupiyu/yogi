/*
 * LOCAL-ONLY emulator regression harness — withdrawal settlement integrity (B2).
 *
 * The browser can no longer write a withdrawal at all (rules: see
 * ./rules.test.mts). This proves the two server routes that replaced those
 * writes:
 *   app/api/settle-withdrawal  Pending/Approved -> Paid
 *   app/api/review-withdrawal  Pending <-> Approved, Pending/Approved -> Rejected
 *
 * Covers:
 *   1  only a verified admin may settle or review (seller / customer 403)
 *   2  legitimate settlement succeeds: Paid, paidAt, paidBy, settlementAuditId
 *   3  the settlement audit_logs record: who, when (== paidAt), amount,
 *      vendor, withdrawal id, payout number, payable before/after
 *   4  payable drops by exactly the settled amount
 *   5  a repeated settle is a no-op (alreadyPaid), no second audit record
 *   6  concurrent settles of one withdrawal pay it exactly once
 *   7  settlement over payable refused, nothing written
 *   8  a re-pointed seller identity (vendorId != the request's own id) refused
 *   9  a non-whole-rupee / string amount refused
 *  10  review transitions: allowed ones succeed with an audit entry; Rejected
 *      and Paid are final; review can never set Paid
 *  11  a legacy withdrawal without a valid vendorId is refused (no email
 *      fallback): unchanged, unpaid, no audit; valid settlements still work
 *  12  the seller must be Approved at settlement (blocked / half-blocked /
 *      Pending / Rejected refused; re-approved and legacy vendors/{uid}
 *      sellers settle)
 *  13  malformed withdrawal ids -> 400 before any Firestore access
 *
 * Firestore EMULATOR only. Never touches production, never reads the real
 * service account (throwaway RSA key), auth faked via the Identity Toolkit
 * fetch, `razorpay` aliased to the fake via ../mobile-variant/tsconfig.harness.json.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/withdrawals/run.mts"
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
const { POST: requestWithdrawal } = await import("../../../app/api/request-withdrawal/route.ts");
const { POST: settleWithdrawal } = await import("../../../app/api/settle-withdrawal/route.ts");
const { POST: reviewWithdrawal } = await import("../../../app/api/review-withdrawal/route.ts");
const { GET: sellerPayable } = await import("../../../app/api/seller/payable/route.ts");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = [
  "orders", "sellerOrders", "vendors", "settings", "counters", "rateLimits", "withdrawals",
  "vendor_payouts", "itemRequests", "returns", "audit_logs",
];
async function clearAll() { for (const name of COLLECTIONS) await db.recursiveDelete(db.collection(name)); }

const ADMIN_UID = "admin_wd_1";
const A = "seller_wd_a";
const B = "seller_wd_b";
const CUSTOMER = "customer_wd_1";

const tokenFor = (uid: string, email = `${uid}@example.com`, verified = true) => `test:${uid}:${email}:${verified}`;
const ADMIN = tokenFor(ADMIN_UID, ADMIN_EMAIL);
function post(url: string, body: unknown, token: string | null) {
  return new Request(url, {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

async function settle(withdrawalId: string, token: string | null = ADMIN) {
  const res = await settleWithdrawal(post("http://localhost/api/settle-withdrawal", { withdrawalId }, token));
  return { status: res.status, body: await json(res) };
}
async function review(withdrawalId: string, status: string, token: string | null = ADMIN) {
  const res = await reviewWithdrawal(post("http://localhost/api/review-withdrawal", { withdrawalId, status }, token));
  return { status: res.status, body: await json(res) };
}
let k = 0;
const key = () => `wdkey_${++k}_${Date.now()}`;
async function requestAs(uid: string, amount: number) {
  const res = await requestWithdrawal(post("http://localhost/api/request-withdrawal", { amount, idempotencyKey: key() }, tokenFor(uid)));
  return { status: res.status, body: await json(res) };
}
async function payable(uid: string): Promise<number> {
  const res = await sellerPayable(new Request("http://localhost/api/seller/payable", {
    headers: { authorization: `Bearer ${tokenFor(uid)}` },
  }));
  return Number((await json(res))?.payable);
}
const wd = async (id: string) => (await db.collection("withdrawals").doc(id).get()).data() as any;
async function audits(action: string, targetId?: string) {
  const snap = await db.collection("audit_logs").where("action", "==", action).get();
  return snap.docs.filter((d) => !targetId || d.data().targetId === targetId);
}

// A earns ₹1000 (one delivered + paid order, paid delivery); B earns ₹500.
async function seed() {
  await db.collection("settings").doc("global").set({ freeShippingThreshold: 499, standardShippingCharge: 49, deliveryCost: 49 });
  for (const uid of [A, B]) {
    await db.collection("vendors").add({ uid, email: `${uid}@example.com`, businessName: `Shop ${uid}`, status: "Approved", kycStatus: "Approved" });
  }
  for (const [orderId, uid, price] of [["wd_o1", A, 1000], ["wd_o2", B, 500]] as const) {
    await db.collection("orders").doc(orderId).set({
      userId: CUSTOMER, vendorIds: [uid], items: [{ id: `p_${orderId}`, vendorId: uid, price, qty: 1 }],
      total: price, shippingCharge: 49, finalTotal: price + 49, deliveryCost: 49, freeDeliveryApplied: false,
      status: "Delivered", paymentStatus: "Paid", paymentMethod: "ONLINE",
    });
    await db.collection("sellerOrders").doc(`${orderId}_${uid}`).set({
      orderId, vendorId: uid, vendorSubtotal: price, vendorCommission: 0, vendorEarning: price, sellerDeliveryCharge: 0,
    });
  }
}

try {
  await clearAll();
  await seed();
  const startA = await payable(A);

  // ============ 1. authorization ============
  const w1 = await requestAs(A, 400);
  const id1: string = w1.body.withdrawalId;
  {
    const r = {
      settleSignedOut: (await settle(id1, null)).status,
      settleSeller: (await settle(id1, tokenFor(A))).status,
      settleCustomer: (await settle(id1, tokenFor(CUSTOMER))).status,
      settleUnverifiedAdmin: (await settle(id1, tokenFor("admin_unverified", ADMIN_EMAIL, false))).status,
      reviewSeller: (await review(id1, "Approved", tokenFor(A))).status,
      reviewCustomer: (await review(id1, "Rejected", tokenFor(CUSTOMER))).status,
    };
    const w = await wd(id1);
    record("1  settle/review: signed-out 401; seller, customer, unverified admin 403; withdrawal untouched",
      w1.status === 200 && r.settleSignedOut === 401 && r.settleSeller === 403 && r.settleCustomer === 403 &&
        r.settleUnverifiedAdmin === 403 && r.reviewSeller === 403 && r.reviewCustomer === 403 &&
        w?.status === "Pending" && !("paidAt" in w) && (await db.collection("audit_logs").get()).empty,
      `${JSON.stringify(r)} status=${w?.status} startPayable=${startA}`);
  }

  // ============ 2-4. legitimate review + settlement, with audit ============
  {
    const approve = await review(id1, "Approved");
    const reviewAudit = await audits("withdrawal_review", id1);
    record("10a review Pending -> Approved succeeds with a withdrawal_review audit entry",
      approve.status === 200 && (await wd(id1))?.status === "Approved" && (await wd(id1))?.reviewedBy === ADMIN_UID &&
        reviewAudit.length === 1 && reviewAudit[0].data().details?.toStatus === "Approved",
      `status=${approve.status} audits=${reviewAudit.length}`);

    const before = await payable(A);
    const s = await settle(id1);
    const w = await wd(id1);
    const auditDocs = await audits("withdrawal_settlement", id1);
    const a = auditDocs[0]?.data();
    record("2  legitimate settlement: 200, status Paid, paidAt set, paidBy = the admin uid",
      s.status === 200 && s.body.status === "Paid" && s.body.amount === 400 &&
        w?.status === "Paid" && typeof w?.paidAt?.toMillis === "function" && w?.paidBy === ADMIN_UID,
      `status=${s.status} body=${JSON.stringify(s.body)} paidBy=${w?.paidBy}`);
    record("3  settlement audit record: actor uid+email, withdrawal id, vendor id+email, amount, payout number, payable before/after, createdAt == paidAt, linked from the withdrawal",
      auditDocs.length === 1 && a?.actorUid === ADMIN_UID && a?.actorEmail === ADMIN_EMAIL &&
        a?.targetId === id1 && a?.details?.withdrawalId === id1 && a?.details?.vendorId === A &&
        a?.details?.vendorEmail === `${A}@example.com` && a?.details?.amount === 400 &&
        typeof a?.details?.payoutNumber === "string" && a.details.payoutNumber === w?.payoutNumber && a.details.payoutNumber !== "" &&
        // payableBefore excludes this request's own reservation: ₹1000 earned.
        a?.details?.fromStatus === "Approved" && a?.details?.payableBefore === 1000 &&
        a?.createdAt?.toMillis?.() === w?.paidAt?.toMillis?.() && w?.settlementAuditId === auditDocs[0].id,
      `audits=${auditDocs.length} details=${JSON.stringify(a?.details)} actor=${a?.actorUid}`);
    const after = await payable(A);
    record("4  payable: ₹1000 -> 600 after the ₹400 request (reserved) and still 600 once Paid (no double count)",
      startA === 1000 && before === 600 && after === 600 && a?.details?.payableAfter === 600,
      `start=${startA} beforeSettle=${before} afterSettle=${after}`);

    // ============ 5. repeat settle ============
    const again = await settle(id1);
    record("5  settling a Paid withdrawal again -> 200 alreadyPaid, no second audit record, paidAt unchanged",
      again.status === 200 && again.body.alreadyPaid === true &&
        (await audits("withdrawal_settlement", id1)).length === 1 &&
        (await wd(id1))?.paidAt?.toMillis?.() === w?.paidAt?.toMillis?.(),
      `status=${again.status} body=${JSON.stringify(again.body)}`);
  }

  // ============ 6. concurrent settles of one withdrawal ============
  {
    const w = await requestAs(A, 300);
    const id = w.body.withdrawalId as string;
    const before = await payable(A);
    const burst = await Promise.all(Array.from({ length: 5 }, () => settle(id)));
    const paidNow = burst.filter((r) => r.status === 200 && r.body.status === "Paid" && !r.body.alreadyPaid).length;
    const already = burst.filter((r) => r.status === 200 && r.body.alreadyPaid === true).length;
    const after = await payable(A);
    record("6  five concurrent settles -> exactly one pays, four alreadyPaid; one audit record; payable moves once",
      w.status === 200 && paidNow === 1 && already === 4 && (await audits("withdrawal_settlement", id)).length === 1 &&
        (await wd(id))?.status === "Paid" && before === 300 && after === 300,
      `paid=${paidNow} already=${already} statuses=${burst.map((r) => r.status).join(",")} payable ${before}->${after}`);
  }

  // ============ 7. settlement over payable ============
  {
    // A has ₹300 left. A request created within balance, then the balance is
    // consumed by a direct admin payout recorded afterwards.
    const w = await requestAs(A, 300);
    const id = w.body.withdrawalId as string;
    await db.collection("vendor_payouts").add({ vendorId: A, amount: 250, createdAt: new Date() });
    const s = await settle(id);
    // And a row whose stored amount is far larger than anything earned.
    await db.collection("withdrawals").doc(`${A}_huge`).set({ vendorId: A, vendorEmail: `${A}@example.com`, payoutNumber: "PO-HUGE", amount: 999999, status: "Pending" });
    const huge = await settle(`${A}_huge`);
    record("7  over payable -> 409 (₹300 against ₹50 left; ₹999999 row), status unchanged, no paidAt, no audit",
      w.status === 200 && s.status === 409 && huge.status === 409 &&
        (await wd(id))?.status === "Pending" && !("paidAt" in (await wd(id))) &&
        (await wd(`${A}_huge`))?.status === "Pending" &&
        (await audits("withdrawal_settlement", id)).length === 0 && (await audits("withdrawal_settlement", `${A}_huge`)).length === 0,
      `s=${s.status} "${s.body.error}" huge=${huge.status}`);
    await review(id, "Rejected");
    await review(`${A}_huge`, "Rejected");
  }

  // ============ 8. re-pointed vendor identity ============
  {
    // A server-created request (id `${A}_...`, payoutNumber) whose vendorId was
    // later rewritten to B — what the old admin-writable rule allowed. B has
    // ₹500 payable, so only the identity check stands in the way.
    await db.collection("withdrawals").doc(`${A}_repointed`).set({ vendorId: B, vendorEmail: `${B}@example.com`, payoutNumber: "PO-RP", amount: 100, status: "Approved" });
    const s = await settle(`${A}_repointed`);
    // A legacy row naming a seller with no vendors record at all.
    await db.collection("withdrawals").doc("legacy_ghost").set({ vendorId: "ghost_seller", vendorEmail: "ghost@example.com", amount: 10, status: "Approved" });
    const ghost = await settle("legacy_ghost");
    record("8  identity: re-pointed vendorId (id says A, field says B) -> 409; unknown seller -> 409; nothing paid",
      s.status === 409 && ghost.status === 409 &&
        (await wd(`${A}_repointed`))?.status === "Approved" && (await wd("legacy_ghost"))?.status === "Approved" &&
        (await audits("withdrawal_settlement", `${A}_repointed`)).length === 0 &&
        (await audits("withdrawal_settlement", "legacy_ghost")).length === 0 &&
        (await db.collection("withdrawals").where("vendorId", "==", B).where("status", "==", "Paid").get()).empty,
      `repointed=${s.status} "${s.body.error}" ghost=${ghost.status}`);
  }

  // ============ 9. invalid stored amount ============
  {
    await db.collection("withdrawals").doc(`${B}_str`).set({ vendorId: B, vendorEmail: `${B}@example.com`, payoutNumber: "PO-S", amount: "100", status: "Pending" });
    await db.collection("withdrawals").doc(`${B}_frac`).set({ vendorId: B, vendorEmail: `${B}@example.com`, payoutNumber: "PO-F", amount: 10.5, status: "Pending" });
    const str = await settle(`${B}_str`);
    const frac = await settle(`${B}_frac`);
    record("9  stored amount \"100\" (string) and 10.5 -> 409, not paid",
      str.status === 409 && frac.status === 409 &&
        (await wd(`${B}_str`))?.status === "Pending" && (await wd(`${B}_frac`))?.status === "Pending",
      `str=${str.status} frac=${frac.status}`);
  }

  // ============ 10. review transitions ============
  {
    const w = await requestAs(B, 100);
    const id = w.body.withdrawalId as string;
    const toApproved = await review(id, "Approved");
    const toPending = await review(id, "Pending");
    const asPaid = await review(id, "Paid");
    const toRejected = await review(id, "Rejected");
    const rejToPending = await review(id, "Pending");
    const rejToApproved = await review(id, "Approved");
    const settleRejected = await settle(id);
    const paidId = (await requestAs(B, 50)).body.withdrawalId as string;
    await settle(paidId);
    const paidToRejected = await review(paidId, "Rejected");
    const paidToPending = await review(paidId, "Pending");
    const missing = await review("no_such_withdrawal", "Approved");
    record("10b allowed: Pending -> Approved -> Pending -> Rejected all 200",
      toApproved.status === 200 && toPending.status === 200 && toRejected.status === 200,
      `${toApproved.status}/${toPending.status}/${toRejected.status}`);
    record("10c review can never set Paid (400)", asPaid.status === 400, `status=${asPaid.status}`);
    record("10d Rejected is final: -> Pending / -> Approved 409 and settle 409; status stays Rejected",
      rejToPending.status === 409 && rejToApproved.status === 409 && settleRejected.status === 409 && (await wd(id))?.status === "Rejected",
      `${rejToPending.status}/${rejToApproved.status}/${settleRejected.status}`);
    record("10e Paid is final: review -> Rejected / Pending 409; status stays Paid",
      paidToRejected.status === 409 && paidToPending.status === 409 && (await wd(paidId))?.status === "Paid",
      `${paidToRejected.status}/${paidToPending.status}`);
    record("10f unknown withdrawal -> 404", missing.status === 404, `status=${missing.status}`);
    record("10g review writes only status/reviewedAt/reviewedBy — amount and identity untouched",
      (await wd(id))?.amount === 100 && (await wd(id))?.vendorId === B && !("paidAt" in (await wd(id))),
      JSON.stringify(await wd(id)));
  }

  // ============ 11. legacy withdrawal without vendorId ============
  {
    // vendorEmail names a REAL Approved seller with balance (A) — the old
    // email fallback would have settled these, and the Paid row would never
    // have counted against A's payable (lib/vendorPayable counts by vendorId).
    const legacy: [string, Record<string, unknown>][] = [
      ["legacy_no_vendorid", { vendorEmail: `${A}@example.com`, amount: 10, status: "Approved" }],
      ["legacy_blank_vendorid", { vendorId: "  ", vendorEmail: `${A}@example.com`, amount: 10, status: "Pending" }],
      ["legacy_numeric_vendorid", { vendorId: 123, vendorEmail: `${A}@example.com`, amount: 10, status: "Approved" }],
      // Padded: would settle against A but never count against A's payable.
      ["legacy_padded_vendorid", { vendorId: `${A} `, vendorEmail: `${A}@example.com`, amount: 10, status: "Approved" }],
      ["legacy_leading_pad_vendorid", { vendorId: ` ${A}`, vendorEmail: `${A}@example.com`, amount: 10, status: "Pending" }],
    ];
    const payableBefore = await payable(A);
    const outcomes: string[] = [];
    let ok = true;
    for (const [id, data] of legacy) {
      await db.collection("withdrawals").doc(id).set(data);
      const before = JSON.stringify(await wd(id));
      const s = await settle(id);
      const after = await wd(id);
      const unchanged = JSON.stringify(after) === before;
      const noAudit = (await audits("withdrawal_settlement", id)).length === 0;
      outcomes.push(`${id}: ${s.status} unchanged=${unchanged} noAudit=${noAudit}`);
      ok = ok && s.status === 409 && /legacy/i.test(String(s.body.error)) && /correction/i.test(String(s.body.error)) &&
        unchanged && after?.status !== "Paid" && !("paidAt" in after) && !("paidBy" in after) &&
        after?.vendorId === data.vendorId && noAudit;
    }
    record("11a legacy withdrawal with missing / blank / non-string / padded vendorId -> 409 'needs administrative correction'; document byte-for-byte unchanged, not Paid, no vendorId assigned, no settlement audit",
      ok, outcomes.join("; "));
    record("11b ...and the seller named by its vendorEmail keeps the same payable",
      (await payable(A)) === payableBefore, `payable ${payableBefore} -> ${await payable(A)}`);

    // A valid-vendorId settlement still works afterwards.
    const w = await requestAs(A, payableBefore);
    const s = await settle(w.body.withdrawalId);
    record("11c a valid-vendorId withdrawal still settles (200 Paid, one audit record)",
      w.status === 200 && s.status === 200 && s.body.status === "Paid" &&
        (await audits("withdrawal_settlement", w.body.withdrawalId)).length === 1,
      `request=${w.status} settle=${s.status} amount=${payableBefore}`);
  }

  // ============ 12. seller must be Approved at settlement ============
  {
    const { setSellerStatus } = await import("../seller-blocked-orders/sellers.mts");
    const audited = async (id: string) => (await audits("withdrawal_settlement", id)).length;

    // Requested while Approved, seller blocked before the admin pays.
    const w = await requestAs(B, 10);
    const id = w.body.withdrawalId as string;
    await setSellerStatus(db, B, "Blocked");
    const before = JSON.stringify(await wd(id));
    const blocked = await settle(id);
    record("12a seller blocked after requesting -> settle 409 'not currently approved'; withdrawal unchanged, not Paid, no audit",
      w.status === 200 && blocked.status === 409 && /not currently approved/i.test(String(blocked.body.error)) &&
        JSON.stringify(await wd(id)) === before && (await audited(id)) === 0,
      `request=${w.status} settle=${blocked.status} "${blocked.body.error ?? ""}"`);

    // Half-applied block: vendors Approved, storefront mirror still Blocked.
    await setSellerStatus(db, B, "Approved");
    await db.collection("vendors_public").doc(B).set({ uid: B, status: "Blocked" });
    const mirror = await settle(id);
    record("12b vendors Approved but vendors_public mirror Blocked -> 409, not Paid",
      mirror.status === 409 && (await wd(id))?.status === "Pending" && (await audited(id)) === 0, `settle=${mirror.status}`);

    // Pending / Rejected sellers are not Approved either.
    await db.collection("vendors_public").doc(B).delete();
    const notApproved: string[] = [];
    for (const status of ["Pending", "Rejected"]) {
      await setSellerStatus(db, B, status);
      notApproved.push(`${status}=${(await settle(id)).status}`);
    }
    record("12c Pending / Rejected seller -> 409, not Paid",
      notApproved.every((s) => s.endsWith("=409")) && (await wd(id))?.status === "Pending" && (await audited(id)) === 0,
      notApproved.join(" "));

    // Re-approved: the same withdrawal now settles normally.
    await setSellerStatus(db, B, "Approved");
    const ok = await settle(id);
    record("12d seller re-approved -> the same withdrawal settles (200 Paid, one audit record)",
      ok.status === 200 && ok.body.status === "Paid" && (await audited(id)) === 1, `settle=${ok.status}`);

    // A legitimate legacy seller whose only record is vendors/{uid} (no uid
    // field) — accepted by the order paths — is accepted here too.
    const C = "seller_wd_legacy_c";
    await db.collection("vendors").doc(C).set({ email: `${C}@example.com`, businessName: "Legacy C", status: "Approved" });
    await db.collection("orders").doc("wd_o3").set({
      userId: CUSTOMER, vendorIds: [C], items: [{ id: "p_wd_o3", vendorId: C, price: 100, qty: 1 }],
      total: 100, shippingCharge: 49, finalTotal: 149, deliveryCost: 49, freeDeliveryApplied: false,
      status: "Delivered", paymentStatus: "Paid", paymentMethod: "ONLINE",
    });
    await db.collection("sellerOrders").doc(`wd_o3_${C}`).set({ orderId: "wd_o3", vendorId: C, vendorSubtotal: 100, vendorCommission: 0, vendorEarning: 100, sellerDeliveryCharge: 0 });
    await db.collection("withdrawals").doc(`${C}_legacy1`).set({ vendorId: C, vendorEmail: `${C}@example.com`, payoutNumber: "PO-C", amount: 20, status: "Pending" });
    const legacy = await settle(`${C}_legacy1`);
    record("12e legacy vendors/{uid}-only Approved seller -> settles (200), same seller identity as the order paths",
      legacy.status === 200 && (await wd(`${C}_legacy1`))?.status === "Paid" && (await audited(`${C}_legacy1`)) === 1,
      `settle=${legacy.status} "${legacy.body.error ?? ""}"`);
    // ...and blocking that legacy record stops it.
    await db.collection("vendors").doc(C).update({ status: "Blocked" });
    await db.collection("withdrawals").doc(`${C}_legacy2`).set({ vendorId: C, vendorEmail: `${C}@example.com`, payoutNumber: "PO-C2", amount: 20, status: "Pending" });
    const legacyBlocked = await settle(`${C}_legacy2`);
    record("12f the same legacy seller once Blocked -> 409, not Paid",
      legacyBlocked.status === 409 && (await wd(`${C}_legacy2`))?.status === "Pending" && (await audited(`${C}_legacy2`)) === 0,
      `settle=${legacyBlocked.status}`);
  }

  // ============ 13. malformed withdrawal ids ============
  {
    const auditsBefore = (await db.collection("audit_logs").get()).size;
    const withdrawalsBefore = (await db.collection("withdrawals").get()).size;
    const cases: [string, unknown][] = [
      ["a/b", "a/b"], ["a/b/c", "a/b/c"], [`${A}/../x`, `${A}/../x`], ["/", "/"], ["trailing/", "x/"],
      [".", "."], ["..", ".."], ["__reserved__", "__x__"], ["600 chars", "w".repeat(600)],
      ["empty", ""], ["spaces", "   "], ["number", 123], ["null", null], ["object", { id: "x" }],
    ];
    const statuses: string[] = [];
    let allBadRequest = true;
    for (const [label, withdrawalId] of cases) {
      const res = await settleWithdrawal(post("http://localhost/api/settle-withdrawal", { withdrawalId }, ADMIN));
      statuses.push(`${label}=${res.status}`);
      if (res.status !== 400) allBadRequest = false;
    }
    const nullBody = await settleWithdrawal(post("http://localhost/api/settle-withdrawal", null, ADMIN));
    statuses.push(`nullBody=${nullBody.status}`);
    record("13 malformed withdrawal ids ('/', '.', '..', __x__, >512 chars, empty, non-string, null body) -> 400, never 500; nothing written",
      allBadRequest && nullBody.status === 400 &&
        (await db.collection("audit_logs").get()).size === auditsBefore &&
        (await db.collection("withdrawals").get()).size === withdrawalsBefore,
      statuses.join(" "));
  }
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
