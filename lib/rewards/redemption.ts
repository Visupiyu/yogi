// YOMICO Points — checkout redemption rules. Pure (no Firebase import): shared
// by the server (authoritative) and the checkout page (display only).
//
// 1 point = ₹1. Points pay for MERCHANDISE only: the applied value is capped at
// the post-coupon item subtotal, so points never pay for shipping, and at least
// ₹1 always stays payable (Razorpay's minimum, and it keeps every order a real
// payment — there is no zero-payable order).
//
// YOMICO funds the redemption. The order is stamped rewardFundedBy: "yomico"
// and lib/vendorEarnings.computeVendorShare then leaves rewardValue out of the
// seller's discount share, so a seller's item value, earning and payout basis
// are exactly what they would be without the points. Commission stays ₹0.
//
// Nothing here reads a request: callers pass the balance and the eligibility
// they read server-side for the VERIFIED uid.

/** Stamp on orders whose rewardValue is absorbed by YOMICO, not the seller. */
export const REWARD_FUNDED_BY_YOMICO = "yomico" as const;

/** How long a points hold for an unpaid online intent blocks a second spend. */
export const REWARD_HOLD_TTL_MS = 20 * 60 * 1000;

/** Whole points currently held by an unexpired hold document (0 when none). */
export function activeHeldPoints(hold: unknown, nowMs: number): number {
  if (!hold || typeof hold !== "object") return 0;
  const h = hold as { points?: unknown; expiresAt?: { toMillis?: () => number } | null };
  const points = Number(h.points);
  const expires = h.expiresAt?.toMillis?.();
  if (!Number.isFinite(points) || points <= 0) return 0;
  if (typeof expires !== "number" || !Number.isFinite(expires) || expires <= nowMs) return 0;
  return Math.floor(points);
}

/** Points the customer can spend: stored balance less any active hold, never negative. */
export function spendablePoints(balance: unknown, heldPoints: number): number {
  const b = Number(balance);
  const stored = Number.isFinite(b) && b > 0 ? Math.floor(b) : 0;
  return Math.max(0, stored - Math.max(0, Math.floor(heldPoints || 0)));
}

/**
 * Rupees of points that can be applied to this cart. 0 when not eligible or
 * nothing is spendable. `subtotal`, `couponDiscount` and `shipping` are the
 * server-priced figures.
 */
export function redeemableValue(params: {
  eligible: boolean;
  spendable: number;
  subtotal: number;
  couponDiscount: number;
  shipping: number;
}): number {
  if (!params.eligible) return 0;
  const merchandiseCap = Math.floor(Math.max(0, params.subtotal - params.couponDiscount));
  const keepOneRupee = Math.floor(
    Math.max(0, params.subtotal + params.shipping - params.couponDiscount - 1)
  );
  return Math.max(0, Math.min(Math.floor(params.spendable), merchandiseCap, keepOneRupee));
}

export const REWARD_NOT_ELIGIBLE_MESSAGE =
  "Reward points can be used after your first completed YOMICO purchase of ₹100 or more.";
export const REWARD_NONE_AVAILABLE_MESSAGE = "You have no reward points available to use on this order.";
export const REWARD_HOLD_ACTIVE_MESSAGE =
  "Your reward points are reserved by a payment that is still in progress. Finish it, wait a few minutes, or pay without points.";
export const REWARD_BALANCE_CHANGED_MESSAGE =
  "Your reward point balance has changed — please review your order again.";
