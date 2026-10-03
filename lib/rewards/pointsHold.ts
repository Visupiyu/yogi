// SERVER-ONLY (Admin SDK). Reserves a customer's points for ONE unpaid online
// payment, so two payment sessions cannot both be priced against the same
// balance. An online order is only created — and its points only deducted —
// when Razorpay confirms payment (lib/onlineOrder), long after the discount
// was priced; without a reserve, two open checkouts could both finalize and
// the second would be a discount paid for with points that no longer exist.
//
// pointsHolds/{uid} is written with the Admin SDK into a collection no client
// rule matches (default-deny). One hold per customer. It carries no balance:
// the balance stays users/{uid}.rewardPoints, moved only by lib/points. A hold
// ends when the payment finalizes (lib/onlineOrder deletes it in the order
// transaction), when checkout releases it (modal dismissed, payment could not
// start), or on its own at expiresAt — it can never strand points.
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { isRewardsEligible } from "@/lib/rewards/eligibility";
import {
  REWARD_BALANCE_CHANGED_MESSAGE,
  REWARD_HOLD_ACTIVE_MESSAGE,
  REWARD_HOLD_TTL_MS,
  REWARD_NOT_ELIGIBLE_MESSAGE,
  activeHeldPoints,
  spendablePoints,
} from "@/lib/rewards/redemption";

export const pointsHoldRef = (db: Firestore, uid: string) => db.collection("pointsHolds").doc(uid);

export type HoldResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Reserves `points` for the customer, in one transaction against the live
 * balance. Refused when another unexpired hold exists, when the customer is not
 * Rewards-eligible, or when the balance no longer covers `points`.
 */
export async function claimPointsHold(db: Firestore, uid: string, points: number): Promise<HoldResult> {
  return db.runTransaction<HoldResult>(async (tx) => {
    const [userSnap, holdSnap] = await Promise.all([
      tx.get(db.collection("users").doc(uid)),
      tx.get(pointsHoldRef(db, uid)),
    ]);
    const now = Date.now();
    if (!isRewardsEligible(userSnap.exists ? userSnap.data() : null)) {
      return { ok: false, status: 403, error: REWARD_NOT_ELIGIBLE_MESSAGE };
    }
    const held = activeHeldPoints(holdSnap.exists ? holdSnap.data() : null, now);
    if (held > 0) return { ok: false, status: 409, error: REWARD_HOLD_ACTIVE_MESSAGE };
    if (points > spendablePoints(userSnap.data()?.rewardPoints, 0)) {
      return { ok: false, status: 409, error: REWARD_BALANCE_CHANGED_MESSAGE };
    }
    tx.set(pointsHoldRef(db, uid), {
      uid,
      points,
      razorpayOrderId: null,
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + REWARD_HOLD_TTL_MS),
    });
    return { ok: true };
  });
}

/** Records which Razorpay order owns the customer's hold (set after it exists). */
export async function bindPointsHold(db: Firestore, uid: string, razorpayOrderId: string): Promise<void> {
  await pointsHoldRef(db, uid).set({ razorpayOrderId }, { merge: true });
}

/**
 * Releases the customer's hold. With `razorpayOrderId`, only a hold bound to
 * that payment is released; without it, any hold the customer owns (payment
 * could not start). Returns whether a hold was deleted.
 */
export async function releasePointsHold(
  db: Firestore,
  uid: string,
  razorpayOrderId?: string
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const ref = pointsHoldRef(db, uid);
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    if (razorpayOrderId && snap.get("razorpayOrderId") !== razorpayOrderId) return false;
    tx.delete(ref);
    return true;
  });
}
