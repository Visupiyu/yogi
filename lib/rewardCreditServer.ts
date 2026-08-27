import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import {
  evaluateRewardCredit,
  type RewardCreditOrder,
  type RewardCreditReturn,
  type RewardIneligibleReason,
} from "@/lib/rewardCredit";

// ---------------------------------------------------------------------------
// The one function that actually moves reward points onto a balance.
//
// Extracted from app/api/credit-reward-points so the scheduled sweep
// (app/api/cron/credit-reward-points) can call the SAME code rather than
// reimplementing it. There is deliberately no second credit path: both routes
// are thin wrappers — one authenticates a customer, the other authenticates a
// cron secret — and both end up here.
//
// lib/rewardCredit.ts remains the single source of truth for WHETHER an order
// qualifies; this module only performs the write, atomically and idempotently.
// ---------------------------------------------------------------------------

/** The `returns` document id app/api/request-return writes. Deterministic, so
 *  it can be READ inside a transaction — transactions cannot run queries. */
export function returnIdFor(uid: string, orderId: string): string {
  return `${uid}_${orderId}`;
}

export type CreditResult =
  | { orderId: string; credited: true; points: number }
  | {
      orderId: string;
      credited: false;
      reason: RewardIneligibleReason | "not-found";
    };

/**
 * Who is asking. A customer route passes their own uid and isAdmin from the
 * verified token; the scheduled sweep passes `{ uid: null, isAdmin: true }`
 * because it runs as the system and owns no single account.
 */
export type CreditCaller = {
  uid: string | null;
  isAdmin: boolean;
};

/**
 * Credits one order, atomically and idempotently.
 *
 * The whole decision is re-made inside the transaction against freshly read
 * documents — order status, payment status, the delivery date the window is
 * measured from, and the order's return document. Nothing is taken from the
 * caller beyond the order id.
 *
 * Two concurrent invocations both read rewardPointsStatus; whichever commits
 * first flips it to "credited", and Firestore aborts and retries the other,
 * which then sees "credited" and stops. A page refresh, a duplicate request, a
 * retried job, a repeated delivery update and two overlapping cron runs all
 * converge on exactly one credit.
 */
export async function creditOneOrder(
  orderId: string,
  caller: CreditCaller
): Promise<CreditResult> {
  const db = getAdminDb();

  const outcome = await db.runTransaction<CreditResult>(async (tx) => {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await tx.get(orderRef);

    if (!orderSnap.exists) {
      return { orderId, credited: false, reason: "not-found" };
    }

    const order = orderSnap.data() as RewardCreditOrder & { userId?: unknown };
    const ownerUid = typeof order.userId === "string" ? order.userId : null;

    // Same message for "not yours" as for "does not exist", so this cannot be
    // used to probe which order ids are real.
    if (!ownerUid || (!caller.isAdmin && ownerUid !== caller.uid)) {
      return { orderId, credited: false, reason: "not-found" };
    }

    const returnSnap = await tx.get(
      db.collection("returns").doc(returnIdFor(ownerUid, orderId))
    );
    const returnRecord: RewardCreditReturn = returnSnap.exists
      ? (returnSnap.data() as { status?: unknown })
      : null;

    const verdict = evaluateRewardCredit(order, returnRecord);

    if (!verdict.eligible) {
      return { orderId, credited: false, reason: verdict.reason };
    }

    const userRef = db.collection("users").doc(ownerUid);
    const userSnap = await tx.get(userRef);
    const balance = Number(userSnap.data()?.rewardPoints || 0);

    tx.set(
      userRef,
      { rewardPoints: balance + verdict.points },
      { merge: true }
    );

    tx.update(orderRef, {
      rewardPointsStatus: "credited",
      rewardPointsCreditedAt: Timestamp.now(),
      rewardPointsCredited: verdict.points,
    });

    return { orderId, credited: true, points: verdict.points };
  });

  // ---- Best-effort, outside the transaction. The balance has already moved
  // and must not be rolled back over a ledger write, exactly as the order
  // creation paths treat their own ledger rows.
  if (outcome.credited) {
    try {
      const orderSnap = await db.collection("orders").doc(orderId).get();
      const order = orderSnap.data() || {};

      // Deterministic id rather than add(), so a retry of this write cannot
      // produce a second "Earned" row for the same order. Matches the
      // deterministic-id idempotency the order and return paths already use.
      await db
        .collection("rewardTransactions")
        .doc(`earned_${orderId}`)
        .set({
          userId:
            typeof order.userId === "string" ? order.userId : caller.uid,
          userEmail:
            typeof order.userEmail === "string" ? order.userEmail : null,
          type: "Earned",
          points: outcome.points,
          orderTotal: Number(order.finalTotal || 0),
          orderId,
          createdAt: Timestamp.now(),
        });
    } catch (error) {
      console.error("creditOneOrder: ledger write failed:", error);
    }
  }

  return outcome;
}
