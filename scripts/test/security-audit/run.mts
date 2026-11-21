/*
 * Security data-health audit (D1–D7) — emulator test.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * Initialises firebase-admin directly against the emulator; never reads a real
 * credential, never calls a real Google API (the IAM pre-flight is exercised
 * with stubbed fetch/credential only). Seeds every D1–D7 case (plus personal
 * data that must never be printed), then proves
 * scripts/test/security-audit/data-health-report.ts:
 *   - reports exactly the expected findings for D1–D7, incl. Paid-like statuses
 *     and a vendors/{uid} doc owned by another uid (not a conflict);
 *   - evaluates sellers exactly like lib/sellerApproval#findUnapprovedSellers;
 *   - labels every check COMPLETE / PARTIAL / NOT RUN from its own collections
 *     and withholds conclusions that rest on unread seller records;
 *   - paginates with a document-id cursor, bounds every scan, counts via
 *     aggregation; never lets a snapshot or document reference escape;
 *   - WRITES NOTHING (every collection and document updateTime, before/after);
 *   - prints per-run salted tokens only — no PII, no whole id, no salt;
 *   - refuses to proceed when the IAM pre-flight finds write permission or
 *     cannot complete; prints sanitized error codes only;
 *   - as a CLI, refuses every unsafe configuration (incl. duplicate flags).
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/security-audit/run.mts"
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const PROJECT_ID = "demo-yomico-test";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const SCRIPT = "scripts/test/security-audit/data-health-report.ts";

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore, FieldPath, Timestamp } = await import("firebase-admin/firestore");
const audit = await import("./data-health-report.ts");
const { findUnapprovedSellers } = await import("../../../lib/sellerApproval.ts");

const app = initializeApp({ projectId: PROJECT_ID }, "security-audit-test");
const db = getFirestore(app);
const ro = audit.readOnlyFirestore(db, FieldPath.documentId());
const SALT = crypto.randomBytes(32);
const tok = audit.makeTokenizer(SALT);

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const sameSet = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ---------------------------------------------------------------- seed ----
const U = (s: string) => `${s}_seller_uid_${s}`;
const S = {
  OK: U("alpha"), OK2: U("bravo"), BLOCKED: U("charl"), NOREC: U("delta"), DUP: U("echoo"),
  MIRROR: U("foxtr"), LEGACY: U("golfx"), LEGMIX: U("hotel"), MANY: U("india"), LOWER: U("julie"),
  NOSTATUS: U("kilox"), GHOST: U("limax"), PAD: U("mikex"), COLL: U("novem"), OTHER: U("oscar"),
};
const CUSTOMER = U("custo");
const PII = {
  sellerEmail: "seller.private@example.com", bank: "123456789012", pan: "ABCDE1234F", aadhaar: "999988887777",
  sellerPhone: "9876543210", shop: "Private Shop Name", customerName: "Private Customer Name",
  customerPhone: "9123456780", address: "42 Secret Lane, Hidden City", customerEmail: "customer.private@example.com",
};
const vendorPII = { email: PII.sellerEmail, bankAccountNumber: PII.bank, panNumber: PII.pan, aadhaarNumber: PII.aadhaar, businessPhone: PII.sellerPhone, businessName: PII.shop };

const COLLECTIONS = ["vendors", "vendors_public", "products", "withdrawals", "orders", "audit_ref_probe"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }

async function seed() {
  const v = (data: Record<string, unknown>) => db.collection("vendors").add({ ...vendorPII, kycStatus: "Approved", ...data });
  const pub = (uid: string, data: Record<string, unknown>) => db.collection("vendors_public").doc(uid).set({ businessName: PII.shop, ...data });
  await v({ uid: S.OK, status: "Approved", sellerNumber: "SEL0001" }); await pub(S.OK, { status: "Approved" });
  await v({ uid: S.OK2, status: "Approved" });
  await v({ uid: S.BLOCKED, status: "Blocked", sellerNumber: "SEL0002" }); await pub(S.BLOCKED, { status: "Blocked" });
  await v({ uid: S.DUP, status: "Approved" }); await v({ uid: S.DUP, status: "Pending" }); await pub(S.DUP, { status: "Approved" });
  await v({ uid: S.MIRROR, status: "Approved" }); await pub(S.MIRROR, { status: "Blocked" });
  await db.collection("vendors").doc(S.LEGACY).set({ ...vendorPII, status: "Approved" }); // legacy: no uid field
  await v({ uid: S.LEGMIX, status: "Approved" }); await db.collection("vendors").doc(S.LEGMIX).set({ ...vendorPII, status: "Blocked" });
  for (let i = 0; i < 26; i++) await v({ uid: S.MANY, status: "Approved" });
  await v({ uid: S.LOWER, status: "approved" });
  await v({ uid: S.NOSTATUS, status: "Approved" }); await pub(S.NOSTATUS, {});
  await pub(S.GHOST, { status: "Approved" });
  await v({ uid: ` ${S.PAD} `, status: "Pending" });
  await db.collection("vendors").doc("vendor_doc_uid_null_01").set({ ...vendorPII, uid: null, status: "Approved" });
  // L2: vendors/{COLL} exists but is OWNED by another uid (OTHER). Production
  // ignores it for COLL; it is OTHER's (only) record.
  await v({ uid: S.COLL, status: "Approved" });
  await db.collection("vendors").doc(S.COLL).set({ ...vendorPII, uid: S.OTHER, status: "Approved" });

  const p = (id: string, data: Record<string, unknown>) =>
    db.collection("products").doc(id).set({ title: "Item", price: 100, stock: 5, active: true, approvalStatus: "approved", ...data });
  await p("p_ok", { vendorId: S.OK, productNumber: "PCT0001" });
  await p("p_ok2", { vendorId: S.OK2 });
  await p("p_blocked", { vendorId: S.BLOCKED, productNumber: "PCT0002" });
  await p("p_hidden", { vendorId: S.BLOCKED, active: false });
  await p("p_norec", { vendorId: S.NOREC });
  await p("p_empty", { vendorId: "" });
  await p("p_nofield", {});
  await p("p_dup", { vendorId: S.DUP });
  await p("p_mirror", { vendorId: S.MIRROR });
  await p("p_legacy", { vendorId: S.LEGACY });
  await p("p_legacymix", { vendorId: S.LEGMIX });
  await p("p_many", { vendorId: S.MANY });
  await p("p_lower", { vendorId: S.LOWER });
  await p("p_padded_vid", { vendorId: ` ${S.OK} ` });
  await p("p_nostatus", { vendorId: S.NOSTATUS });
  await p("p_coll", { vendorId: S.COLL });

  const w = (id: string, data: Record<string, unknown>) =>
    db.collection("withdrawals").doc(id).set({ vendorEmail: PII.sellerEmail, vendorName: PII.shop, createdAt: Timestamp.now(), ...data });
  await w(`${S.OK}_k1`, { vendorId: S.OK, payoutNumber: "PAYOUT0001", amount: 100, status: "Pending" });
  await w("legacyrandom01", { amount: 10, status: "Approved" });
  await w(`${S.OK}_k5`, { vendorId: `${S.OK} `, payoutNumber: "PAYOUT0005", amount: 10, status: "Pending" });
  await w("legacyrandom02", { vendorId: 123, amount: 10, status: "Approved" });
  await w("legacyrandom03", { vendorId: "   ", amount: 10, status: "Pending" });
  await w(`${S.OK}_k2`, { vendorId: S.BLOCKED, payoutNumber: "PAYOUT0002", amount: 20, status: "Approved" });
  await w(`${S.OK}_k3`, { vendorId: S.OK, payoutNumber: "PAYOUT0003", amount: "50", status: "Pending" });
  await w(`${S.OK}_k4`, { vendorId: S.OK, payoutNumber: "PAYOUT0004", amount: 30 });
  await w(`${S.BLOCKED}_k1`, { vendorId: S.BLOCKED, payoutNumber: "PAYOUT0010", amount: 100, status: "Pending" });
  await w(`${S.BLOCKED}_k2`, { vendorId: S.BLOCKED, payoutNumber: "PAYOUT0011", amount: 100, status: "Rejected" });
  await w("legacyrandom04", { vendorId: S.LEGACY, amount: 10, status: "Approved" });
  await w("legacyrandom05", { amount: 70, status: "Paid", paidAt: Timestamp.now() });
  await w("legacyrandom06", { vendorId: S.OK, amount: 10, status: "approved" });
  await w(`${S.OK}_k6`, { vendorId: S.OK, payoutNumber: "PAYOUT0006", amount: 10, status: "Paid" });
  await w("legacyrandom07", { vendorId: S.OK, amount: 10, status: 3 });
  // L6: Paid-LIKE statuses — not "Paid", so never counted and not confirmed.
  await w("legacyrandom08", { vendorId: S.OK, amount: 40, status: "paid" });
  await w("legacyrandom09", { vendorId: S.OK, amount: 45, status: "Paid " });

  const o = (id: string, data: Record<string, unknown>) =>
    db.collection("orders").doc(id).set({
      userId: CUSTOMER, customerName: PII.customerName, phone: PII.customerPhone, address: PII.address,
      userEmail: PII.customerEmail, createdAt: Timestamp.now(), ...data,
    });
  await o(`${CUSTOMER}_flag`, { orderNumber: "ORD-1", needsReview: true, sellerNotApproved: [S.BLOCKED], paymentStatus: "Paid", paymentMethod: "ONLINE", finalTotal: 500, vendorIds: [S.BLOCKED] });
  await o(`${CUSTOMER}_stock`, { orderNumber: "ORD-2", needsReview: true, stockShortfall: [{ id: "p_ok", wanted: 2, available: 1 }], paymentStatus: "Paid", finalTotal: 200 });
  await o(`${CUSTOMER}_released`, { orderNumber: "ORD-3", needsReview: false, sellerNotApproved: [S.BLOCKED], reviewedAt: Timestamp.now(), paymentStatus: "Paid", finalTotal: 300 });
  await o(`${CUSTOMER}_clean`, { orderNumber: "ORD-4", paymentStatus: "Paid", finalTotal: 100 });

  // L1 probe: reference-typed values must never leave the wrapper.
  await db.collection("audit_ref_probe").doc("probe1").set({
    vendorId: db.doc("vendors/x"), nested: { r: db.doc("a/b"), n: 1 }, arr: [db.doc("a/c"), "plain"],
  });
}

async function snapshotAll(): Promise<string> {
  const cols = (await db.listCollections()).map((c) => c.id).sort();
  const out: string[] = [`collections=${cols.join(",")}`];
  for (const c of cols) {
    const snap = await db.collection(c).get();
    for (const d of snap.docs) out.push(`${c}/${d.id}@${d.updateTime.toMillis()}`);
  }
  return out.sort().join("\n");
}

// In-memory ReadOnlyFirestore for deterministic completeness tests (no Firestore).
function memoryDb(data: Record<string, { id: string; data: Record<string, unknown> }[]>): import("./data-health-report.ts").ReadOnlyFirestore {
  type St = { name: string; filters: [string, unknown][]; after: string | null; lim: number };
  const q = (st: St): import("./data-health-report.ts").ReadOnlyQuery => ({
    where: (f, _op, v) => q({ ...st, filters: [...st.filters, [f, v]] }),
    select: () => q(st),
    orderById: () => q(st),
    startAfter: (id) => q({ ...st, after: id }),
    limit: (n) => q({ ...st, lim: n }),
    get: async () => {
      const rows = (data[st.name] || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1))
        .filter((r) => st.filters.every(([f, v]) => r.data[f] === v))
        .filter((r) => st.after === null || r.id > st.after)
        .slice(0, st.lim);
      return { docs: rows.map((r) => ({ id: r.id, data: { ...r.data } })), cursor: rows.length ? rows[rows.length - 1].id : null };
    },
    count: async () => (data[st.name] || []).length,
  });
  return { collection: (name) => q({ name, filters: [], after: null, lim: 1e9 }) };
}

const stripVolatile = (r: any) => JSON.stringify({ ...r, generatedAt: 0, finishedAt: 0, coverage: r.coverage.map((c: any) => ({ ...c, pages: 0 })) });

try {
  await clearAll();
  await seed();
  const before = await snapshotAll();

  const report = await audit.runDataHealthReport(ro, { pageSize: 300, scanOrders: true, salt: SALT });
  const text = audit.formatDataHealthReport(report);
  const json = JSON.stringify(report);

  // ---------- D1 ----------
  const d1 = Object.fromEntries(report.d1.findings.map((f) => [f.product, f]));
  const expectD1: Record<string, string> = {
    p_blocked: "record-not-approved", p_hidden: "record-not-approved", p_norec: "no-seller-record",
    p_empty: "missing-vendor-id", p_nofield: "missing-vendor-id", p_dup: "record-not-approved",
    p_mirror: "mirror-not-approved", p_legacymix: "record-not-approved", p_many: "too-many-records",
    p_lower: "record-not-approved",
  };
  record("D1 exactly the refused products with the right reason (approved, legacy-only, padded-vendorId, mirror-without-status and other-uid-collision products not flagged)",
    sameSet(Object.keys(d1), Object.keys(expectD1)) && Object.entries(expectD1).every(([k, r]) => d1[k]?.reason === r),
    JSON.stringify(Object.fromEntries(Object.entries(d1).map(([k, f]) => [k, f.reason]))));
  record("D1 visibility split: 10 refused of 16, 9 otherwise visible",
    report.d1.refused === 10 && report.d1.totalProducts === 16 && report.d1.refusedVisible === 9 && d1.p_hidden?.visible === false && d1.p_blocked?.productNumber === "PCT0002",
    `refused=${report.d1.refused}/${report.d1.totalProducts} visible=${report.d1.refusedVisible}`);

  // ---------- parity with production ----------
  const fullIndex = audit.buildSellerIndex(
    (await db.collection("vendors").get()).docs.map((d) => ({ id: d.id, data: d.data() })),
    (await db.collection("vendors_public").get()).docs.map((d) => ({ id: d.id, data: d.data() }))
  );
  const parityUids = [...Object.values(S), ""];
  const parity: string[] = [];
  for (const uid of parityUids) {
    const prod = (await findUnapprovedSellers(db, [uid])).length === 0;
    const mine = audit.evaluateSeller(fullIndex, uid.trim()).approved;
    if (prod !== mine) parity.push(`${uid || "(empty)"}: prod=${prod} audit=${mine}`);
  }
  record(`seller verdicts match lib/sellerApproval#findUnapprovedSellers for all ${parityUids.length} seeded sellers (incl. the other-uid collision)`,
    parity.length === 0, parity.join("; ") || "all equal");

  // ---------- D2 ----------
  const d2 = Object.fromEntries(report.d2.findings.map((f) => [f.seller, f.flags]));
  const has = (uid: string, ...flags: string[]) => flags.every((fl) => (d2[tok(uid)] || []).some((x) => x.startsWith(fl)));
  record("D2 duplicates / mixed / over-limit / unknown status / legacy-alongside / untrimmed uid flagged; single Blocked seller not flagged",
    has(S.DUP, "duplicate-records", "mixed-statuses", "fails-approval:record-not-approved") &&
      has(S.MANY, "duplicate-records", "over-record-limit", "fails-approval:too-many-records") &&
      has(S.LOWER, "unknown-status") && has(S.LEGMIX, "legacy-doc-alongside-uid-records") &&
      has(` ${S.PAD} `, "uid-not-trimmed") && !(tok(S.BLOCKED) in d2) && !(tok(S.OK) in d2),
    JSON.stringify(d2));
  record("D2 (L2) vendors/{uid} owned by ANOTHER uid: reported as an ignored id collision, NOT as a legacy conflict; its owner is not flagged",
    has(S.COLL, "doc-id-collides-with-another-uid") && !has(S.COLL, "legacy-doc-alongside-uid-records") && !(tok(S.OTHER) in d2),
    JSON.stringify(d2[tok(S.COLL)]));
  const noUid = report.d2.recordsWithoutUid;
  record("D2 records without a uid: two legacy vendors/{uid} docs (usable) and one uid:null doc (unusable)",
    noUid.length === 3 && noUid.filter((r) => r.usableAsLegacy).length === 2 && noUid.filter((r) => !r.usableAsLegacy).length === 1,
    JSON.stringify(noUid));

  // ---------- D3 ----------
  const d3 = Object.fromEntries(report.d3.findings.map((f) => [f.seller, f.issue]));
  const info = "approved-without-mirror (informational)";
  const expectD3: Record<string, string> = {
    [tok(S.MIRROR)]: "status-mismatch", [tok(S.GHOST)]: "mirror-without-seller-record",
    [tok(S.NOSTATUS)]: "mirror-without-status", [tok(S.DUP)]: "authoritative-records-disagree",
    [tok(S.OK2)]: info, [tok(S.MANY)]: info, [tok(S.COLL)]: info, [tok(S.OTHER)]: info,
  };
  record("D3 mirror mismatches exactly as seeded (matching mirrors for OK / BLOCKED not flagged)",
    sameSet(Object.keys(d3), Object.keys(expectD3)) && Object.entries(expectD3).every(([k, v]) => d3[k] === v),
    JSON.stringify(d3));

  // ---------- D4 ----------
  const d4 = Object.fromEntries(report.d4.findings.map((f) => [f.withdrawal, f.issues.join(",")]));
  const expectD4: Record<string, string> = {
    [tok("legacyrandom01")]: "vendorId-missing", [tok(`${S.OK}_k5`)]: "vendorId-padded",
    [tok("legacyrandom02")]: "vendorId-not-a-string", [tok("legacyrandom03")]: "vendorId-blank",
    [tok(`${S.OK}_k2`)]: "identity-mismatch (id vs vendorId)", [tok(`${S.OK}_k3`)]: "amount-not-a-positive-whole-number",
  };
  record("D4 open withdrawals settlement would refuse: missing / padded / non-string / blank vendorId, identity mismatch, string amount",
    sameSet(Object.keys(d4), Object.keys(expectD4)) && Object.entries(expectD4).every(([k, v]) => d4[k] === v) && report.d4.openChecked === 10,
    `openChecked=${report.d4.openChecked} ${JSON.stringify(d4)}`);
  record("D4 Paid row without vendorId reported as never counted against a payable",
    report.d4.paidUncounted.length === 1 && report.d4.paidUncounted[0].withdrawal === tok("legacyrandom05") && /vendorId-missing/.test(report.d4.paidUncounted[0].issue),
    JSON.stringify(report.d4.paidUncounted));
  const pl = report.d4.paidLikeAnomalies;
  record("D4 (L6) Paid-LIKE statuses \"paid\" and \"Paid \" flagged as anomalies, explicitly NOT confirmed payments; exact \"Paid\" rows not included",
    sameSet(pl.map((f) => f.withdrawal), [tok("legacyrandom08"), tok("legacyrandom09")]) &&
      pl.every((f) => /NOT a confirmed payment/.test(f.note)) &&
      sameSet(pl.map((f) => f.status), [JSON.stringify("paid"), JSON.stringify("Paid ")]) &&
      !pl.some((f) => f.withdrawal === tok(`${S.OK}_k6`) || f.withdrawal === tok("legacyrandom05")) &&
      /Paid-LIKE status anomalies \(not confirmed payments\): 2/.test(text) && !/PAID-LIKE[^\n]*\bwas paid\b/i.test(text),
    JSON.stringify(pl.map((f) => [f.withdrawal, f.status])));

  // ---------- D5 ----------
  const d5 = report.d5.findings.map((f) => `${f.withdrawal}|${f.issue.split(" ")[0]}`);
  record("D5 lowercase 'approved', 'paid', 'Paid ', missing status, numeric status and Paid-without-paidAt flagged",
    sameSet(d5, [
      `${tok("legacyrandom06")}|unexpected-status`, `${tok(`${S.OK}_k4`)}|status-missing`,
      `${tok("legacyrandom07")}|status-not-a-string`, `${tok(`${S.OK}_k6`)}|paid-without-paidAt`,
      `${tok("legacyrandom08")}|unexpected-status`, `${tok("legacyrandom09")}|unexpected-status`,
    ]),
    JSON.stringify(d5));

  // ---------- D6 ----------
  const d6 = Object.fromEntries(report.d6.findings.map((f) => [f.withdrawal, f.reason]));
  record("D6 open withdrawals of a not-Approved seller (Blocked); Rejected ignored; legacy-Approved seller not flagged",
    sameSet(Object.keys(d6), [tok(`${S.OK}_k2`), tok(`${S.BLOCKED}_k1`)]) && Object.values(d6).every((r) => r === "record-not-approved"),
    JSON.stringify(d6));

  // ---------- D7 ----------
  record("D7 open needsReview orders: 2 (sellerNotApproved 1, stockShortfall 1); the flagged one listed by order number",
    report.d7.openNeedsReview === 2 && report.d7.openByReason.sellerNotApproved === 1 && report.d7.openByReason.stockShortfall === 1 &&
      report.d7.openSellerNotApproved.length === 1 && report.d7.openSellerNotApproved[0].orderNumber === "ORD-1" &&
      report.d7.openSellerNotApproved[0].sellers[0] === tok(S.BLOCKED),
    JSON.stringify(report.d7.openByReason));
  record("D7 --scan-orders finds the flagged order already released by 'Mark as reviewed'",
    report.d7.releasedSellerNotApproved?.length === 1 && report.d7.releasedSellerNotApproved[0].orderNumber === "ORD-3",
    JSON.stringify(report.d7.releasedSellerNotApproved));

  // ---------- M1: per-check completeness ----------
  const statuses = (r: any) => Object.fromEntries(Object.entries(r.sections).map(([k, s]: any) => [k, s.status]));
  record("M1 full run: every check COMPLETE (incl. D7-released with --scan-orders), nothing withheld, global COMPLETE",
    report.complete && Object.values(report.sections).every((s) => s.status === "COMPLETE" && s.suppressed === 0) &&
      /D1 \[COMPLETE\]/.test(text) && /D7-released \[COMPLETE\]/.test(text),
    JSON.stringify(statuses(report)));
  const noScan = await audit.runDataHealthReport(ro, { pageSize: 300, salt: SALT });
  const noScanText = audit.formatDataHealthReport(noScan);
  record("M1 without --scan-orders: D7-released is NOT RUN (no full orders scan), other checks COMPLETE",
    noScan.d7.releasedSellerNotApproved === null && noScan.sections.d7Released.status === "NOT RUN" && noScan.sections.d7.status === "COMPLETE" &&
      !noScan.coverage.some((c) => c.collection === "orders(full)") && /D7-released \[NOT RUN\][^\n]*not checked/.test(noScanText),
    JSON.stringify(statuses(noScan)));
  const capped = await audit.runDataHealthReport(ro, { pageSize: 5, maxDocs: 7, salt: SALT });
  const cappedText = audit.formatDataHealthReport(capped);
  record("M1 capped (--max-docs 7): D1/D2/D3/D4/D5/D6 PARTIAL naming the unread collections, D7 COMPLETE, D7-released NOT RUN, global INCOMPLETE",
    !capped.complete &&
      capped.sections.d1.status === "PARTIAL" && capped.sections.d1.incomplete.includes("vendors") && capped.sections.d1.incomplete.includes("products") &&
      capped.sections.d2.status === "PARTIAL" && capped.sections.d3.status === "PARTIAL" &&
      capped.sections.d4.status === "PARTIAL" && capped.sections.d5.status === "PARTIAL" && capped.sections.d6.status === "PARTIAL" &&
      capped.sections.d7.status === "COMPLETE" && capped.sections.d7Released.status === "NOT RUN" &&
      /D1 \[PARTIAL: vendors, products not fully read/.test(cappedText) && /INCOMPLETE/.test(cappedText),
    JSON.stringify(statuses(capped)));
  record("M1 capped: no conclusion rests on an unread seller record (no 'no-seller-record' in D1/D6, no 'mirror-without-seller-record' / 'approved-without-mirror' in D3)",
    !capped.d1.findings.some((f) => f.reason === "no-seller-record") && !capped.d6.findings.some((f) => f.reason === "no-seller-record") &&
      !capped.d3.findings.some((f) => /mirror-without-seller-record|approved-without-mirror/.test(f.issue)),
    `withheld d1=${capped.sections.d1.suppressed} d3=${capped.sections.d3.suppressed} d6=${capped.sections.d6.suppressed}`);
  const releasedPartial = await audit.runDataHealthReport(ro, { pageSize: 2, maxDocs: 3, scanOrders: true, salt: SALT });
  record("M1 --scan-orders with the full orders scan capped (3 of 4): D7-released PARTIAL, open-review D7 still COMPLETE",
    releasedPartial.sections.d7Released.status === "PARTIAL" && releasedPartial.sections.d7.status === "COMPLETE" &&
      /D7-released \[PARTIAL: orders\(full\) not fully read/.test(audit.formatDataHealthReport(releasedPartial)),
    JSON.stringify({ d7: releasedPartial.sections.d7, released: releasedPartial.sections.d7Released }));

  // Deterministic suppression (in-memory read-only db): 3 vendors, cap 2.
  const mem = memoryDb({
    vendors: [
      { id: "v1", data: { uid: "seller_aaaa_00000001", status: "Approved" } },
      { id: "v2", data: { uid: "seller_bbbb_00000002", status: "Blocked" } },
      { id: "v3", data: { uid: "seller_cccc_00000003", status: "Blocked" } }, // unread at cap 2
    ],
    vendors_public: [{ id: "seller_zzzz_00000009", data: { status: "Approved" } }],
    // Exactly 2 products, so a cap of 2 reads them all; only vendors is partial.
    products: [
      { id: "p1", data: { vendorId: "seller_cccc_00000003" } }, // its seller record is the unread v3
      { id: "p2", data: { vendorId: "seller_bbbb_00000002" } }, // its seller record (Blocked) was read
    ],
    withdrawals: [{ id: "seller_cccc_00000003_k", data: { vendorId: "seller_cccc_00000003", payoutNumber: "PO1", amount: 5, status: "Pending" } }],
    orders: [],
  });
  const memPartial = await audit.runDataHealthReport(mem, { pageSize: 1, maxDocs: 2, salt: SALT });
  const memFull = await audit.runDataHealthReport(mem, { pageSize: 1, maxDocs: 10, salt: SALT });
  record("M1 deterministic: with vendors capped, the unread Blocked seller's product/withdrawal are WITHHELD (counted, not reported as 'no record'); the conclusive Blocked finding is kept",
    memPartial.sections.d1.status === "PARTIAL" && memPartial.sections.d1.suppressedReasons["no-seller-record"] >= 1 &&
      !memPartial.d1.findings.some((f) => f.reason === "no-seller-record") &&
      memPartial.d1.findings.some((f) => f.product === "p2" && f.reason === "record-not-approved") &&
      memPartial.coverage.find((c) => c.collection === "products")?.complete === true &&
      memPartial.sections.d6.suppressed === 1 && memPartial.d6.findings.length === 0 &&
      memPartial.sections.d3.suppressedReasons["mirror-without-seller-record"] === 1,
    JSON.stringify({ d1: memPartial.sections.d1, d6: memPartial.sections.d6, d3: memPartial.sections.d3 }));
  record("M1 deterministic: the same data fully read reports the Blocked seller conclusively (p1 + its withdrawal) and nothing withheld",
    memFull.complete && memFull.d1.findings.some((f) => f.product === "p1" && f.reason === "record-not-approved") &&
      memFull.d6.findings.length === 1 && Object.values(memFull.sections).every((s) => s.suppressed === 0),
    JSON.stringify(memFull.d1.findings.map((f) => [f.product, f.reason])));

  // ---------- pagination / bounds / count-only ----------
  const paged = await audit.runDataHealthReport(ro, { pageSize: 2, scanOrders: true, salt: SALT });
  const pagesUsed = paged.coverage.find((c) => c.collection === "vendors")?.pages ?? 0;
  record("pagination: page size 2 gives the identical report to page size 300 (document-id cursor across many pages)",
    stripVolatile(paged) === stripVolatile(report) && pagesUsed > 10 && paged.complete === true, `vendor pages=${pagesUsed}`);
  const capped7 = capped.coverage;
  record("bounds: --max-docs 7 reads at most 7 per collection",
    capped7.every((c) => c.scanned <= 7) && capped7.find((c) => c.collection === "vendors")?.scanned === 7,
    JSON.stringify(capped7.map((c) => `${c.collection}:${c.scanned}:${c.complete}`)));
  const exact = await audit.scanCollection(ro, "products", ["vendorId"], { pageSize: 4, maxDocs: 16 });
  record("bounds: a cap exactly equal to the collection size (16 products) is complete, not INCOMPLETE",
    exact.docs.length === 16 && exact.complete === true, `scanned=${exact.docs.length} complete=${exact.complete}`);
  const counts = await audit.runCountOnly(ro);
  record("--count-only: aggregation counts match the seeded collections",
    counts.products === 16 && counts.withdrawals === 17 && counts.orders === 4 && counts["orders(needsReview==true)"] === 2 && counts.vendors_public === 6 && counts.vendors === 41,
    JSON.stringify(counts));

  // ---------- L1: nothing live leaves the wrapper ----------
  const page = await ro.collection("products").select("vendorId").orderById().limit(3).get();
  const probe = await audit.scanCollection(ro, "audit_ref_probe", ["vendorId", "nested", "arr"], { pageSize: 10, maxDocs: 10 });
  const pd = probe.docs[0]?.data as any;
  const hasLive = (v: unknown): boolean => {
    if (!v || typeof v !== "object") return false;
    if ("firestore" in (v as object) || typeof (v as any).ref === "object" || typeof (v as any).delete === "function") return true;
    return Object.values(v as object).some(hasLive);
  };
  record("L1 cursor is a document-id string; page exposes only {docs, cursor}; reference values replaced inside the wrapper",
    typeof page.cursor === "string" && page.cursor === page.docs[page.docs.length - 1].id &&
      Object.keys(page).sort().join(",") === "cursor,docs" &&
      pd?.vendorId === "[reference]" && pd?.nested?.r === "[reference]" && pd?.nested?.n === 1 && pd?.arr?.[0] === "[reference]" && pd?.arr?.[1] === "plain" &&
      !hasLive(page) && !hasLive(probe.docs) && !hasLive(report),
    `cursor=${typeof page.cursor} probe=${JSON.stringify(pd)}`);

  // ---------- L3 / privacy ----------
  const leakedPII = Object.entries(PII).filter(([, v]) => text.includes(v) || json.includes(v)).map(([k]) => k);
  const rawIds = [...Object.values(S), CUSTOMER, "legacyrandom01", "legacyrandom05", `${S.OK}_k1`, `${CUSTOMER}_flag`].filter((u) => text.includes(u) || json.includes(u));
  const projectedOut = ["customerName", "userEmail", "address", "bankAccountNumber", "panNumber", "aadhaarNumber", "vendorEmail", "vendorName", "businessPhone"]
    .filter((f) => json.includes(`"${f}"`));
  record("privacy: no seeded PII, no raw uid / withdrawal id / order id, no personal field names in text or JSON",
    leakedPII.length === 0 && rawIds.length === 0 && projectedOut.length === 0,
    `pii=${leakedPII.join(",") || "none"} rawIds=${rawIds.length} fields=${projectedOut.join(",") || "none"}`);
  const tokens = json.match(/#[0-9a-f]{10}\b/g) || [];
  const blockedTok = tok(S.BLOCKED);
  const other = audit.makeTokenizer(crypto.randomBytes(32));
  record("L3 tokens: HMAC '#'+10 hex; same seller -> same token across D1/D6/D7; different salt -> different token; the salt never appears",
    tokens.length > 20 && d1.p_blocked?.seller === blockedTok && report.d6.findings.some((f) => f.seller === blockedTok) &&
      report.d7.openSellerNotApproved[0].sellers[0] === blockedTok && other(S.BLOCKED) !== blockedTok &&
      !text.includes(SALT.toString("hex")) && !json.includes(SALT.toString("hex")) && !json.includes(SALT.toString("base64")) && !/salt/i.test(json),
    `tokens=${tokens.length} blocked=${blockedTok}`);
  const r1 = await audit.runDataHealthReport(ro, { pageSize: 300 });
  const r2 = await audit.runDataHealthReport(ro, { pageSize: 300 });
  record("L3 default (CLI) salt is fresh per run: two runs give different tokens for the same seller",
    r1.d1.findings.find((f) => f.product === "p_blocked")?.seller !== r2.d1.findings.find((f) => f.product === "p_blocked")?.seller, "");

  // ---------- read-only source & surface ----------
  const src = fs.readFileSync(path.join(HERE, "data-health-report.ts"), "utf8");
  const forbidden = [/\.set\(/, /\.update\(/, /\.delete\(/, /\.add\(/, /\.create\(/, /\.batch\(/, /runTransaction/, /bulkWriter/i, /recursiveDelete/];
  const hits = forbidden.filter((re) => re.test(src)).map(String);
  record("read-only source: no set/update/delete/add/create/batch/transaction/bulkWriter/recursiveDelete call", hits.length === 0, hits.join(" ") || "none");
  const roKeys = Object.keys(ro.collection("products")).sort().join(",");
  record("read-only surface: the wrapper exposes only count,get,limit,orderById,select,startAfter,where",
    roKeys === "count,get,limit,orderById,select,startAfter,where" && Object.keys(ro).join(",") === "collection", roKeys);

  // ---------- M2: IAM pre-flight (stubbed — no network) ----------
  const TOKEN = "stub-token-NEVER-PRINT-1234567890";
  type Call = { url: string; init: any };
  const stubFetch = (respond: () => Promise<any>) => {
    const calls: Call[] = [];
    const f = async (url: string, init: any) => { calls.push({ url, init }); return respond(); };
    return { f, calls };
  };
  const okJson = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });
  const pre = (respond: () => Promise<any>, token: () => Promise<string> = async () => TOKEN) => {
    const s = stubFetch(respond);
    return audit.iamWritePreflight("yogi-mart", token, s.f, 1000).then((r) => ({ r, calls: s.calls }));
  };
  const granted = await pre(okJson({ permissions: ["datastore.entities.create"] }));
  const grantedAll = await pre(okJson({ permissions: ["datastore.entities.create", "datastore.entities.update", "datastore.entities.delete"] }));
  const denied = await pre(okJson({}));
  const deniedEmpty = await pre(okJson({ permissions: [] }));
  const http403 = await pre(async () => ({ ok: false, status: 403, json: async () => ({ error: "x" }) }));
  const http500 = await pre(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  const netErr = await pre(async () => { throw new Error(`connect ECONNREFUSED ${TOKEN}`); });
  const badJson = await pre(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }));
  const arrBody = await pre(okJson([]));
  const weird = await pre(okJson({ permissions: ["resourcemanager.projects.get"] }));
  const notArr = await pre(okJson({ permissions: "datastore.entities.create" }));
  const tokErr = await pre(okJson({}), async () => { throw new Error("no creds"); });
  const tokEmpty = await pre(okJson({}), async () => "");
  const refusedAll = [granted, grantedAll, http403, http500, netErr, badJson, arrBody, weird, notArr, tokErr, tokEmpty].every((x) => !x.r.ok);
  record("M2 pre-flight REFUSES: write permission granted (one or all), HTTP 403/500, network error, unreadable/array/unexpected/non-array body, token failure or empty token",
    refusedAll && !granted.r.ok && /WRITE permission\(s\): datastore\.entities\.create/.test((granted.r as any).reason),
    [granted, grantedAll, http403, http500, netErr, badJson, arrBody, weird, notArr, tokErr, tokEmpty].map((x) => (x.r.ok ? "OK" : "refused")).join(","));
  record("M2 pre-flight PASSES only when no write permission is held (permissions omitted or empty)",
    denied.r.ok === true && deniedEmpty.r.ok === true, `${JSON.stringify(denied.r)} ${JSON.stringify(deniedEmpty.r)}`);
  const c0 = denied.calls[0];
  record("M2 request: POST cloudresourcemanager v1 projects/yogi-mart:testIamPermissions for exactly create/update/delete, Bearer token, timeout signal",
    denied.calls.length === 1 && c0.url === "https://cloudresourcemanager.googleapis.com/v1/projects/yogi-mart:testIamPermissions" &&
      c0.init.method === "POST" && c0.init.headers.Authorization === `Bearer ${TOKEN}` && !!c0.init.signal &&
      JSON.stringify(JSON.parse(c0.init.body).permissions) === JSON.stringify(["datastore.entities.create", "datastore.entities.update", "datastore.entities.delete"]) &&
      tokErr.calls.length === 0,
    c0 ? `${c0.init.method} ${c0.url}` : "no call");
  const reasons = [granted, http403, netErr, badJson, weird, tokErr].map((x) => (x.r as any).reason as string);
  record("M2 refusal reasons never contain the access token or a raw upstream message", reasons.every((m) => !m.includes(TOKEN) && !m.includes("ECONNREFUSED")), reasons.join(" | "));

  // ---------- CLI as a function (stubbed credential/IAM; emulator-backed db) ----------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yomico-audit-test-"));
  const fakeKey = (project: string) => {
    const f = path.join(tmp, `${project}.json`);
    fs.writeFileSync(f, JSON.stringify({ type: "service_account", project_id: project, private_key: "not-a-key", client_email: "x@example.com" }));
    return f;
  };
  const otherKey = fakeKey("demo-not-yogi");
  const matchingKey = fakeKey("yogi-mart"); // in-process only — never handed to a child process
  const cliRun = async (argv: string[], env: Record<string, string | undefined>, respond: () => Promise<any>, openDb?: () => Promise<any>) => {
    const out: string[] = []; const err: string[] = [];
    const s = stubFetch(respond);
    let opened = 0; let credCalls = 0;
    const code = await audit.runCli(argv, env, {
      credential: async () => { credCalls++; return { getAccessToken: async () => ({ access_token: TOKEN }) }; },
      fetch: s.f as any,
      openDb: async () => { opened++; return openDb ? openDb() : ro; },
      out: (l) => out.push(l), err: (l) => err.push(l),
    });
    return { code, out: out.join("\n"), err: err.join("\n"), opened, credCalls, fetchCalls: s.calls.length };
  };
  const prodEnv = { ALLOW_PRODUCTION: "yes", GOOGLE_APPLICATION_CREDENTIALS: matchingKey };
  const cGranted = await cliRun(["--project", "yogi-mart"], prodEnv, okJson({ permissions: ["datastore.entities.update"] }));
  const cFail = await cliRun(["--project", "yogi-mart", "--count-only"], prodEnv, async () => { throw new Error("offline"); });
  const cHttp = await cliRun(["--project", "yogi-mart"], prodEnv, async () => ({ ok: false, status: 403, json: async () => ({}) }));
  record("M2 CLI: write permission granted / pre-flight failure / HTTP 403 -> exit 2 REFUSING, Firestore NEVER opened",
    [cGranted, cFail, cHttp].every((c) => c.code === 2 && c.opened === 0 && /REFUSING TO RUN: IAM pre-flight/.test(c.err) && !c.err.includes(TOKEN) && c.out === ""),
    [cGranted, cFail, cHttp].map((c) => `exit=${c.code} opened=${c.opened}`).join("; "));
  const cOk = await cliRun(["--project", "yogi-mart", "--count-only"], prodEnv, okJson({}));
  record("M2 CLI: pre-flight passed -> Firestore opened (here: the EMULATOR via a stub) and the read-only run completes; banner states the pre-flight passed",
    cOk.code === 0 && cOk.opened === 1 && cOk.fetchCalls === 1 && /IAM pre-flight passed: no Firestore write permission/.test(cOk.err) && /products: 16/.test(cOk.out),
    `exit=${cOk.code} opened=${cOk.opened} ${cOk.err.split("\n")[0]}`);
  const cEmu = await cliRun(["--project", PROJECT_ID, "--count-only"], { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST }, async () => { throw new Error("must not be called"); });
  record("M2 CLI emulator mode: no credential, no IAM call", cEmu.code === 0 && cEmu.credCalls === 0 && cEmu.fetchCalls === 0, `exit=${cEmu.code} cred=${cEmu.credCalls} fetch=${cEmu.fetchCalls}`);

  // ---------- L5: sanitized errors ----------
  const secretPath = `projects/yogi-mart/databases/(default)/documents/withdrawals/${S.OK}_k1`;
  const throwingDb = () => Promise.resolve(memoryDbThrow(Object.assign(new Error(`5 NOT_FOUND: ${secretPath}`), { code: 5 })));
  function memoryDbThrow(e: Error): any {
    const q: any = { where: () => q, select: () => q, orderById: () => q, startAfter: () => q, limit: () => q, get: async () => { throw e; }, count: async () => { throw e; } };
    return { collection: () => q };
  }
  const cErr = await cliRun(["--project", PROJECT_ID], { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST }, okJson({}), throwingDb);
  const cErr2 = await cliRun(["--project", PROJECT_ID], { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST }, okJson({}),
    () => Promise.resolve(memoryDbThrow(Object.assign(new Error(`boom ${secretPath}`), { code: `bad code with ${S.OK}` }))));
  record("L5 errors: exit 1 with a sanitized code only (code=5 / code=unknown); no message, document path or uid printed",
    cErr.code === 1 && /code=5\)/.test(cErr.err) && cErr2.code === 1 && /code=unknown\)/.test(cErr2.err) &&
      ![cErr.err, cErr2.err].some((e) => e.includes("documents/") || e.includes(S.OK) || e.includes("NOT_FOUND")),
    `${cErr.err} | ${cErr2.err}`);

  // ---------- CLI guards (pure) ----------
  const emu = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
  const prod = (extra: Record<string, string>) => ({ ALLOW_PRODUCTION: "yes", ...extra });
  const refusals: [string, string[], Record<string, string | undefined>][] = [
    ["no emulator, no ALLOW_PRODUCTION", ["--project", "yogi-mart"], {}],
    ["ALLOW_PRODUCTION=no", ["--project", "yogi-mart"], { ALLOW_PRODUCTION: "no" }],
    ["missing --project", [], prod({ GOOGLE_APPLICATION_CREDENTIALS: matchingKey })],
    ["wrong production project", ["--project", "other-project"], prod({ GOOGLE_APPLICATION_CREDENTIALS: otherKey })],
    ["no read-only credential", ["--project", "yogi-mart"], prod({})],
    ["credential project mismatch", ["--project", "yogi-mart"], prod({ GOOGLE_APPLICATION_CREDENTIALS: otherKey })],
    ["unreadable credential", ["--project", "yogi-mart"], prod({ GOOGLE_APPLICATION_CREDENTIALS: path.join(tmp, "missing.json") })],
    ["emulator AND ALLOW_PRODUCTION", ["--project", "demo-yomico-test"], { ...emu, ALLOW_PRODUCTION: "yes" }],
    ["emulator with a non-demo project", ["--project", "yogi-mart"], emu],
    ["unknown argument", ["--project", "demo-yomico-test", "--fix"], emu],
    ["write-sounding argument", ["--project", "demo-yomico-test", "--write"], emu],
    ["--max-docs 0", ["--project", "demo-yomico-test", "--max-docs", "0"], emu],
    ["--max-docs too large", ["--project", "demo-yomico-test", "--max-docs", "999999"], emu],
    ["--page-size not a number", ["--project", "demo-yomico-test", "--page-size", "abc"], emu],
    ["--project without value", ["--project"], emu],
    ["L4 duplicate --project", ["--project", "demo-yomico-test", "--project", "yogi-mart"], emu],
    ["L4 duplicate --project (production)", ["--project", "yogi-mart", "--project", "yogi-mart"], prod({ GOOGLE_APPLICATION_CREDENTIALS: matchingKey })],
    ["L4 duplicate flag --json", ["--project", "demo-yomico-test", "--json", "--json"], emu],
    ["L4 duplicate --max-docs", ["--project", "demo-yomico-test", "--max-docs", "5", "--max-docs", "50000"], emu],
  ];
  const notRefused = refusals.filter(([, argv, env]) => !("refuse" in audit.parseCli(argv, env))).map(([n]) => n);
  const dupMsg = audit.parseCli(["--project", "demo-yomico-test", "--json", "--json"], emu) as any;
  record(`CLI guard (pure): all ${refusals.length} unsafe configurations refused (incl. 4 duplicate-flag cases)`,
    notRefused.length === 0 && /given more than once/.test(dupMsg.refuse), notRefused.join("; ") || "all refused");
  const okCfg = audit.parseCli(["--project", "yogi-mart", "--count-only"], prod({ GOOGLE_APPLICATION_CREDENTIALS: matchingKey }));
  const okEmu = audit.parseCli(["--project", "demo-yomico-test", "--json", "--max-docs", "500"], emu);
  record("CLI guard (pure): only ALLOW_PRODUCTION=yes + --project yogi-mart + a yogi-mart key file passes parsing (then the IAM pre-flight still applies)",
    !("refuse" in okCfg) && okCfg.mode === "production" && !("refuse" in okEmu) && okEmu.mode === "emulator" && okEmu.maxDocs === 500,
    `${JSON.stringify(okCfg)}`);

  // ---------- CLI (process): refusals only; never a production-capable child ----------
  const tsxCli = path.join(REPO, "node_modules/tsx/dist/cli.mjs");
  const baseEnv = { ...process.env };
  for (const k of ["FIRESTORE_EMULATOR_HOST", "ALLOW_PRODUCTION", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_KEY"]) delete baseEnv[k];
  const runChild = (argv: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [tsxCli, SCRIPT, ...argv], { cwd: REPO, env: { ...baseEnv, ...env }, encoding: "utf8", timeout: 120000 });
  const procCases: [string, string[], Record<string, string>][] = [
    ["no emulator, no ALLOW_PRODUCTION", ["--project", "yogi-mart"], {}],
    ["ALLOW_PRODUCTION without a credential", ["--project", "yogi-mart"], { ALLOW_PRODUCTION: "yes" }],
    ["ALLOW_PRODUCTION with a mismatching credential", ["--project", "yogi-mart"], { ALLOW_PRODUCTION: "yes", GOOGLE_APPLICATION_CREDENTIALS: otherKey }],
    ["unknown argument", ["--project", "demo-yomico-test", "--fix"], { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST! }],
    ["duplicate flag", ["--project", "demo-yomico-test", "--json", "--json"], { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST! }],
  ];
  const procBad: string[] = [];
  for (const [name, argv, env] of procCases) {
    const r = runChild(argv, env);
    if (r.status !== 2 || !/REFUSING TO RUN/.test(r.stderr) || /READ-ONLY data-health audit/.test(r.stderr)) procBad.push(`${name}: exit=${r.status}`);
  }
  record("CLI (process): unsafe configurations exit 2 with REFUSING TO RUN before any Firebase initialisation", procBad.length === 0, procBad.join("; ") || "all refused");
  const emuEnv = { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST! };
  const live = runChild(["--project", PROJECT_ID, "--scan-orders"], emuEnv);
  const liveJson = runChild(["--project", PROJECT_ID, "--json"], emuEnv);
  const liveCount = runChild(["--project", PROJECT_ID, "--count-only"], emuEnv);
  const liveLeak = Object.values(PII).some((v) => live.stdout.includes(v) || liveJson.stdout.includes(v)) || live.stdout.includes(S.BLOCKED);
  record("CLI (process) under the emulator: READ-ONLY banner, per-check labels, text/--json/--count-only exit 0, no PII or raw uid",
    live.status === 0 && /READ-ONLY data-health audit — project demo-yomico-test \(emulator\)/.test(live.stderr) &&
      /D1 \[COMPLETE\] products refused by seller approval: 10 of 16 scanned/.test(live.stdout) && /D7-released \[COMPLETE\][^\n]*: 1/.test(live.stdout) &&
      liveJson.status === 0 && JSON.parse(liveJson.stdout).readOnly === true && JSON.parse(liveJson.stdout).sections.d7Released.status === "NOT RUN" &&
      liveCount.status === 0 && /products: 16/.test(liveCount.stdout) && !liveLeak,
    `exit=${live.status}/${liveJson.status}/${liveCount.status} leak=${liveLeak}`);
  fs.rmSync(tmp, { recursive: true, force: true });

  // ---------- nothing written ----------
  const after = await snapshotAll();
  record("no writes: every collection and every document updateTime identical after all report and CLI runs",
    before === after, before === after ? `${before.split("\n").length - 1} documents unchanged` : "SNAPSHOT CHANGED");
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
