/*
 * YOMICO — security data-health audit D1–D7 (REPORT-ONLY).
 * ---------------------------------------------------------------------------
 * Finds the records the B1/B2 fail-closed rules will refuse, leave stuck, or
 * have already flagged:
 *   D1  products whose seller would be refused by lib/sellerApproval
 *   D2  seller identity problems in `vendors` (duplicates, mixed / unknown
 *       statuses, > 25 records, legacy vendors/{uid} alongside uid records,
 *       records without a usable uid)
 *   D3  vendors_public mirror status vs the authoritative vendors records
 *   D4  Pending/Approved withdrawals settle-withdrawal would refuse on
 *       identity / amount grounds; Paid rows whose vendorId never counted
 *       against a payable; Paid-LIKE statuses (not confirmed payments)
 *   D5  withdrawals with a status outside Pending/Approved/Rejected/Paid, a
 *       missing status, or Paid without paidAt
 *   D6  Pending/Approved withdrawals whose seller is no longer Approved
 *   D7  orders with needsReview + sellerNotApproved, and (only with
 *       --scan-orders) flagged orders already released by "Mark as reviewed"
 *
 * READ-ONLY BY CONSTRUCTION. The report logic receives a ReadOnlyFirestore
 * (readOnlyFirestore() below): select/where/orderById/startAfter/limit/get/
 * count only. Snapshots and document references never leave the wrapper —
 * the cursor is a document-id string and document data is copied with any
 * reference value replaced. Every scan projects only the fields in FIELDS, so
 * bank / KYC / contact / address data never leaves Firestore.
 *
 * PRODUCTION PRE-FLIGHT. Before Firestore is even initialised, the CLI asks
 * Cloud Resource Manager projects.testIamPermissions (a read-only API that
 * needs no extra role) whether the credential holds datastore.entities.create
 * / update / delete on the project, and refuses if any is granted or if the
 * check cannot complete. Only a read-only credential gets past it.
 *
 * COMPLETENESS. Scans are bounded (--max-docs per collection) and paginated
 * (--page-size, ordered by document id). Each check is labelled COMPLETE,
 * PARTIAL or NOT RUN from the collections it depends on; when the seller scans
 * are partial, conclusions that would require an UNREAD seller record
 * ("no seller record", "mirror without seller", "approved without mirror")
 * are suppressed and only counted. Reads are not one snapshot — re-check a
 * finding before acting on it.
 *
 * PRIVACY. Ids and uids are printed only as per-run salted HMAC tokens
 * (#xxxxxxxxxx): stable within one report, not reversible, never the same
 * across runs; the salt is never printed or stored. Product document ids
 * (public — they are in product URLs) and human numbers (productNumber,
 * payoutNumber, orderNumber, sellerNumber) are kept so findings can be looked
 * up. Errors print a sanitized code only — never a message, which can contain
 * document paths.
 *
 * Usage:
 *   emulator:   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx \
 *                 scripts/test/security-audit/data-health-report.ts --project demo-yomico-test
 *   production: ALLOW_PRODUCTION=yes GOOGLE_APPLICATION_CREDENTIALS=<viewer-key.json> \
 *                 npx tsx scripts/test/security-audit/data-health-report.ts --project yogi-mart \
 *                 [--count-only] [--max-docs N] [--page-size N] [--scan-orders] [--json]
 *
 * Tested by scripts/test/security-audit/run.mts (emulator + stubbed IAM).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import type { Firestore, Query } from "firebase-admin/firestore";
import { isProductVisible } from "../../../lib/products/visibility";
import { sellerIdOf } from "../../../lib/sellerApproval";

// ---------------------------------------------------------------------------
// Read-only access
// ---------------------------------------------------------------------------

export type ReadDoc = { id: string; data: Record<string, unknown> };
/** `cursor` is the last document id — a plain string, never a snapshot. */
export type ReadPage = { docs: ReadDoc[]; cursor: string | null };

/** The ONLY database surface the report logic ever sees. */
export type ReadOnlyQuery = {
  where(field: string, op: "==" | "in", value: unknown): ReadOnlyQuery;
  select(...fields: string[]): ReadOnlyQuery;
  orderById(): ReadOnlyQuery;
  /** Only valid after orderById(); `afterId` is a document id. */
  startAfter(afterId: string): ReadOnlyQuery;
  limit(n: number): ReadOnlyQuery;
  get(): Promise<ReadPage>;
  count(): Promise<number>;
};
export type ReadOnlyFirestore = { collection(name: string): ReadOnlyQuery };

/** Copies document data, replacing any DocumentReference with a marker. */
export function confine(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const v = value as Record<string, unknown>;
  if ("firestore" in v && "path" in v && typeof v.path === "string") return "[reference]";
  if (Array.isArray(value)) return value.map(confine);
  if (typeof (v as { toMillis?: unknown }).toMillis === "function") return value; // Timestamp: inert value
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) out[k] = confine(v[k]);
  return out;
}

/** Wraps an Admin Firestore so only reads are reachable and nothing live escapes. */
export function readOnlyFirestore(db: Firestore, documentIdPath: unknown): ReadOnlyFirestore {
  const wrap = (q: Query): ReadOnlyQuery => ({
    where: (field, op, value) => wrap(q.where(field, op, value)),
    select: (...fields) => wrap(q.select(...fields)),
    orderById: () => wrap(q.orderBy(documentIdPath as string)),
    startAfter: (afterId) => wrap(q.startAfter(String(afterId))),
    limit: (n) => wrap(q.limit(n)),
    get: async () => {
      const snap = await q.get();
      const docs = snap.docs.map((d) => ({ id: d.id, data: confine(d.data()) as Record<string, unknown> }));
      return { docs, cursor: docs.length ? docs[docs.length - 1].id : null };
    },
    count: async () => Number((await q.count().get()).data().count),
  });
  return { collection: (name) => wrap(db.collection(name)) };
}

// ---------------------------------------------------------------------------
// Constants, mirrored from the production code they describe
// ---------------------------------------------------------------------------

/** lib/sellerApproval.ts MAX_SELLER_RECORDS. */
export const MAX_SELLER_RECORDS = 25;
export const KNOWN_SELLER_STATUSES = ["Pending", "Approved", "Rejected", "Blocked"];
export const KNOWN_WITHDRAWAL_STATUSES = ["Pending", "Approved", "Rejected", "Paid"];
/** settle-withdrawal SETTLEABLE_FROM — a falsy status is treated as Pending there. */
const OPEN_WITHDRAWAL_STATUSES = ["Pending", "Approved"];

/** Projected fields — nothing personal is ever requested. */
export const FIELDS = {
  vendors: ["uid", "status", "kycStatus", "sellerNumber"],
  vendors_public: ["status"],
  products: ["vendorId", "active", "approvalStatus", "archived", "productNumber"],
  withdrawals: ["vendorId", "status", "amount", "payoutNumber", "createdAt", "paidAt"],
  orders: [
    "needsReview", "sellerNotApproved", "stockShortfall", "couponConflict", "rewardShortfall",
    "status", "paymentStatus", "paymentMethod", "finalTotal", "orderNumber", "createdAt", "reviewedAt",
  ],
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type Tokenizer = (value: unknown) => string;

/**
 * Per-run, non-reversible identifier tokens: HMAC-SHA256(salt, value),
 * truncated. Same value -> same token within one report. The salt lives only
 * in this closure; it is never returned, printed or stored.
 */
export function makeTokenizer(salt: Buffer = crypto.randomBytes(32)): Tokenizer {
  const key = Buffer.from(salt);
  return (value) => {
    const s = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
    if (!s) return "(empty)";
    // Hmac in stream mode (end + read): same digest as the one-shot form.
    const h = crypto.createHmac("sha256", key);
    h.end(s, "utf8");
    return `#${(h.read() as Buffer).toString("hex").slice(0, 10)}`;
  };
}

const statusOf = (data: unknown): string => {
  const s = (data as { status?: unknown } | undefined)?.status;
  return typeof s === "string" ? s : "";
};
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
function iso(v: unknown): string | null {
  const ms = (v as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
/** A prototype-free dictionary, so a uid like "__proto__" is just a key. */
const dict = <T>(): Record<string, T> => Object.setPrototypeOf({}, null) as Record<string, T>;
const distinct = (xs: string[]): number => xs.filter((x, i) => xs.indexOf(x) === i).length;
function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] || 0) + 1;
  return out;
}

export type ScanResult = { docs: ReadDoc[]; complete: boolean; pages: number };

/** Bounded, paginated scan ordered by document id. */
export async function scanCollection(
  db: ReadOnlyFirestore,
  name: string,
  fields: readonly string[],
  opts: { pageSize: number; maxDocs: number; where?: [string, "==" | "in", unknown] }
): Promise<ScanResult> {
  const docs: ReadDoc[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const base = () => {
    let q = db.collection(name);
    if (opts.where) q = q.where(...opts.where);
    return q.select(...fields).orderById();
  };
  while (docs.length < opts.maxDocs) {
    const want = Math.min(opts.pageSize, opts.maxDocs - docs.length);
    let q = base();
    if (cursor !== null) q = q.startAfter(cursor);
    const page = await q.limit(want).get();
    pages++;
    docs.push(...page.docs);
    if (page.docs.length < want) return { docs, complete: true, pages }; // a short page is the last
    cursor = page.cursor;
  }
  // Hit the cap: one 1-document probe decides whether anything was left unread.
  let probe = base();
  if (cursor !== null) probe = probe.startAfter(cursor);
  const rest = await probe.limit(1).get();
  pages++;
  return { docs, complete: rest.docs.length === 0, pages };
}

// ---------------------------------------------------------------------------
// Seller approval — in-memory mirror of lib/sellerApproval.ts#isSellerApproved
// ---------------------------------------------------------------------------

export type SellerVerdict =
  | { approved: true }
  | {
      approved: false;
      reason:
        | "missing-vendor-id"
        | "too-many-records"
        | "no-seller-record"
        | "record-not-approved"
        | "mirror-not-approved";
      statuses: string[];
    };

export type SellerIndex = {
  /** vendors records grouped by their exact `uid` string. */
  byUid: Record<string, ReadDoc[]>;
  /** vendors documents by document id (legacy vendors/{uid}). */
  byDocId: Record<string, ReadDoc>;
  /** vendors_public documents by id (= uid). */
  mirror: Record<string, ReadDoc>;
};

export function buildSellerIndex(vendors: ReadDoc[], mirrors: ReadDoc[]): SellerIndex {
  const byUid: Record<string, ReadDoc[]> = dict();
  const byDocId: Record<string, ReadDoc> = dict();
  const mirror: Record<string, ReadDoc> = dict();
  for (const v of vendors) {
    byDocId[v.id] = v;
    const uid = v.data.uid;
    if (typeof uid === "string") (byUid[uid] = byUid[uid] || []).push(v);
  }
  for (const m of mirrors) mirror[m.id] = m;
  return { byUid, byDocId, mirror };
}

/**
 * The vendors/{uid} document, if production would COUNT it for `uid`: it is
 * not already among the uid-field records and its own uid field is absent or
 * equal to `uid` (lib/sellerApproval.ts — a document owned by another uid is a
 * mismatch, not a record).
 */
export function countedLegacyRecord(index: SellerIndex, uid: string): ReadDoc | null {
  const legacy = index.byDocId[uid];
  if (!legacy) return null;
  if ((index.byUid[uid] || []).some((d) => d.id === legacy.id)) return null;
  const legacyUid = legacy.data.uid;
  return legacyUid === undefined || legacyUid === uid ? legacy : null;
}

/** The records isSellerApproved would judge for `uid` (uid matches + legacy doc). */
export function sellerRecords(index: SellerIndex, uid: string): ReadDoc[] {
  const records = (index.byUid[uid] || []).slice();
  const legacy = countedLegacyRecord(index, uid);
  if (legacy) records.push(legacy);
  return records;
}

/** Exactly isSellerApproved(db, read, uid) — `uid` as the caller passes it. */
export function evaluateSeller(index: SellerIndex, uid: string): SellerVerdict {
  if (!uid) return { approved: false, reason: "missing-vendor-id", statuses: [] };
  const byUid = index.byUid[uid] || [];
  if (byUid.length > MAX_SELLER_RECORDS) {
    return { approved: false, reason: "too-many-records", statuses: [`${byUid.length} records`] };
  }
  const records = sellerRecords(index, uid);
  const statuses = records.map((r) => statusOf(r.data) || "(none)");
  if (records.length === 0) return { approved: false, reason: "no-seller-record", statuses };
  if (!records.every((r) => statusOf(r.data) === "Approved")) {
    return { approved: false, reason: "record-not-approved", statuses };
  }
  const m = index.mirror[uid];
  if (m) {
    const ms = statusOf(m.data);
    if (ms && ms !== "Approved") return { approved: false, reason: "mirror-not-approved", statuses: [...statuses, `mirror:${ms}`] };
  }
  return { approved: true };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type Coverage = { collection: string; scanned: number; complete: boolean; pages: number; filter?: string };

export type SectionStatus = "COMPLETE" | "PARTIAL" | "NOT RUN";
export type Section = {
  status: SectionStatus;
  /** Coverage entries this check depends on that did not finish. */
  incomplete: string[];
  /** Conclusions withheld because they would rest on an unread record. */
  suppressed: number;
  suppressedReasons: Record<string, number>;
};

export type DataHealthReport = {
  generatedAt: string;
  finishedAt: string;
  readOnly: true;
  complete: boolean;
  coverage: Coverage[];
  sections: { d1: Section; d2: Section; d3: Section; d4: Section; d5: Section; d6: Section; d7: Section; d7Released: Section };
  d1: {
    totalProducts: number;
    refused: number;
    refusedVisible: number;
    byReason: Record<string, number>;
    findings: { product: string; productNumber: string | null; visible: boolean; seller: string; reason: string; statuses: string[] }[];
  };
  d2: {
    sellerUids: number;
    findings: { seller: string; sellerNumbers: string[]; records: number; statuses: string[]; flags: string[] }[];
    recordsWithoutUid: { vendorDoc: string; status: string; usableAsLegacy: boolean }[];
  };
  d3: { findings: { seller: string; mirrorStatus: string; authoritativeStatuses: string[]; issue: string }[] };
  d4: {
    openChecked: number;
    findings: { withdrawal: string; payoutNumber: string | null; status: string; amount: unknown; issues: string[] }[];
    paidUncounted: { withdrawal: string; payoutNumber: string | null; amount: unknown; issue: string }[];
    /** Status resembles "Paid" but is NOT exactly "Paid" — not a confirmed payment. */
    paidLikeAnomalies: { withdrawal: string; payoutNumber: string | null; status: string; amount: unknown; note: string }[];
  };
  d5: { findings: { withdrawal: string; payoutNumber: string | null; status: string; issue: string }[] };
  d6: { findings: { withdrawal: string; payoutNumber: string | null; status: string; amount: unknown; seller: string; reason: string; statuses: string[] }[] };
  d7: {
    openNeedsReview: number;
    openByReason: Record<string, number>;
    openSellerNotApproved: { order: string; orderNumber: string | null; sellers: string[]; paymentStatus: string | null; paymentMethod: string | null; finalTotal: number | null; createdAt: string | null }[];
    /** null = NOT RUN (no --scan-orders). */
    releasedSellerNotApproved: null | { order: string; orderNumber: string | null; sellers: string[]; paymentStatus: string | null; finalTotal: number | null; reviewedAt: string | null }[];
  };
};

/** `salt` exists for tests only; the CLI never passes it (a fresh random salt per run). */
export type ReportOptions = { pageSize?: number; maxDocs?: number; scanOrders?: boolean; now?: () => Date; salt?: Buffer };

const PAID_LIKE = /^\s*paid\s*$/i;

export async function runDataHealthReport(db: ReadOnlyFirestore, options: ReportOptions = {}): Promise<DataHealthReport> {
  const pageSize = options.pageSize ?? 300;
  const maxDocs = options.maxDocs ?? 20000;
  const now = options.now ?? (() => new Date());
  const tok = makeTokenizer(options.salt);
  const generatedAt = now().toISOString();
  const opts = { pageSize, maxDocs };
  const coverage: Coverage[] = [];
  const scan = async (key: string, name: keyof typeof FIELDS, where?: [string, "==" | "in", unknown], filter?: string) => {
    const r = await scanCollection(db, name, FIELDS[name], { ...opts, where });
    coverage.push({ collection: key, scanned: r.docs.length, complete: r.complete, pages: r.pages, ...(filter ? { filter } : {}) });
    return r;
  };

  const vendorsScan = await scan("vendors", "vendors");
  const mirrorsScan = await scan("vendors_public", "vendors_public");
  const productsScan = await scan("products", "products");
  const withdrawalsScan = await scan("withdrawals", "withdrawals");
  const openScan = await scan("orders(needsReview)", "orders", ["needsReview", "==", true], "needsReview == true");
  const allScan = options.scanOrders ? await scan("orders(full)", "orders", undefined, "full scan (--scan-orders)") : null;

  const vendors = vendorsScan.docs;
  const mirrors = mirrorsScan.docs;
  const vendorsComplete = vendorsScan.complete;
  const mirrorsComplete = mirrorsScan.complete;

  const section = (deps: (ScanResult | null)[], depNames: string[], suppressedReasons: Record<string, number> = {}): Section => {
    if (deps.some((d) => d === null)) return { status: "NOT RUN", incomplete: [], suppressed: 0, suppressedReasons: {} };
    const incomplete = depNames.filter((_, i) => !(deps[i] as ScanResult).complete);
    const suppressed = Object.values(suppressedReasons).reduce((a, b) => a + b, 0);
    return { status: incomplete.length ? "PARTIAL" : "COMPLETE", incomplete, suppressed, suppressedReasons };
  };

  const index = buildSellerIndex(vendors, mirrors);
  // With a partial vendors scan, "no record found" proves nothing — the record
  // may simply be unread. Those conclusions are withheld, not reported.
  const conclusive = (reason: string) => vendorsComplete || reason !== "no-seller-record";

  // ---- D1 ----
  const d1Findings: DataHealthReport["d1"]["findings"] = [];
  const d1Suppressed: Record<string, number> = {};
  for (const p of productsScan.docs) {
    const seller = sellerIdOf(p.data);
    const v = evaluateSeller(index, seller);
    if (v.approved) continue;
    if (!conclusive(v.reason)) { d1Suppressed[v.reason] = (d1Suppressed[v.reason] || 0) + 1; continue; }
    d1Findings.push({
      product: p.id,
      productNumber: strOrNull(p.data.productNumber),
      visible: isProductVisible(p.data),
      seller: tok(seller),
      reason: v.reason,
      statuses: v.statuses,
    });
  }

  // ---- D2 ----
  const d2Findings: DataHealthReport["d2"]["findings"] = [];
  for (const uid of Object.keys(index.byUid)) {
    const recs = index.byUid[uid];
    const statuses = recs.map((r) => statusOf(r.data) || "(none)");
    const flags: string[] = [];
    if (recs.length > 1) flags.push("duplicate-records");
    if (distinct(statuses) > 1) flags.push("mixed-statuses");
    if (recs.length > MAX_SELLER_RECORDS) flags.push("over-record-limit");
    if (statuses.some((s) => !KNOWN_SELLER_STATUSES.includes(s))) flags.push("unknown-status");
    if (!uid) flags.push("uid-empty");
    else if (uid !== uid.trim()) flags.push("uid-not-trimmed");
    const legacy = index.byDocId[uid];
    if (legacy && !recs.some((r) => r.id === legacy.id)) {
      // Production counts vendors/{uid} only when its own uid field is absent
      // (or equal); one owned by another uid is ignored — not a conflict.
      flags.push(countedLegacyRecord(index, uid)
        ? "legacy-doc-alongside-uid-records"
        : "doc-id-collides-with-another-uid (ignored by approval)");
    }
    const verdict = evaluateSeller(index, uid);
    if (!verdict.approved && recs.length > 1) flags.push(`fails-approval:${verdict.reason}`);
    if (flags.length === 0) continue;
    d2Findings.push({
      seller: tok(uid),
      sellerNumbers: recs.map((r) => strOrNull(r.data.sellerNumber)).filter((s): s is string => !!s),
      records: recs.length,
      statuses,
      flags,
    });
  }
  const recordsWithoutUid = vendors
    .filter((v) => v.data.uid === undefined || typeof v.data.uid !== "string")
    .map((v) => ({
      vendorDoc: tok(v.id),
      status: statusOf(v.data) || "(none)",
      // Counted by isSellerApproved only when looked up as vendors/{uid} and the uid field is ABSENT.
      usableAsLegacy: v.data.uid === undefined,
    }));

  // ---- D3 ----
  const d3Findings: DataHealthReport["d3"]["findings"] = [];
  const d3Suppressed: Record<string, number> = {};
  const withhold = (issue: string) => { d3Suppressed[issue] = (d3Suppressed[issue] || 0) + 1; };
  for (const m of mirrors) {
    const records = sellerRecords(index, m.id);
    const auth = records.map((r) => statusOf(r.data) || "(none)");
    const ms = statusOf(m.data);
    let issue = "";
    if (records.length === 0) issue = "mirror-without-seller-record";
    else if (!ms) issue = "mirror-without-status";
    else if (distinct(auth) > 1) issue = "authoritative-records-disagree";
    else if (auth[0] !== ms) issue = "status-mismatch";
    if (!issue) continue;
    if (issue === "mirror-without-seller-record" && !vendorsComplete) { withhold(issue); continue; }
    d3Findings.push({ seller: tok(m.id), mirrorStatus: ms || "(none)", authoritativeStatuses: auth, issue });
  }
  for (const uid of Object.keys(index.byUid)) {
    if (index.mirror[uid]) continue;
    const auth = sellerRecords(index, uid).map((r) => statusOf(r.data) || "(none)");
    if (!(auth.length && auth.every((s) => s === "Approved"))) continue;
    if (!mirrorsComplete || !vendorsComplete) { withhold("approved-without-mirror"); continue; }
    d3Findings.push({ seller: tok(uid), mirrorStatus: "(no mirror)", authoritativeStatuses: auth, issue: "approved-without-mirror (informational)" });
  }

  // ---- D4 / D5 / D6 ----
  const d4Findings: DataHealthReport["d4"]["findings"] = [];
  const paidUncounted: DataHealthReport["d4"]["paidUncounted"] = [];
  const paidLikeAnomalies: DataHealthReport["d4"]["paidLikeAnomalies"] = [];
  const d5Findings: DataHealthReport["d5"]["findings"] = [];
  const d6Findings: DataHealthReport["d6"]["findings"] = [];
  const d6Suppressed: Record<string, number> = {};
  let openChecked = 0;
  for (const w of withdrawalsScan.docs) {
    const raw = w.data.status;
    const status = typeof raw === "string" ? raw : "";
    const effective = String(raw || "Pending"); // exactly settle-withdrawal's String(status || "Pending")
    const payoutNumber = strOrNull(w.data.payoutNumber);
    const wid = tok(w.id);
    const vid = w.data.vendorId;
    const vidIssue =
      vid === undefined ? "vendorId-missing"
      : typeof vid !== "string" ? "vendorId-not-a-string"
      : !vid ? "vendorId-empty"
      : vid !== vid.trim() ? (vid.trim() ? "vendorId-padded" : "vendorId-blank")
      : "";

    // D5
    if (raw !== undefined && typeof raw !== "string") d5Findings.push({ withdrawal: wid, payoutNumber, status: String(raw), issue: "status-not-a-string" });
    else if (!status) d5Findings.push({ withdrawal: wid, payoutNumber, status: "(none)", issue: "status-missing (treated as Pending by settlement)" });
    else if (!KNOWN_WITHDRAWAL_STATUSES.includes(status)) d5Findings.push({ withdrawal: wid, payoutNumber, status, issue: "unexpected-status (cannot be reviewed or settled)" });
    if (status === "Paid" && !iso(w.data.paidAt)) d5Findings.push({ withdrawal: wid, payoutNumber, status, issue: "paid-without-paidAt" });

    // D4 — Paid exposure
    if (status === "Paid" && vidIssue) {
      paidUncounted.push({ withdrawal: wid, payoutNumber, amount: w.data.amount, issue: `${vidIssue} (never counted against any payable)` });
    }
    if (status && status !== "Paid" && PAID_LIKE.test(status)) {
      paidLikeAnomalies.push({
        withdrawal: wid, payoutNumber, status: JSON.stringify(status), amount: w.data.amount,
        note: "status resembles Paid but is not exactly \"Paid\": NOT a confirmed payment; if money did move it is not counted against any payable, and the row can be neither reviewed nor settled",
      });
    }
    if (!OPEN_WITHDRAWAL_STATUSES.includes(effective)) continue;
    openChecked++;

    // D4 — open rows settlement would refuse
    const issues: string[] = [];
    if (vidIssue) issues.push(vidIssue);
    if (!vidIssue && payoutNumber && !w.id.startsWith(`${vid as string}_`)) issues.push("identity-mismatch (id vs vendorId)");
    const amt = w.data.amount;
    if (typeof amt !== "number" || !Number.isFinite(amt) || amt <= 0 || Math.floor(amt) !== amt) issues.push("amount-not-a-positive-whole-number");
    if (issues.length) d4Findings.push({ withdrawal: wid, payoutNumber, status: effective, amount: amt, issues });

    // D6 — settlement passes the stored vendorId exactly.
    if (!vidIssue) {
      const v = evaluateSeller(index, vid as string);
      if (!v.approved) {
        if (!conclusive(v.reason)) { d6Suppressed[v.reason] = (d6Suppressed[v.reason] || 0) + 1; continue; }
        d6Findings.push({ withdrawal: wid, payoutNumber, status: effective, amount: amt, seller: tok(vid), reason: v.reason, statuses: v.statuses });
      }
    }
  }

  // ---- D7 ----
  const sellersOf = (d: Record<string, unknown>) =>
    Array.isArray(d.sellerNotApproved) ? (d.sellerNotApproved as unknown[]).map(tok) : [];
  const openByReason: Record<string, number> = {};
  for (const o of openScan.docs) {
    const reasons: string[] = [];
    if (sellersOf(o.data).length) reasons.push("sellerNotApproved");
    if (Array.isArray(o.data.stockShortfall) && o.data.stockShortfall.length) reasons.push("stockShortfall");
    if (o.data.couponConflict === true) reasons.push("couponConflict");
    if (numOrNull(o.data.rewardShortfall)) reasons.push("rewardShortfall");
    if (!reasons.length) reasons.push("other");
    for (const r of reasons) openByReason[r] = (openByReason[r] || 0) + 1;
  }
  const openSellerNotApproved = openScan.docs
    .filter((o) => sellersOf(o.data).length > 0)
    .map((o) => ({
      order: tok(o.id),
      orderNumber: strOrNull(o.data.orderNumber),
      sellers: sellersOf(o.data),
      paymentStatus: strOrNull(o.data.paymentStatus),
      paymentMethod: strOrNull(o.data.paymentMethod),
      finalTotal: numOrNull(o.data.finalTotal),
      createdAt: iso(o.data.createdAt),
    }));
  const releasedSellerNotApproved = allScan
    ? allScan.docs
        .filter((o) => sellersOf(o.data).length > 0 && o.data.needsReview !== true)
        .map((o) => ({
          order: tok(o.id),
          orderNumber: strOrNull(o.data.orderNumber),
          sellers: sellersOf(o.data),
          paymentStatus: strOrNull(o.data.paymentStatus),
          finalTotal: numOrNull(o.data.finalTotal),
          reviewedAt: iso(o.data.reviewedAt),
        }))
    : null;

  const sections = {
    d1: section([vendorsScan, mirrorsScan, productsScan], ["vendors", "vendors_public", "products"], d1Suppressed),
    d2: section([vendorsScan], ["vendors"]),
    d3: section([vendorsScan, mirrorsScan], ["vendors", "vendors_public"], d3Suppressed),
    d4: section([withdrawalsScan], ["withdrawals"]),
    d5: section([withdrawalsScan], ["withdrawals"]),
    d6: section([withdrawalsScan, vendorsScan, mirrorsScan], ["withdrawals", "vendors", "vendors_public"], d6Suppressed),
    d7: section([openScan], ["orders(needsReview)"]),
    d7Released: section([allScan], ["orders(full)"]),
  };

  return {
    generatedAt,
    finishedAt: now().toISOString(),
    readOnly: true,
    complete: coverage.every((c) => c.complete),
    coverage,
    sections,
    d1: {
      totalProducts: productsScan.docs.length,
      refused: d1Findings.length,
      refusedVisible: d1Findings.filter((f) => f.visible).length,
      byReason: countBy(d1Findings, (f) => f.reason),
      findings: d1Findings,
    },
    d2: { sellerUids: Object.keys(index.byUid).length, findings: d2Findings, recordsWithoutUid },
    d3: { findings: d3Findings },
    d4: { openChecked, findings: d4Findings, paidUncounted, paidLikeAnomalies },
    d5: { findings: d5Findings },
    d6: { findings: d6Findings },
    d7: { openNeedsReview: openScan.docs.length, openByReason, openSellerNotApproved, releasedSellerNotApproved },
  };
}

/** Collection sizes via count() aggregation — no documents are read. */
export async function runCountOnly(db: ReadOnlyFirestore): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const name of ["vendors", "vendors_public", "products", "withdrawals", "orders"]) {
    out[name] = await db.collection(name).count();
  }
  out["orders(needsReview==true)"] = await db.collection("orders").where("needsReview", "==", true).count();
  return out;
}

export function formatDataHealthReport(r: DataHealthReport): string {
  const L: string[] = [];
  const j = (v: unknown) => JSON.stringify(v);
  const tag = (s: Section) =>
    `[${s.status}${s.incomplete.length ? `: ${s.incomplete.join(", ")} not fully read` : ""}${s.suppressed ? `; ${s.suppressed} unverifiable conclusion(s) withheld ${j(s.suppressedReasons)}` : ""}]`;
  L.push("YOMICO security data-health audit D1–D7 — READ-ONLY (no writes were performed)");
  L.push(`Started: ${r.generatedAt}   Finished: ${r.finishedAt}   ${r.complete ? "COMPLETE" : "INCOMPLETE — at least one collection hit --max-docs; see each check's label"}`);
  for (const c of r.coverage) L.push(`  ${c.collection.padEnd(20)} scanned=${c.scanned} pages=${c.pages} ${c.complete ? "complete" : "INCOMPLETE"}${c.filter ? ` (${c.filter})` : ""}`);
  L.push("Identifiers are per-run tokens (#…): stable within this report only, not reversible.");
  L.push("");
  const s = r.sections;
  L.push(`D1 ${tag(s.d1)} products refused by seller approval: ${r.d1.refused} of ${r.d1.totalProducts} scanned (${r.d1.refusedVisible} otherwise visible)  byReason=${j(r.d1.byReason)}`);
  for (const f of r.d1.findings) L.push(`  product ${f.product}${f.productNumber ? ` (${f.productNumber})` : ""} visible=${f.visible} seller=${f.seller} ${f.reason} ${j(f.statuses)}`);
  L.push(`D2 ${tag(s.d2)} seller identity issues: ${r.d2.findings.length} of ${r.d2.sellerUids} seller uids; records without a uid: ${r.d2.recordsWithoutUid.length}`);
  for (const f of r.d2.findings) L.push(`  seller ${f.seller}${f.sellerNumbers.length ? ` (${f.sellerNumbers.join(",")})` : ""} records=${f.records} statuses=${j(f.statuses)} ${f.flags.join(",")}`);
  for (const f of r.d2.recordsWithoutUid) L.push(`  vendors doc ${f.vendorDoc} status=${f.status} no-uid${f.usableAsLegacy ? " (usable as legacy vendors/{uid})" : " (uid field present but unusable)"}`);
  L.push(`D3 ${tag(s.d3)} vendors_public mismatches: ${r.d3.findings.length}`);
  for (const f of r.d3.findings) L.push(`  seller ${f.seller} mirror=${f.mirrorStatus} authoritative=${j(f.authoritativeStatuses)} ${f.issue}`);
  L.push(`D4 ${tag(s.d4)} open withdrawals settlement would refuse (identity/amount): ${r.d4.findings.length} of ${r.d4.openChecked}; Paid rows never counted against a payable: ${r.d4.paidUncounted.length}; Paid-LIKE status anomalies (not confirmed payments): ${r.d4.paidLikeAnomalies.length}`);
  for (const f of r.d4.findings) L.push(`  withdrawal ${f.withdrawal}${f.payoutNumber ? ` (${f.payoutNumber})` : ""} ${f.status} amount=${j(f.amount)} ${f.issues.join(",")}`);
  for (const f of r.d4.paidUncounted) L.push(`  PAID withdrawal ${f.withdrawal}${f.payoutNumber ? ` (${f.payoutNumber})` : ""} amount=${j(f.amount)} ${f.issue}`);
  for (const f of r.d4.paidLikeAnomalies) L.push(`  PAID-LIKE withdrawal ${f.withdrawal}${f.payoutNumber ? ` (${f.payoutNumber})` : ""} status=${f.status} amount=${j(f.amount)} — ${f.note}`);
  L.push(`D5 ${tag(s.d5)} withdrawal status issues: ${r.d5.findings.length}`);
  for (const f of r.d5.findings) L.push(`  withdrawal ${f.withdrawal}${f.payoutNumber ? ` (${f.payoutNumber})` : ""} status=${f.status} ${f.issue}`);
  L.push(`D6 ${tag(s.d6)} open withdrawals whose seller is not Approved: ${r.d6.findings.length}`);
  for (const f of r.d6.findings) L.push(`  withdrawal ${f.withdrawal}${f.payoutNumber ? ` (${f.payoutNumber})` : ""} ${f.status} amount=${j(f.amount)} seller=${f.seller} ${f.reason} ${j(f.statuses)}`);
  L.push(`D7 ${tag(s.d7)} open needsReview orders: ${r.d7.openNeedsReview} byReason=${j(r.d7.openByReason)}; with sellerNotApproved: ${r.d7.openSellerNotApproved.length}`);
  for (const f of r.d7.openSellerNotApproved) L.push(`  order ${f.order}${f.orderNumber ? ` (${f.orderNumber})` : ""} sellers=${j(f.sellers)} ${f.paymentMethod ?? "?"}/${f.paymentStatus ?? "?"} total=${f.finalTotal ?? "?"} created=${f.createdAt ?? "?"}`);
  if (r.d7.releasedSellerNotApproved === null) {
    L.push(`D7-released ${tag(s.d7Released)} flagged orders already released by "Mark as reviewed": not checked (run with --scan-orders for a full orders scan)`);
  } else {
    L.push(`D7-released ${tag(s.d7Released)} sellerNotApproved orders already released by "Mark as reviewed": ${r.d7.releasedSellerNotApproved.length}`);
    for (const f of r.d7.releasedSellerNotApproved) L.push(`  order ${f.order}${f.orderNumber ? ` (${f.orderNumber})` : ""} sellers=${j(f.sellers)} ${f.paymentStatus ?? "?"} total=${f.finalTotal ?? "?"} reviewedAt=${f.reviewedAt ?? "?"}`);
  }
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// IAM write-permission pre-flight (production only)
// ---------------------------------------------------------------------------

export const WRITE_PERMISSIONS = ["datastore.entities.create", "datastore.entities.update", "datastore.entities.delete"] as const;

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Read-only check that the credential holds NONE of the Firestore write
 * permissions. projects.testIamPermissions changes nothing and needs no role.
 * Fails closed: any error, non-2xx, malformed body or unexpected permission
 * refuses. Messages never contain the token.
 */
export async function iamWritePreflight(
  projectId: string,
  getAccessToken: () => Promise<string>,
  fetchImpl: FetchLike,
  timeoutMs = 15000
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return { ok: false, reason: "could not obtain an access token for the credential" };
  }
  if (typeof token !== "string" || !token) return { ok: false, reason: "the credential returned no access token" };
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}:testIamPermissions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...WRITE_PERMISSIONS] }),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
  } catch {
    return { ok: false, reason: "the IAM permission check could not be completed (network error or timeout)" };
  }
  if (!res.ok) return { ok: false, reason: `the IAM permission check failed (HTTP ${Number(res.status) || "?"})` };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "the IAM permission check returned an unreadable response" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "the IAM permission check returned an unexpected response" };
  const granted = (body as { permissions?: unknown }).permissions;
  // The API omits `permissions` when none of the requested ones are held.
  if (granted === undefined) return { ok: true };
  if (!Array.isArray(granted) || granted.some((p) => typeof p !== "string" || !(WRITE_PERMISSIONS as readonly string[]).includes(p))) {
    return { ok: false, reason: "the IAM permission check returned an unexpected permission list" };
  }
  if (granted.length > 0) {
    return { ok: false, reason: `the credential holds Firestore WRITE permission(s): ${granted.join(", ")}. Use a Cloud Datastore Viewer (read-only) key.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** A short error code only — messages can carry document paths, so they are never printed. */
export function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const s = typeof code === "number" || typeof code === "string" ? String(code) : "";
  return /^[A-Za-z0-9_.-]{1,40}$/.test(s) ? s : "unknown";
}

// ---------------------------------------------------------------------------
// CLI — every guard (argument, environment, credential project, IAM) runs
// BEFORE any Firestore instance exists.
// ---------------------------------------------------------------------------

export const EXPECTED_PRODUCTION_PROJECT = "yogi-mart";

export type CliConfig = {
  mode: "emulator" | "production";
  projectId: string;
  countOnly: boolean;
  json: boolean;
  scanOrders: boolean;
  pageSize: number;
  maxDocs: number;
};

/** Returns the config, or a refusal message. Pure: reads argv/env/key file only. */
export function parseCli(argv: string[], env: Record<string, string | undefined>): CliConfig | { refuse: string } {
  const flags = ["--count-only", "--json", "--scan-orders"];
  const valued = ["--project", "--max-docs", "--page-size"];
  const seen: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!flags.includes(a) && !valued.includes(a)) {
      return { refuse: `unknown argument ${a}. This audit is read-only; allowed: ${[...flags, ...valued].join(" ")}.` };
    }
    if (a in seen) return { refuse: `${a} was given more than once.` };
    if (flags.includes(a)) {
      seen[a] = "1";
    } else {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return { refuse: `${a} needs a value.` };
      seen[a] = v;
      i++;
    }
  }
  const intIn = (name: string, def: number, max: number): number | string => {
    if (!(name in seen)) return def;
    const n = Number(seen[name]);
    return Number.isInteger(n) && n >= 1 && n <= max ? n : `${name} must be a whole number between 1 and ${max}.`;
  };
  const pageSize = intIn("--page-size", 300, 1000);
  const maxDocs = intIn("--max-docs", 20000, 200000);
  if (typeof pageSize === "string") return { refuse: pageSize };
  if (typeof maxDocs === "string") return { refuse: maxDocs };

  const projectId = seen["--project"];
  if (!projectId) return { refuse: "--project is required (it must name the project you intend to read)." };
  const emulator = !!env.FIRESTORE_EMULATOR_HOST;
  const allowProd = env.ALLOW_PRODUCTION === "yes";
  if (emulator && allowProd) return { refuse: "FIRESTORE_EMULATOR_HOST and ALLOW_PRODUCTION=yes are both set; refusing an ambiguous target." };

  const base = { countOnly: !!seen["--count-only"], json: !!seen["--json"], scanOrders: !!seen["--scan-orders"], pageSize, maxDocs };
  if (emulator) {
    if (!projectId.startsWith("demo-")) return { refuse: "with the emulator, --project must be a demo-* project id." };
    return { mode: "emulator", projectId, ...base };
  }
  if (!allowProd) return { refuse: "not the local emulator. Set ALLOW_PRODUCTION=yes to read a real project (this audit never writes)." };
  if (projectId !== EXPECTED_PRODUCTION_PROJECT) return { refuse: `--project must be ${EXPECTED_PRODUCTION_PROJECT} for a production read.` };
  // The app's admin key (FIREBASE_SERVICE_ACCOUNT_KEY) is never used; the
  // audit requires a separate, read-only (Cloud Datastore Viewer) key file.
  const keyPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) return { refuse: "GOOGLE_APPLICATION_CREDENTIALS must point to a read-only (Cloud Datastore Viewer) service-account key." };
  let keyProject: unknown;
  try {
    keyProject = (JSON.parse(fs.readFileSync(keyPath, "utf8")) as { project_id?: unknown }).project_id;
  } catch {
    return { refuse: "GOOGLE_APPLICATION_CREDENTIALS could not be read as a service-account key file." };
  }
  if (keyProject !== projectId) return { refuse: "the credential's project does not match --project." };
  return { mode: "production", projectId, ...base };
}

export type CliCredential = { getAccessToken(): Promise<{ access_token: string }> };
export type CliDeps = {
  /** Production credential (default: firebase-admin applicationDefault()). */
  credential(): Promise<CliCredential>;
  fetch: FetchLike;
  /** Opens the read-only Firestore — called only after every guard passed. */
  openDb(cfg: CliConfig, credential: CliCredential | null): Promise<ReadOnlyFirestore>;
  out(line: string): void;
  err(line: string): void;
};

/** The whole CLI as a function, so every guard is testable without a process or production. */
export async function runCli(argv: string[], env: Record<string, string | undefined>, deps: CliDeps): Promise<number> {
  const cfg = parseCli(argv, env);
  if ("refuse" in cfg) {
    deps.err(`REFUSING TO RUN: ${cfg.refuse}`);
    return 2;
  }
  try {
    let credential: CliCredential | null = null;
    if (cfg.mode === "production") {
      credential = await deps.credential();
      const cred = credential;
      const pre = await iamWritePreflight(cfg.projectId, async () => (await cred.getAccessToken()).access_token, deps.fetch);
      if (!pre.ok) {
        deps.err(`REFUSING TO RUN: IAM pre-flight — ${pre.reason}`);
        return 2;
      }
    }
    const db = await deps.openDb(cfg, credential);
    deps.err(`READ-ONLY data-health audit — project ${cfg.projectId} (${cfg.mode}${cfg.mode === "production" ? ", IAM pre-flight passed: no Firestore write permission" : ""})${cfg.countOnly ? " — count only" : ""}`);
    if (cfg.countOnly) {
      const counts = await runCountOnly(db);
      deps.out(cfg.json ? JSON.stringify(counts, null, 2) : Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("\n"));
    } else {
      const report = await runDataHealthReport(db, { pageSize: cfg.pageSize, maxDocs: cfg.maxDocs, scanOrders: cfg.scanOrders });
      deps.out(cfg.json ? JSON.stringify(report, null, 2) : formatDataHealthReport(report));
    }
    return 0;
  } catch (error) {
    deps.err(`data-health audit failed (code=${safeErrorCode(error)}). Details are withheld because they can contain document paths.`);
    return 1;
  }
}

export const defaultCliDeps: CliDeps = {
  credential: async () => {
    const { applicationDefault } = await import("firebase-admin/app");
    return applicationDefault();
  },
  fetch: (url, init) => fetch(url, init),
  openDb: async (cfg, credential) => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getFirestore, FieldPath } = await import("firebase-admin/firestore");
    const app = initializeApp(
      cfg.mode === "production"
        ? { projectId: cfg.projectId, credential: credential as import("firebase-admin/app").Credential }
        : { projectId: cfg.projectId },
      "security-data-health-audit"
    );
    return readOnlyFirestore(getFirestore(app), FieldPath.documentId());
  },
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/test/security-audit/data-health-report.ts")) {
  runCli(process.argv.slice(2), process.env, defaultCliDeps).then(
    (code) => process.exit(code),
    () => {
      console.error("data-health audit failed (code=unknown).");
      process.exit(1);
    }
  );
}
