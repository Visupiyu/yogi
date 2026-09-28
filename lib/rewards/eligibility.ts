// YOMICO Rewards eligibility — who may REDEEM reward products.
//
// A customer becomes Rewards-eligible only by completing their first
// qualifying YOMICO purchase. Points alone, referrals, a referral code or an
// account prove nothing: a referral-only customer can hold any balance and
// stay ineligible.
//
// The proof is a server-owned stamp on users/{uid}:
//   rewardsEligibleAt       Timestamp — when the first qualifying purchase
//                           completed (the moment lib/rewardCreditServer
//                           credited it; for legacy orders, the backfill's
//                           return-window close)
//   rewardsEligibleOrderId  the order that established it
//
// Written ONLY by lib/rewardCreditServer.creditOneOrder, inside the same
// transaction that credits that order's purchase points (so a qualifying
// purchase is exactly "an order lib/rewardCredit.evaluateRewardCredit found
// eligible": Delivered, Paid, return window closed, no open return, and at
// least ₹100 left after refunds — i.e. at least 1 point), and by the reviewed
// legacy backfill (scripts/migrations/rewards-eligibility-backfill.ts).
// firestore.rules deny it to every client, admin included. Application code
// never clears or replaces it: the first qualifying order is kept forever.
//
// Pure (no Firebase import): callers pass the users/{uid} document they read
// server-side for the VERIFIED uid. Nothing from a request — body, headers,
// query, rewardValue, points, uid, email or any "eligible" flag — is ever an
// input here.

export const REWARDS_ELIGIBLE_AT = "rewardsEligibleAt";
export const REWARDS_ELIGIBLE_ORDER_ID = "rewardsEligibleOrderId";

type TimestampLike = { toMillis?: () => number };

/** Epoch ms of the stamp, or null when absent or not a timestamp. */
export function rewardsEligibleAtMs(user: unknown): number | null {
  if (!user || typeof user !== "object") return null;
  const value = (user as Record<string, unknown>)[REWARDS_ELIGIBLE_AT] as TimestampLike | null | undefined;
  const ms = value?.toMillis?.();
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

/**
 * Whether this customer may redeem reward products. `user` is the trusted
 * users/{uid} document (or null when it does not exist). Absent stamp = not
 * eligible.
 */
export function isRewardsEligible(user: unknown): boolean {
  return rewardsEligibleAtMs(user) !== null;
}

/**
 * The fields that establish eligibility from `orderId` at `at`, or null when
 * the customer is already eligible — the original stamp is never replaced.
 */
export function eligibilityStampFor<T>(
  user: unknown,
  orderId: string,
  at: T
): { rewardsEligibleAt: T; rewardsEligibleOrderId: string } | null {
  if (isRewardsEligible(user)) return null;
  return { rewardsEligibleAt: at, rewardsEligibleOrderId: orderId };
}
