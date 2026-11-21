import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QuerySnapshot,
  Transaction,
} from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Server-side "may this seller sell right now?" — the one check every order
// creation path runs over EVERY seller represented in the cart.
//
// Blocking a seller deliberately does not touch their products' active /
// approvalStatus flags (so unblocking needs no product clean-up), which means
// isProductVisible() alone still lets a blocked seller's listings through.
// This closes that gap on the server, independently of what the storefront
// hides.
//
// Only "Approved" may sell. Every lookup mismatch fails CLOSED:
//   - a product with no vendorId                       -> not approved
//   - no vendors document whose `uid` is that vendorId -> not approved
//     (vendors doc ids are auto-ids, NOT the uid — see firestore.rules)
//   - several vendors documents for one uid: ALL must be Approved (and more
//     than MAX_SELLER_RECORDS of them is refused outright, never sampled)
//   - a legacy vendors/{uid} document (doc id == uid) is also consulted
//   - the vendors_public/{uid} mirror, when it carries a status, must agree.
//     app/admin/vendors writes vendors then vendors_public as two separate
//     writes, so a half-applied block must not leave the seller sellable.
//
// Pass `tx` to run the reads inside the order transaction: the Admin SDK's
// transactions lock what they read, so a block committed concurrently either
// lands before the read (order refused) or waits for / retries the order.
// ---------------------------------------------------------------------------

export const SELLER_NOT_APPROVED_MESSAGE =
  "Some items in your cart are from a seller who is not accepting orders right now. Please remove them and try again.";

type Reader = {
  doc(ref: DocumentReference): Promise<DocumentSnapshot>;
  query(q: Query): Promise<QuerySnapshot>;
};

function readerFor(tx?: Transaction): Reader {
  if (tx) {
    return { doc: (ref) => tx.get(ref), query: (q) => tx.get(q) };
  }
  return { doc: (ref) => ref.get(), query: (q) => q.get() };
}

function statusOf(data: unknown): string {
  const s = (data as { status?: unknown } | undefined)?.status;
  return typeof s === "string" ? s : "";
}

/** A vendorId as stored on a product; anything else is treated as missing. */
export function sellerIdOf(product: unknown): string {
  const v = (product as { vendorId?: unknown } | undefined)?.vendorId;
  return typeof v === "string" ? v.trim() : "";
}

// Real sellers have one vendors record (occasionally a duplicate from a
// retried registration). The query reads one past this bound so that a uid
// with MORE records than can be checked is refused rather than judged on a
// subset — a Blocked record must never be skipped because it sorted late.
const MAX_SELLER_RECORDS = 25;

async function isSellerApproved(db: Firestore, read: Reader, uid: string): Promise<boolean> {
  if (!uid) return false;

  const [byUid, byDocId, mirror] = await Promise.all([
    read.query(db.collection("vendors").where("uid", "==", uid).limit(MAX_SELLER_RECORDS + 1)),
    read.doc(db.collection("vendors").doc(uid)),
    read.doc(db.collection("vendors_public").doc(uid)),
  ]);

  if (byUid.size > MAX_SELLER_RECORDS) return false;

  const records = byUid.docs.map((d) => d.data());
  if (byDocId.exists && !byUid.docs.some((d) => d.id === byDocId.id)) {
    const legacyUid = byDocId.data()?.uid;
    // Only a document that is genuinely this seller's (or carries no uid at
    // all) counts; one owned by somebody else is a mismatch, not a record.
    if (legacyUid === undefined || legacyUid === uid) records.push(byDocId.data()!);
  }

  if (records.length === 0) return false;
  if (!records.every((r) => statusOf(r) === "Approved")) return false;

  if (mirror.exists) {
    const mirrorStatus = statusOf(mirror.data());
    if (mirrorStatus && mirrorStatus !== "Approved") return false;
  }
  return true;
}

/**
 * The distinct seller ids of `vendorIds` that may NOT sell. Empty means every
 * seller is Approved. A missing id ("") is reported as "" so the caller still
 * refuses the order.
 */
export async function findUnapprovedSellers(
  db: Firestore,
  vendorIds: readonly string[],
  tx?: Transaction
): Promise<string[]> {
  const read = readerFor(tx);
  const unique = [...new Set(vendorIds.map((v) => (typeof v === "string" ? v.trim() : "")))];
  const verdicts = await Promise.all(unique.map((uid) => isSellerApproved(db, read, uid)));
  return unique.filter((_, i) => !verdicts[i]);
}
