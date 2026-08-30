/**
 * One-time backfill of human-readable numbers onto EXISTING records that
 * predate the numbering system. See lib/humanIds.ts for the scheme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DO NOT RUN THIS AGAINST PRODUCTION WITHOUT EXPLICIT APPROVAL.
 *  It is DRY-RUN by default: it prints what it WOULD assign and writes nothing.
 *  Pass `--apply` to actually write. Point it at the emulator first
 *  (FIRESTORE_EMULATOR_HOST=127.0.0.1:8080) to rehearse.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Safety / correctness notes:
 *  - Idempotent: a record that already has its number is skipped, so the
 *    script can be re-run without double-assigning.
 *  - Order matters: records are processed in createdAt order so the assigned
 *    sequence follows real chronology.
 *  - Counters: the live `counters` documents are advanced as it assigns, so new
 *    records created after the backfill continue from where the backfill left
 *    off — no collisions with runtime minting. Run during a quiet window.
 *  - Daily numbers (order/invoice) are grouped by their own day so each day's
 *    sequence is contiguous, matching runtime behaviour.
 *  - Document IDs are NEVER changed. These are additive display fields only.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/backfill-numbers.ts
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/backfill-numbers.ts --apply
 */

// This script runs via `tsx`, not through Next. It resolves getAdminDb and the
// humanIds helpers at runtime with require() (below) so it stays out of the
// Next build graph.

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { getAdminDb } = require("@/lib/firebaseAdmin");
  const {
    formatSequential,
    formatDaily,
    orderDateKey,
    invoiceDateKey,
  } = require("@/lib/humanIds");
  const db = getAdminDb();

  const log = (msg: string) => console.log(`${APPLY ? "[APPLY]" : "[DRY] "} ${msg}`);
  log(
    APPLY
      ? "WRITING numbers to Firestore."
      : "DRY-RUN — no writes. Pass --apply to write."
  );

  // In-memory counter high-water marks, seeded from the live counters so the
  // backfill continues the same sequences runtime minting uses.
  const seqState: Record<string, number> = {};
  const dailyState: Record<string, number> = {};

  async function seedSeq(counter: string): Promise<number> {
    if (seqState[counter] === undefined) {
      const snap = await db.collection("counters").doc(counter).get();
      seqState[counter] = snap.exists ? Number(snap.data()?.seq || 0) : 0;
    }
    return seqState[counter];
  }
  async function seedDaily(docId: string): Promise<number> {
    if (dailyState[docId] === undefined) {
      const snap = await db.collection("counters").doc(docId).get();
      dailyState[docId] = snap.exists ? Number(snap.data()?.seq || 0) : 0;
    }
    return dailyState[docId];
  }

  const toDate = (v: any): Date =>
    v?.toDate?.() ?? (v?.seconds ? new Date(v.seconds * 1000) : new Date(0));

  async function commitCounters() {
    if (!APPLY) return;
    for (const [c, seq] of Object.entries(seqState)) {
      await db.collection("counters").doc(c).set({ seq }, { merge: true });
    }
    for (const [d, seq] of Object.entries(dailyState)) {
      await db.collection("counters").doc(d).set({ seq }, { merge: true });
    }
  }

  // ---- sequential entities ----
  async function backfillSequential(opts: {
    collection: string;
    field: string;
    counter: string;
    // only rows matching this get a number (e.g. only confirmed orders)
    predicate?: (data: any) => boolean;
    typeCounter?: (data: any) => string; // for return/replacement split
  }) {
    const snap = await db.collection(opts.collection).get();
    const rows = snap.docs
      .map((d: any) => ({ ref: d.ref, id: d.id, data: d.data() }))
      .filter((r: any) => !r.data[opts.field])
      .filter((r: any) => (opts.predicate ? opts.predicate(r.data) : true))
      .sort(
        (a: any, b: any) =>
          toDate(a.data.createdAt).getTime() - toDate(b.data.createdAt).getTime()
      );
    let assigned = 0;
    for (const r of rows) {
      const counter = opts.typeCounter ? opts.typeCounter(r.data) : opts.counter;
      const next = (await seedSeq(counter)) + 1;
      seqState[counter] = next;
      const value = formatSequential(counter, next);
      log(`${opts.collection}/${r.id} .${opts.field} = ${value}`);
      if (APPLY) await r.ref.update({ [opts.field]: value });
      assigned++;
    }
    log(`${opts.collection}: ${assigned} ${opts.field} assigned`);
  }

  // ---- daily entities (order/invoice on the orders collection) ----
  async function backfillDaily(opts: {
    field: string;
    kind: "order" | "invoice";
    dateField: string; // which timestamp the day comes from
    predicate?: (data: any) => boolean;
  }) {
    const snap = await db.collection("orders").get();
    const rows = snap.docs
      .map((d: any) => ({ ref: d.ref, id: d.id, data: d.data() }))
      .filter((r: any) => !r.data[opts.field])
      .filter((r: any) => (opts.predicate ? opts.predicate(r.data) : true))
      .sort(
        (a: any, b: any) =>
          toDate(a.data[opts.dateField]).getTime() -
          toDate(b.data[opts.dateField]).getTime()
      );
    let assigned = 0;
    for (const r of rows) {
      const day = toDate(r.data[opts.dateField]);
      const key = opts.kind === "order" ? orderDateKey(day) : invoiceDateKey(day);
      const docId = `${opts.kind}_${key}`;
      const next = (await seedDaily(docId)) + 1;
      dailyState[docId] = next;
      const value = formatDaily(key, next);
      log(`orders/${r.id} .${opts.field} = ${value}`);
      if (APPLY) await r.ref.update({ [opts.field]: value });
      assigned++;
    }
    log(`orders: ${assigned} ${opts.field} assigned`);
  }

  // Orders: orderNumber + paymentNumber for all; invoice/shipment for confirmed.
  await backfillDaily({ field: "orderNumber", kind: "order", dateField: "createdAt" });
  await backfillSequential({ collection: "orders", field: "paymentNumber", counter: "payment" });
  await backfillDaily({
    field: "invoiceNumber",
    kind: "invoice",
    dateField: "confirmedAt",
    predicate: (d) => !!d.confirmedAt,
  });
  await backfillSequential({
    collection: "orders",
    field: "shipmentNumber",
    counter: "shipment",
    predicate: (d) => !!d.confirmedAt,
  });

  await backfillSequential({ collection: "vendors", field: "sellerNumber", counter: "seller" });
  await backfillSequential({ collection: "products", field: "productNumber", counter: "product" });
  await backfillSequential({ collection: "withdrawals", field: "payoutNumber", counter: "payout" });

  // itemRequests: requestNumber by type (RET/REP); refundNumber for refunded.
  await backfillSequential({
    collection: "itemRequests",
    field: "requestNumber",
    counter: "return",
    typeCounter: (d) => (d.type === "replace" ? "replacement" : "return"),
  });

  await commitCounters();
  log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
