import {
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { referrerLedgerId, welcomeLedgerId } from "@/lib/referrals";

// ---------------------------------------------------------------------------
// YOMICO Points — the ONE place a points balance moves. SERVER-ONLY (Admin
// SDK; never import from a client component).
//
// users/{uid}.rewardPoints stays the authoritative balance (checkout spends
// it). Every change to it now goes through applyPointsMovements(), inside the
// caller's own Firestore transaction, which:
//   - computes each movement against the balance read IN that transaction;
//   - never lets the balance go below zero — a debit larger than the balance
//     applies what exists and records the rest as an explicit `shortfall`
//     (or, where a shortfall is not allowed, throws and the whole transaction
//     rolls back);
//   - writes the ledger row with tx.create() on a FIXED id, so the row and
//     the balance commit or fail together. A row that already exists fails
//     the transaction (ALREADY_EXISTS) instead of being skipped, so a state
//     the caller's own guard did not catch surfaces loudly rather than moving
//     the source record without its money.
//
// Replays are stopped by each caller's own state check, read in the same
// transaction (rewardPointsStatus, the payment-intent claim, "Cancelled",
// refund.credited, pointsCredited, the referral settled check); the fixed id
// is the backstop.
//
// Ledger rows keep every legacy field (userId, userEmail, type, points,
// orderId/requestId/returnId, createdAt) so existing readers keep working, and
// add v: 2, kind, delta (signed, what was actually applied), requested,
// shortfall (only when > 0), balanceBefore and balanceAfter. `points` is the
// magnitude actually applied, so legacy readers agree with the balance.
// ---------------------------------------------------------------------------

export type PointsMovementKind =
  | "purchase_earned"
  | "referral_welcome"
  | "referral_referrer"
  | "checkout_redeem"
  | "cancel_restore"
  | "cancel_reverse"
  | "refund_item"
  | "refund_return"
  | "adjustment"
  | "opening_balance";

/** The legacy `type` label each kind is written with (what older readers use). */
export const LEGACY_LEDGER_TYPE: Record<PointsMovementKind, string> = {
  purchase_earned: "Earned",
  referral_welcome: "Referral Bonus",
  referral_referrer: "Referral Bonus",
  checkout_redeem: "Redeemed",
  cancel_restore: "Cancelled - Points Restored",
  cancel_reverse: "Cancelled - Points Reversed",
  refund_item: "Refund",
  refund_return: "Refund",
  adjustment: "Adjustment",
  opening_balance: "Opening Balance",
};

/** Fixed ledger ids — one movement of each kind per source record. */
export const pointsLedgerId = {
  earned: (orderId: string) => `earned_${orderId}`,
  redeem: (orderId: string) => `redeem_${orderId}`,
  cancelRestore: (orderId: string) => `cancelrestore_${orderId}`,
  cancelReverse: (orderId: string) => `cancelreverse_${orderId}`,
  refundItem: (requestId: string) => `refunditem_${requestId}`,
  refundReturn: (returnId: string) => `refundreturn_${returnId}`,
  referralWelcome: (newUid: string) => welcomeLedgerId(newUid),
  referralReferrer: (newUid: string) => referrerLedgerId(newUid),
};

export type PointsMovement = {
  kind: PointsMovementKind;
  /** Fixed ledger document id (see pointsLedgerId). */
  id: string;
  /** Signed points: positive credits, negative debits. 0 writes nothing. */
  requested: number;
  /** Debit only: apply what exists and record the rest as `shortfall`. */
  allowShortfall?: boolean;
  refs?: { orderId?: string; requestId?: string; returnId?: string };
  /** Extra legacy-compatible fields for the row (e.g. orderTotal). */
  extra?: Record<string, unknown>;
};

export type PointsAccount = {
  ref: DocumentReference;
  /** users/{uid} as read in THIS transaction. */
  snap: DocumentSnapshot;
  uid: string;
  email: string | null;
  /**
   * How the balance is written, preserving each path's existing behaviour:
   * "merge" (set with merge — creates a missing profile) or "update" (fails
   * the transaction if the profile is missing).
   */
  write: "merge" | "update";
  /** Other fields written in the SAME user write (one write per document). */
  userFields?: Record<string, unknown>;
};

export type AppliedPointsMovement = {
  id: string;
  kind: PointsMovementKind;
  requested: number;
  delta: number;
  shortfall: number;
  balanceBefore: number;
  balanceAfter: number;
};

export class PointsShortfallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PointsShortfallError";
  }
}

/** The stored balance as every existing path reads it: non-finite or negative is 0. */
export function storedPointsBalance(snap: DocumentSnapshot): number {
  const n = Number(snap.exists ? snap.get("rewardPoints") : 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Pure calculation of a sequence of movements against a starting balance —
 * exported for tests. Throws PointsShortfallError for a debit that exceeds
 * the balance when a shortfall is not allowed.
 */
export function planPointsMovements(
  startBalance: number,
  movements: PointsMovement[]
): AppliedPointsMovement[] {
  let balance = startBalance;
  const out: AppliedPointsMovement[] = [];
  for (const m of movements) {
    const requested = Number(m.requested);
    if (!Number.isFinite(requested)) throw new Error(`points movement ${m.id}: invalid amount`);
    if (requested === 0) continue;
    const balanceBefore = balance;
    let delta = requested;
    let shortfall = 0;
    if (requested < 0) {
      const wanted = -requested;
      const available = Math.min(wanted, balanceBefore);
      shortfall = wanted - available;
      if (shortfall > 0 && !m.allowShortfall) {
        throw new PointsShortfallError(`points movement ${m.id}: balance ${balanceBefore} is below ${wanted}`);
      }
      delta = available === 0 ? 0 : -available;
    }
    balance = balanceBefore + delta;
    out.push({ id: m.id, kind: m.kind, requested, delta, shortfall, balanceBefore, balanceAfter: balance });
  }
  return out;
}

/**
 * Applies movements for ONE account inside the caller's transaction: one
 * ledger row per movement (tx.create, fixed id) and one balance write. Must be
 * called in the transaction's write phase (it performs no reads).
 */
export function applyPointsMovements(
  tx: Transaction,
  db: Firestore,
  account: PointsAccount,
  movements: PointsMovement[]
): { balanceBefore: number; balanceAfter: number; applied: AppliedPointsMovement[] } {
  const balanceBefore = storedPointsBalance(account.snap);
  const applied = planPointsMovements(balanceBefore, movements);
  const balanceAfter = applied.length ? applied[applied.length - 1].balanceAfter : balanceBefore;
  const now = Timestamp.now();

  for (const a of applied) {
    const m = movements.find((x) => x.id === a.id)!;
    tx.create(db.collection("rewardTransactions").doc(a.id), {
      userId: account.uid,
      userEmail: account.email,
      type: LEGACY_LEDGER_TYPE[a.kind],
      points: Math.abs(a.delta),
      ...(m.refs || {}),
      ...(m.extra || {}),
      createdAt: now,
      v: 2,
      kind: a.kind,
      delta: a.delta,
      requested: a.requested,
      ...(a.shortfall > 0 ? { shortfall: a.shortfall } : {}),
      balanceBefore: a.balanceBefore,
      balanceAfter: a.balanceAfter,
    });
  }

  if (applied.length > 0 || account.userFields) {
    const fields = { ...(account.userFields || {}), ...(applied.length > 0 ? { rewardPoints: balanceAfter } : {}) };
    if (account.write === "merge") tx.set(account.ref, fields, { merge: true });
    else tx.update(account.ref, fields);
  }

  return { balanceBefore, balanceAfter, applied };
}
