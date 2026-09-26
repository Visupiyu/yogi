// ==========================================
// YOMICO Marketplace
// lib/coupons/couponRules.ts
// ==========================================
//
// THE coupon evaluator. Dependency-free (no Firebase, no server imports), so
// the web pricing pass (lib/orderPricing.ts), both mobile order routes
// (app/api/mobile/place-order, app/api/mobile/create-payment-order) and the web
// checkout preview (app/checkout/page.tsx) all apply exactly the same rules.
// The server is authoritative: every order route re-evaluates the coupon
// document itself and never reads a discount amount from the client.
//
// SUPPORTED COUPON FORMAT — the one app/admin/coupons writes:
//
//   { code: "SAVE10", discount: 10, active: true }
//
//   code      matched case-insensitively; stored and compared as UPPERCASE.
//   discount  REQUIRED. A percentage: a finite number > 0 and <= 100, applied
//             to the pre-shipping items subtotal.
//   active    REQUIRED and must be exactly `true`. A missing or non-true
//             `active` is NOT usable (fails closed).
//
// Optional constraints, applied identically on web and mobile when a coupon
// document carries them (none of today's admin-created coupons do, so they do
// not change any existing coupon's behaviour):
//
//   expiresAt      Firestore Timestamp / Date / epoch-ms. Expired -> rejected.
//   minOrderValue  number > 0. Subtotal below it -> rejected.
//   maxDiscount    number > 0. Caps the rupee discount.
//
// An optional field that is present but malformed makes the coupon invalid
// (fail closed) rather than being ignored.
//
// NOT SUPPORTED: the old mobile-only { discountType, discountValue } shape.
// It priced admin-created coupons at ₹0 on mobile and let the two platforms
// disagree about the same code. A coupon without a valid `discount` is
// rejected on every platform. (No production coupon uses that shape.)
//
// The rupee discount is never more than the subtotal and is not rounded here —
// callers round the final total exactly as they did before.

export const MAX_COUPON_CODE_LENGTH = 50;

export type CouponRejectReason =
  | "invalid-code"
  | "not-found"
  | "inactive"
  | "invalid-discount"
  | "invalid-coupon"
  | "expired"
  | "min-order";

export type CouponEvaluation =
  | { ok: true; percent: number; discountAmount: number }
  | { ok: false; reason: CouponRejectReason; message: string };

/** Canonical form of a customer-typed code: trimmed + uppercase, or null if unusable. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!code || code.length > MAX_COUPON_CODE_LENGTH) return null;
  return code;
}

/** The one-use-per-customer redemption record id: couponRedemptions/{uid}_{CODE}. */
export function couponRedemptionId(uid: string, code: string): string {
  return `${uid}_${code}`;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const d = (value as { toDate: () => unknown }).toDate();
    return d instanceof Date ? d : null;
  }
  return null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function has(coupon: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(coupon, key) && coupon[key] !== undefined && coupon[key] !== null;
}

const reject = (reason: CouponRejectReason, message: string): CouponEvaluation => ({ ok: false, reason, message });

/**
 * Evaluate a coupon document against an items subtotal.
 * `coupon` is the Firestore document data (or null when no document matched).
 */
export function evaluateCoupon(
  coupon: Record<string, unknown> | null | undefined,
  subtotal: number,
  now: Date = new Date()
): CouponEvaluation {
  if (!coupon) return reject("not-found", "Invalid coupon");

  if (coupon.active !== true) {
    return reject("inactive", "This coupon is no longer active.");
  }

  const percent = coupon.discount;
  if (!isPositiveNumber(percent) || percent > 100) {
    return reject("invalid-discount", "This coupon is not valid.");
  }

  if (has(coupon, "expiresAt")) {
    const expires = toDate(coupon.expiresAt);
    if (!expires || Number.isNaN(expires.getTime())) {
      return reject("invalid-coupon", "This coupon is not valid.");
    }
    if (expires.getTime() < now.getTime()) {
      return reject("expired", "This coupon has expired.");
    }
  }

  if (has(coupon, "minOrderValue")) {
    if (!isPositiveNumber(coupon.minOrderValue)) {
      return reject("invalid-coupon", "This coupon is not valid.");
    }
    if (subtotal < coupon.minOrderValue) {
      return reject("min-order", `This coupon needs a minimum order of ₹${coupon.minOrderValue}.`);
    }
  }

  // Same arithmetic the web pricing pass has always used, so every existing
  // web coupon prices to exactly the same rupee (and paise) amount as before.
  let discountAmount = subtotal * (percent / 100);

  if (has(coupon, "maxDiscount")) {
    if (!isPositiveNumber(coupon.maxDiscount)) {
      return reject("invalid-coupon", "This coupon is not valid.");
    }
    discountAmount = Math.min(discountAmount, coupon.maxDiscount);
  }

  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

  return { ok: true, percent, discountAmount };
}
