// The single rule for WHEN an order's reward points become earned.
//
// Points used to be credited the moment an order was created, which meant a
// customer could place an order, spend the points immediately, and then
// cancel or return it. The balance now moves only once the order is genuinely
// settled: delivered, paid for, and past the return window with no return
// outstanding.
//
// Deliberately dependency-free — no Firebase import of any kind — exactly like
// lib/returnEligibility.ts and lib/orderTracking.ts, so the decision can be
// unit-tested directly and reused anywhere. The authority is
// app/api/credit-reward-points, which re-reads the order server-side and calls
// this; nothing here trusts a client.

import {
  returnWindowEndsAt,
  type ReturnWindowOrder,
} from "./returnEligibility";

/**
 * Marks how far an order has got through the deferred-credit lifecycle.
 *
 * Orders written before this rule existed carry NO value at all, and that
 * absence is meaningful: they were credited at creation under the old rule
 * and must never be credited a second time. See evaluateRewardCredit.
 */
export type RewardPointsStatus = "pending" | "credited";

export type RewardCreditOrder = ReturnWindowOrder & {
  status?: unknown;
  paymentStatus?: unknown;
  finalTotal?: unknown;
  rewardPointsStatus?: unknown;
};

/** The order's `returns` document, or null when it has none. */
export type RewardCreditReturn = {
  status?: unknown;
} | null;

export type RewardIneligibleReason =
  /** Written before deferred crediting existed — already paid out at creation. */
  | "legacy-order"
  | "already-credited"
  | "not-delivered"
  | "payment-not-completed"
  | "return-unresolved"
  | "return-refunded"
  | "return-window-open"
  | "return-window-unknown"
  | "no-points";

export type RewardEligibility =
  | { eligible: true; points: number }
  | { eligible: false; reason: RewardIneligibleReason };

/**
 * Points an order is worth.
 *
 * Unchanged from what the order paths already awarded — the same
 * `Math.floor(finalTotal / 100)` that lib/orderPricing.ts computes at
 * creation and app/api/cancel-order recomputes when reversing. Only WHEN the
 * points arrive has changed, never how many.
 */
export function earnedPointsFor(finalTotal: unknown): number {
  const total = Number(finalTotal || 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.floor(total / 100);
}

/**
 * Return statuses that leave the customer holding a completed order.
 *
 * "Rejected" is the only resolution that does — the return was refused, so the
 * customer keeps the goods and the order is genuinely complete. "Pending" and
 * "Approved" are still in flight, and "Refunded" means the money went back.
 */
function returnBlocks(
  returnRecord: RewardCreditReturn
): RewardIneligibleReason | null {
  const status =
    typeof returnRecord?.status === "string" ? returnRecord.status : null;

  if (!status) return null;
  if (status === "Rejected") return null;
  if (status === "Refunded") return "return-refunded";

  // "Pending", "Approved", and anything unrecognised: treat as unresolved
  // rather than guessing in the customer's or the platform's favour.
  return "return-unresolved";
}

/**
 * Whether this order's points may be credited right now, and how many.
 *
 * Every condition is evaluated against stored order data. The caller must have
 * read both documents server-side; nothing here is client-supplied.
 */
export function evaluateRewardCredit(
  order: RewardCreditOrder,
  returnRecord: RewardCreditReturn = null,
  now: Date = new Date()
): RewardEligibility {

  // Checked first so a retry, a double-click or a duplicate job costs one
  // comparison and stops.
  if (order?.rewardPointsStatus === "credited") {
    return { eligible: false, reason: "already-credited" };
  }

  // The absence of the field is not "pending". Every order placed before this
  // change already had its points credited at creation, and crediting those
  // again would hand out a second payout for every historical order in the
  // database. Only orders explicitly opted in by the new creation paths are
  // ever eligible.
  if (order?.rewardPointsStatus !== "pending") {
    return { eligible: false, reason: "legacy-order" };
  }

  if (order?.status !== "Delivered") {
    return { eligible: false, reason: "not-delivered" };
  }

  // "Paid" is the existing shared success marker for both payment methods —
  // ONLINE sets it at capture (lib/onlineOrder.ts) and Pay-at-delivery reaches
  // it through the delivery partner's reference plus admin verification
  // (lib/deliveryPayment.ts, lib/payAtDelivery.ts). No new payment state.
  if (order?.paymentStatus !== "Paid") {
    return { eligible: false, reason: "payment-not-completed" };
  }

  const blocked = returnBlocks(returnRecord);
  if (blocked) return { eligible: false, reason: blocked };

  // lib/returnEligibility.ts owns the 7-day definition. Reused, never
  // re-derived — a second copy could drift and start paying out during a
  // window the return route still considers open.
  const endsAt = returnWindowEndsAt(order);

  // Fail CLOSED, which is the opposite of isWithinReturnWindow(). That helper
  // fails OPEN because refusing a real customer's return over a missing date
  // is the worse outcome; here the risk runs the other way — paying out early
  // on an order whose window cannot even be established — so an unknown basis
  // withholds the credit and leaves it for an admin.
  if (!endsAt) {
    return { eligible: false, reason: "return-window-unknown" };
  }

  if (now.getTime() <= endsAt.getTime()) {
    return { eligible: false, reason: "return-window-open" };
  }

  const points = earnedPointsFor(order.finalTotal);
  if (points <= 0) {
    return { eligible: false, reason: "no-points" };
  }

  return { eligible: true, points };
}

/**
 * Whether cancelling or refunding this order should take reward points back.
 *
 * Only an order that actually received its points has anything to reverse.
 * Under deferred crediting most cancellations happen while the order is still
 * "pending", and deducting there would confiscate points the customer earned
 * on entirely unrelated orders.
 *
 * Legacy orders (no status field) were credited at creation, so they are still
 * reversed — that behaviour must not regress.
 */
export function shouldReverseEarnedPoints(
  order: RewardCreditOrder
): boolean {
  if (order?.rewardPointsStatus === "credited") return true;
  if (order?.rewardPointsStatus === "pending") return false;

  // Absent — placed before deferred crediting, so the points were granted up
  // front and must come back.
  return true;
}
