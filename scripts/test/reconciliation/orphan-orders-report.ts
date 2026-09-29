/*
 * YOMICO — orphan order reconciliation report (REPORT-ONLY).
 * ---------------------------------------------------------------------------
 * Finds every order id that other records still reference but that has no
 * orders/{id} document, and lists those references by kind:
 *   points    rewardTransactions (by orderId, and refund rows linked through
 *             requestId -> itemRequests / returnId -> returns)
 *   seller    sellerOrders
 *   returns   itemRequests, returns (old-style), returnCollectionJobs
 *   coupon    couponRedemptions
 *   audit     audit_logs entries whose action targets an order
 *   payment   paymentIntents (finalizedPaymentId), codPaymentReferences
 *   delivery  deliveryJobs, deliveryJobs/{id}/legs, deliveryEvents
 *   other     notifications, chats, productReviews
 * A reference whose record carries no order id at all (optional on several
 * collections) is counted as "not verifiable", never as an orphan.
 *
 * READ-ONLY. It performs collection reads only (.get()) — no create, update,
 * delete, migration, backfill or repair of any kind — and there is no write
 * mode. Legs are read per delivery job (no collection-group index needed).
 * Output carries ids, uids, amounts, statuses and dates only: no names,
 * emails, phones, addresses or message text.
 *
 * Safety: refuses to run against anything but the local emulator unless
 * ALLOW_PRODUCTION=yes is set (and even then only reads).
 *
 *   ALLOW_PRODUCTION=yes npx tsx --env-file=.env.local \
 *     scripts/test/reconciliation/orphan-orders-report.ts [--json]
 *
 * Tested by scripts/test/reconciliation/run.mts (emulator).
 */
import type { Firestore } from "firebase-admin/firestore";

export type RefCategory =
  | "points"
  | "seller"
  | "returns"
  | "coupon"
  | "audit"
  | "payment"
  | "delivery"
  | "other";

/** Audit actions whose targetId is an order id. */
export const ORDER_AUDIT_ACTIONS = new Set([
  "order_status_change",
  "order_refund_processing",
  "order_refund_recorded",
  "order_review_resolved",
  "delivery_payment_verified",
  "delivery_payment_confirmed",
  "order_archived",
]);

export type OrphanReference = {
  collection: string;
  docId: string;
  orderId: string;
  category: RefCategory;
  /** How the record points at the order: its own field, or through a linked record. */
  via: "orderId" | "targetId" | "finalizedPaymentId" | "requestId" | "returnId";
  /** Non-personal facts about the record, for the audit trail. */
  facts: Record<string, unknown>;
};

export type CollectionCount = {
  collection: string;
  category: RefCategory;
  scanned: number;
  withReference: number;
  valid: number;
  orphan: number;
  notVerifiable: number;
};

export type OrphanOrder = {
  orderId: string;
  categories: RefCategory[];
  references: Record<string, number>;
  /** Signed points on ledger rows tied to this order (by orderId or via its returns). */
  pointsNet: number;
  /** Refund amounts on this order's return records that are marked credited. */
  refundsCredited: number;
  /** Σ vendorEarning on this order's seller records (recorded, not paid). */
  sellerEarningsRecorded: number;
  couponCodes: string[];
  earliestReferenceAt: string | null;
  latestReferenceAt: string | null;
};

export type OrphanOrderReport = {
  generatedAt: string;
  readOnly: true;
  orders: { total: number; archived: number };
  collections: CollectionCount[];
  missingOrderIds: string[];
  orphanOrders: OrphanOrder[];
  references: OrphanReference[];
  totals: {
    orphanOrderIds: number;
    orphanReferences: number;
    byCategory: Record<RefCategory, number>;
    /** Kept separate on purpose — these are different things and are not summed. */
    points: {
      earned: number;
      redeemed: number;
      refunded: number;
      cancelRestored: number;
      cancelReversed: number;
      other: number;
    };
    sellerEarningsRecorded: number;
    refundsCreditedAmount: number;
    couponClaims: number;
    unmatchedPayments: number;
  };
};

type Doc = { id: string; data: Record<string, unknown> };

function iso(v: unknown): string | null {
  const ms = (v as { toMillis?: () => number } | null)?.toMillis?.();
  if (typeof ms === "number" && Number.isFinite(ms)) return new Date(ms).toISOString();
  return typeof v === "string" ? v : null;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A ledger row's signed movement: v2 rows carry delta; legacy rows are signed by type. */
export function signedPoints(row: Record<string, unknown>): number {
  const delta = num(row.delta);
  if (delta !== null) return delta;
  const points = Math.abs(num(row.points) ?? 0);
  const label = String(row.kind ?? row.type ?? "");
  return /redeem|reversed|reverse|debit|deduct/i.test(label) ? -points : points;
}

function pointsClass(row: Record<string, unknown>): keyof OrphanOrderReport["totals"]["points"] {
  const label = String(row.kind ?? row.type ?? "").toLowerCase();
  if (label.includes("restored") || label === "cancel_restore") return "cancelRestored";
  if (label.includes("reversed") || label === "cancel_reverse") return "cancelReversed";
  if (label.includes("redeem")) return "redeemed";
  if (label.includes("refund")) return "refunded";
  if (label.includes("earned") || label === "purchase_earned") return "earned";
  return "other";
}

function factsFor(collection: string, d: Record<string, unknown>): Record<string, unknown> {
  switch (collection) {
    case "rewardTransactions":
      return {
        userId: str(d.userId), type: str(d.type), kind: str(d.kind), points: num(d.points),
        signed: signedPoints(d), requestId: str(d.requestId), returnId: str(d.returnId), createdAt: iso(d.createdAt),
      };
    case "sellerOrders": {
      const fulfilment = (d.itemFulfilment || {}) as Record<string, { status?: unknown }>;
      return {
        vendorId: str(d.vendorId), vendorEarning: num(d.vendorEarning), vendorSubtotal: num(d.vendorSubtotal),
        itemStatuses: Object.values(fulfilment).map((f) => str(f?.status)), createdAt: iso(d.createdAt),
      };
    }
    case "couponRedemptions":
      return { userId: str(d.userId), code: str(d.code), createdAt: iso(d.createdAt) };
    case "itemRequests": {
      const refund = (d.refund || {}) as Record<string, unknown>;
      return {
        userId: str(d.userId), vendorId: str(d.vendorId), requestNumber: str(d.requestNumber), type: str(d.type),
        status: str(d.status), refundDestination: str(refund.destination), refundAmount: num(refund.amount),
        refundCredited: refund.credited === true, refundNumber: str(refund.refundNumber),
        deliveryCost: num(d.deliveryCost), createdAt: iso(d.createdAt),
      };
    }
    case "returns":
      return {
        userId: str(d.userId), status: str(d.status), refundAmount: num(d.refundAmount),
        pointsCredited: d.pointsCredited === true, createdAt: iso(d.createdAt),
      };
    case "audit_logs": {
      const details = (d.details || {}) as Record<string, unknown>;
      return {
        action: str(d.action), actorUid: str(d.actorUid), oldStatus: str(details.oldStatus),
        newStatus: str(details.newStatus), createdAt: iso(d.createdAt),
      };
    }
    case "paymentIntents":
      return {
        uid: str(d.uid), platform: str(d.platform) ?? "web", status: str(d.status),
        expectedAmountPaise: num(d.expectedAmountPaise), createdAt: iso(d.createdAt),
      };
    case "codPaymentReferences":
      return { status: str(d.status), createdAt: iso(d.createdAt) };
    case "notifications":
      return { role: str(d.role), type: str(d.type), createdAt: iso(d.createdAt) };
    default:
      return { status: str(d.status), createdAt: iso(d.createdAt) };
  }
}

/**
 * Builds the report. Reads only; never writes. `db` is any Admin Firestore
 * (the emulator in tests; production only through the guarded CLI below).
 */
export async function runOrphanOrderReport(db: Firestore, now: Date = new Date()): Promise<OrphanOrderReport> {
  const all = async (name: string): Promise<Doc[]> =>
    (await db.collection(name).get()).docs.map((s) => ({ id: s.id, data: (s.data() || {}) as Record<string, unknown> }));

  const orders = await all("orders");
  const orderIds = new Set(orders.map((o) => o.id));

  const [ledger, sellerOrders, coupons, itemRequests, returns, returnJobs, audits, intents, codRefs, jobs, events,
    notifications, chats, reviews, unmatched] = await Promise.all([
    all("rewardTransactions"), all("sellerOrders"), all("couponRedemptions"), all("itemRequests"), all("returns"),
    all("returnCollectionJobs"), all("audit_logs"), all("paymentIntents"), all("codPaymentReferences"),
    all("deliveryJobs"), all("deliveryEvents"), all("notifications"), all("chats"), all("productReviews"),
    all("unmatchedPayments"),
  ]);
  const legs: Doc[] = [];
  for (const job of jobs) {
    const snap = await db.collection("deliveryJobs").doc(job.id).collection("legs").get();
    for (const leg of snap.docs) legs.push({ id: `${job.id}/legs/${leg.id}`, data: (leg.data() || {}) as Record<string, unknown> });
  }

  const collections: CollectionCount[] = [];
  const references: OrphanReference[] = [];

  function scan(
    collection: string,
    category: RefCategory,
    docs: Doc[],
    via: OrphanReference["via"],
    refOf: (d: Record<string, unknown>) => string | null
  ) {
    const count: CollectionCount = { collection, category, scanned: docs.length, withReference: 0, valid: 0, orphan: 0, notVerifiable: 0 };
    for (const { id, data } of docs) {
      const orderId = refOf(data);
      if (!orderId) { count.notVerifiable++; continue; }
      count.withReference++;
      if (orderIds.has(orderId)) { count.valid++; continue; }
      count.orphan++;
      references.push({ collection, docId: id, orderId, category, via, facts: factsFor(collection, data) });
    }
    collections.push(count);
  }

  const byOrderId = (d: Record<string, unknown>) => str(d.orderId);
  scan("rewardTransactions", "points", ledger, "orderId", byOrderId);
  scan("sellerOrders", "seller", sellerOrders, "orderId", byOrderId);
  scan("itemRequests", "returns", itemRequests, "orderId", byOrderId);
  scan("returns", "returns", returns, "orderId", byOrderId);
  scan("returnCollectionJobs", "returns", returnJobs, "orderId", byOrderId);
  scan("couponRedemptions", "coupon", coupons, "orderId", byOrderId);
  scan("audit_logs", "audit", audits, "targetId", (d) => (ORDER_AUDIT_ACTIONS.has(String(d.action)) ? str(d.targetId) : null));
  scan("paymentIntents", "payment", intents, "finalizedPaymentId", (d) => str(d.finalizedPaymentId));
  scan("codPaymentReferences", "payment", codRefs, "orderId", byOrderId);
  scan("deliveryJobs", "delivery", jobs, "orderId", byOrderId);
  scan("deliveryJobs/*/legs", "delivery", legs, "orderId", byOrderId);
  scan("deliveryEvents", "delivery", events, "orderId", byOrderId);
  scan("notifications", "other", notifications, "orderId", byOrderId);
  scan("chats", "other", chats, "orderId", byOrderId);
  scan("productReviews", "other", reviews, "orderId", byOrderId);

  // Ledger rows WITHOUT an orderId that belong to an orphan order through the
  // return record they refund (item-level requestId, old-style returnId).
  const orphanRequestOrder = new Map<string, string>();
  for (const r of itemRequests) {
    const o = str(r.data.orderId);
    if (o && !orderIds.has(o)) orphanRequestOrder.set(r.id, o);
  }
  const orphanReturnOrder = new Map<string, string>();
  for (const r of returns) {
    const o = str(r.data.orderId);
    if (o && !orderIds.has(o)) orphanReturnOrder.set(r.id, o);
  }
  for (const row of ledger) {
    if (str(row.data.orderId)) continue;
    const requestId = str(row.data.requestId);
    const returnId = str(row.data.returnId);
    const viaRequest = requestId ? orphanRequestOrder.get(requestId) : undefined;
    const viaReturn = returnId ? orphanReturnOrder.get(returnId) : undefined;
    const orderId = viaRequest ?? viaReturn;
    if (!orderId) continue;
    references.push({
      collection: "rewardTransactions", docId: row.id, orderId, category: "points",
      via: viaRequest ? "requestId" : "returnId", facts: factsFor("rewardTransactions", row.data),
    });
  }

  // ---- per-order roll-up ----
  const missing = [...new Set(references.map((r) => r.orderId))].sort();
  const orphanOrders: OrphanOrder[] = missing.map((orderId) => {
    const refs = references.filter((r) => r.orderId === orderId);
    const counts: Record<string, number> = {};
    for (const r of refs) {
      const key = r.via === "requestId" || r.via === "returnId" ? `${r.collection} (via ${r.via})` : r.collection;
      counts[key] = (counts[key] || 0) + 1;
    }
    const times = refs.map((r) => r.facts.createdAt).filter((t): t is string => typeof t === "string").sort();
    return {
      orderId,
      categories: [...new Set(refs.map((r) => r.category))].sort() as RefCategory[],
      references: counts,
      pointsNet: refs.filter((r) => r.collection === "rewardTransactions").reduce((s, r) => s + Number(r.facts.signed || 0), 0),
      refundsCredited: refs
        .filter((r) => (r.collection === "itemRequests" && r.facts.refundCredited === true) || (r.collection === "returns" && r.facts.pointsCredited === true))
        .reduce((s, r) => s + Number(r.facts.refundAmount || 0), 0),
      sellerEarningsRecorded: refs.filter((r) => r.collection === "sellerOrders").reduce((s, r) => s + Number(r.facts.vendorEarning || 0), 0),
      couponCodes: [...new Set(refs.filter((r) => r.collection === "couponRedemptions").map((r) => String(r.facts.code || "")))],
      earliestReferenceAt: times[0] ?? null,
      latestReferenceAt: times[times.length - 1] ?? null,
    };
  });

  const byCategory = { points: 0, seller: 0, returns: 0, coupon: 0, audit: 0, payment: 0, delivery: 0, other: 0 } as Record<RefCategory, number>;
  for (const r of references) byCategory[r.category]++;
  const points = { earned: 0, redeemed: 0, refunded: 0, cancelRestored: 0, cancelReversed: 0, other: 0 };
  for (const r of references) {
    if (r.collection !== "rewardTransactions") continue;
    points[pointsClass({ kind: r.facts.kind, type: r.facts.type })] += Math.abs(Number(r.facts.signed || 0));
  }

  return {
    generatedAt: now.toISOString(),
    readOnly: true,
    orders: { total: orders.length, archived: orders.filter((o) => o.data.archived === true).length },
    collections,
    missingOrderIds: missing,
    orphanOrders,
    references,
    totals: {
      orphanOrderIds: missing.length,
      orphanReferences: references.length,
      byCategory,
      points,
      sellerEarningsRecorded: orphanOrders.reduce((s, o) => s + o.sellerEarningsRecorded, 0),
      refundsCreditedAmount: orphanOrders.reduce((s, o) => s + o.refundsCredited, 0),
      couponClaims: references.filter((r) => r.collection === "couponRedemptions").length,
      unmatchedPayments: unmatched.length,
    },
  };
}

export function formatOrphanOrderReport(report: OrphanOrderReport): string {
  const lines: string[] = [];
  lines.push("YOMICO orphan order reconciliation — READ-ONLY (no writes were performed)");
  lines.push(`Generated: ${report.generatedAt}   Orders: ${report.orders.total} (archived: ${report.orders.archived})`);
  lines.push("");
  lines.push("Collection                 category  scanned  with-ref  valid  ORPHAN  not-verifiable");
  for (const c of report.collections) {
    lines.push(`${c.collection.padEnd(26)} ${c.category.padEnd(9)} ${String(c.scanned).padStart(7)} ${String(c.withReference).padStart(9)} ${String(c.valid).padStart(6)} ${String(c.orphan).padStart(7)} ${String(c.notVerifiable).padStart(15)}`);
  }
  lines.push("");
  lines.push(`Missing order ids: ${report.totals.orphanOrderIds}   Orphan references: ${report.totals.orphanReferences}`);
  for (const o of report.orphanOrders) {
    lines.push(`  ${o.orderId}`);
    lines.push(`    categories=${o.categories.join(",")}  references=${JSON.stringify(o.references)}`);
    lines.push(`    pointsNet=${o.pointsNet}  refundsCredited=${o.refundsCredited}  sellerEarningsRecorded=${o.sellerEarningsRecorded}${o.couponCodes.length ? `  coupons=${o.couponCodes.join(",")}` : ""}  span=${o.earliestReferenceAt ?? "?"} .. ${o.latestReferenceAt ?? "?"}`);
  }
  lines.push("");
  lines.push("References:");
  for (const r of report.references) {
    lines.push(`  [${r.category}] ${r.collection}/${r.docId} -> ${r.orderId} (via ${r.via}) ${JSON.stringify(r.facts)}`);
  }
  lines.push("");
  const t = report.totals;
  lines.push("Totals (separate figures — not summed):");
  lines.push(`  references by category: ${JSON.stringify(t.byCategory)}`);
  lines.push(`  points on orphan ledger rows: ${JSON.stringify(t.points)}`);
  lines.push(`  seller earnings recorded on orphan seller records: ${t.sellerEarningsRecorded}`);
  lines.push(`  credited refund amounts on orphan return records: ${t.refundsCreditedAmount}`);
  lines.push(`  coupon claims on missing orders: ${t.couponClaims}`);
  lines.push(`  unmatchedPayments (captured payments with no order, by design): ${t.unmatchedPayments}`);
  return lines.join("\n");
}

// ---- CLI: only when executed directly (the tests import the functions) ----
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/test/reconciliation/orphan-orders-report.ts")) {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--json");
  if (unknown.length) {
    console.error(`REFUSING TO RUN: unknown argument(s) ${unknown.join(" ")}. This report is read-only; the only option is --json.`);
    process.exit(2);
  }
  if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.ALLOW_PRODUCTION !== "yes") {
    console.error("REFUSING TO RUN: not the local emulator. Set ALLOW_PRODUCTION=yes to read a real project (this report never writes).");
    process.exit(2);
  }
  (async () => {
    const { getAdminDb } = await import("../../../lib/firebaseAdmin");
    const report = await runOrphanOrderReport(getAdminDb());
    console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatOrphanOrderReport(report));
    process.exit(0);
  })().catch((error) => {
    console.error("orphan order report failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
