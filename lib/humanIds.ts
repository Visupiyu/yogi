import type { Firestore, Transaction } from "firebase-admin/firestore";

// Human-readable business numbers for YOMICO.
//
// These are DISPLAY / communication identifiers only — they never replace the
// Firestore document IDs, which stay the keys for relationships, URLs and
// queries. Every number is minted SERVER-SIDE (Admin SDK) inside the creating
// entity's own transaction, from an atomic counter, so concurrent creators can
// never receive the same number and numbers are permanent (never reused).
//
// Counters live in the server-only `counters` collection (firestore.rules
// denies all client access). Each counter document holds `{ seq }`.
//
//   sequential : counters/{seller|product|shipment|return|replacement|
//                refund|payment|payout}
//   daily      : counters/order_DDMMYYYY  and  counters/invoice_YYYYMMDD
//                (date in the doc id ⇒ resets each day, and the two prefixes
//                keep the order and invoice sequences independent)
//
// TRANSACTION RULE: mint* do a read then a write, so they must be called AFTER
// every other tx.get in the caller's transaction and BEFORE (or among) its
// writes — Firestore forbids a read after a write.

export type SeqCounter =
  | "seller"
  | "product"
  | "shipment"
  | "return"
  | "replacement"
  | "refund"
  | "payment"
  | "payout";

const SEQ_FORMAT: Record<SeqCounter, { prefix: string; pad: number }> = {
  seller: { prefix: "SELLER", pad: 5 },
  product: { prefix: "PCT", pad: 6 },
  shipment: { prefix: "TRCK", pad: 6 },
  return: { prefix: "RET", pad: 6 },
  replacement: { prefix: "REP", pad: 6 },
  refund: { prefix: "RFND", pad: 6 },
  payment: { prefix: "PAY", pad: 6 },
  payout: { prefix: "PAYOUT", pad: 6 },
};

export type DailyKind = "order" | "invoice";

/** Fixed 4-digit daily sequence, per the approved scheme. */
export const DAILY_PAD = 4;

/** DDMMYYYY — the order-number date key. */
export function orderDateKey(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

/** YYYYMMDD — the invoice-number date key. */
export function invoiceDateKey(d: Date): string {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/** Format a sequential number: prefix + zero-padded seq. Pure/testable. */
export function formatSequential(counter: SeqCounter, seq: number): string {
  const { prefix, pad } = SEQ_FORMAT[counter];
  return prefix + String(seq).padStart(pad, "0");
}

/** Format a daily number: dateKey + 4-digit seq. Pure/testable. */
export function formatDaily(dateKey: string, seq: number): string {
  return `${dateKey}${String(seq).padStart(DAILY_PAD, "0")}`;
}

function nextSeqFromSnap(exists: boolean, data: unknown): number {
  const current = exists ? Number((data as { seq?: unknown })?.seq) : 0;
  return (Number.isFinite(current) ? current : 0) + 1;
}

/**
 * Mint the next sequential number for `counter`, atomically, inside `tx`.
 * Call after all other reads in the transaction.
 */
export async function mintSequential(
  tx: Transaction,
  db: Firestore,
  counter: SeqCounter
): Promise<string> {
  const ref = db.collection("counters").doc(counter);
  const snap = await tx.get(ref);
  const seq = nextSeqFromSnap(snap.exists, snap.data());
  tx.set(ref, { seq }, { merge: true });
  return formatSequential(counter, seq);
}

/**
 * Mint the next daily number for `kind` on the day of `at`, atomically, inside
 * `tx`. The counter doc is date-scoped, so it resets each day; `order` and
 * `invoice` use different prefixes and never share a sequence.
 * Call after all other reads in the transaction.
 */
export async function mintDaily(
  tx: Transaction,
  db: Firestore,
  kind: DailyKind,
  at: Date
): Promise<string> {
  const key = kind === "order" ? orderDateKey(at) : invoiceDateKey(at);
  const ref = db.collection("counters").doc(`${kind}_${key}`);
  const snap = await tx.get(ref);
  const seq = nextSeqFromSnap(snap.exists, snap.data());
  tx.set(ref, { seq }, { merge: true });
  return formatDaily(key, seq);
}

export type MintSpec =
  | { kind: "seq"; counter: SeqCounter }
  | { kind: "daily"; daily: DailyKind; at: Date };

/**
 * Mint SEVERAL numbers in one transaction correctly.
 *
 * A transaction forbids a read after any write, so calling mintSequential/
 * mintDaily twice (each does get-then-set) is illegal — the second get lands
 * after the first set. This does ALL counter reads first, then ALL writes, so
 * any number of numbers can be minted together. Specs must target DISTINCT
 * counters (two specs on the same counter would both read the same value and
 * collide); every call site here mints distinct counters.
 */
export async function mintNumbers(
  tx: Transaction,
  db: Firestore,
  specs: MintSpec[]
): Promise<string[]> {
  const keys = specs.map((s) =>
    s.kind === "seq"
      ? s.counter
      : `${s.daily}_${s.daily === "order" ? orderDateKey(s.at) : invoiceDateKey(s.at)}`
  );
  const refs = keys.map((k) => db.collection("counters").doc(k));
  const snaps = await Promise.all(refs.map((r) => tx.get(r))); // ALL READS
  return snaps.map((snap, i) => {
    const seq = nextSeqFromSnap(snap.exists, snap.data());
    tx.set(refs[i], { seq }, { merge: true }); // ALL WRITES, after every read
    const spec = specs[i];
    return spec.kind === "seq"
      ? formatSequential(spec.counter, seq)
      : formatDaily(
          spec.daily === "order" ? orderDateKey(spec.at) : invoiceDateKey(spec.at),
          seq
        );
  });
}
