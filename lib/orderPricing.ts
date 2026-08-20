// SERVER-ONLY. Imports lib/firebaseAdmin, which must never be reachable from
// the browser bundle — do not import this file from a "use client" component.
//
// The single trusted pricing computation for an order. Extracted verbatim
// from app/api/create-order/route.ts's computeVerifiedOrderAmount() so the
// Razorpay (ONLINE) path, the Pay on Delivery (UPI Only) path, and the
// server-authoritative order writer still to come all price an order the
// same way instead of drifting apart.
//
// Nothing here reads a monetary value from the caller. The only inputs are
// which products, how many, which coupon code, and whether to spend points;
// every rupee figure is derived from Firestore via the Admin SDK.
//
// Deliberately does NOT import lib/shipping.ts or lib/commission.ts: both
// pull the client Firebase SDK (`@/lib/firebase`), whose reads are subject
// to security rules and are not usable from a trusted server context. The
// Admin-SDK readers below are their server twins. The shipping RULE itself
// is genuinely shared, via the dependency-free lib/shippingRules.ts, so the
// price shown in the cart and at checkout is the price charged here.
import { getAdminDb } from "@/lib/firebaseAdmin";
// Dependency-free shipping rule, shared verbatim with the cart and checkout
// UI. Imported from lib/shippingRules (not lib/shipping) because that one
// pulls the client Firebase SDK, which must never reach a server route.
import {
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_CHARGE,
  calculateShippingCharge,
} from "@/lib/shippingRules";

// size/color are variant intent, not money — the only client-supplied
// fields that survive into the order line, and neither affects pricing.
export type PricedItemInput = {
  id: string;
  qty: number;
  size?: string;
  color?: string;
};

// One order line, rebuilt from the product document rather than from
// whatever the browser had cached. Field names and normalisation match
// lib/cart.ts's CartItem and app/product/[id]/page.tsx's
// normalizeProduct(), because order/invoice/email/seller code already reads
// items[].name / .price / .image / .vendorName off exactly this shape.
export type PricedLineItem = {
  id: string;
  name: string;
  price: number;
  mrp: number | null;
  image: string;
  qty: number;
  size: string;
  color: string;
  vendorId: string;
  vendorName: string;
  lineTotal: number;
};

export type OrderPricing = {
  items: PricedLineItem[];
  vendorIds: string[];
  subtotal: number;
  shipping: number;
  couponDiscount: number;
  rewardValue: number;
  /** couponDiscount + rewardValue, clamped to subtotal + shipping. */
  discountAmount: number;
  finalTotal: number;
  commissionRate: number;
  commission: number;
  sellerEarning: number;
  earnedPoints: number;
};

export type PricingResult =
  | { ok: true; pricing: OrderPricing }
  | { ok: false; error: string; status: number };

// Was 999/99 here while the client used 499/49 — a divergence that only
// stayed invisible because settings/global happens to define both fields.
// Both sides now share one definition, matching the configured production
// values, so the fallback path can no longer charge a different price than
// the configured one.
const FALLBACK_FREE_SHIPPING_THRESHOLD = FREE_SHIPPING_THRESHOLD;
const FALLBACK_STANDARD_SHIPPING_CHARGE = STANDARD_SHIPPING_CHARGE;

type GlobalSettings = {
  freeShippingThreshold: number;
  standardShippingCharge: number;
  commissionRate: number;
};

// settings/global carries both the shipping thresholds and the commission
// configuration, so it is read once per pricing call rather than once per
// concern. Every field fails toward the safe default independently: a
// malformed shipping value falls back to the constants above, and anything
// short of an explicitly enabled, well-formed rate yields 0% commission —
// the same direction lib/commission.ts's getEffectiveCommissionRate() fails
// in, matching YOMICO's zero-commission launch policy.
async function readGlobalSettings(): Promise<GlobalSettings> {
  try {
    const snap = await getAdminDb().collection("settings").doc("global").get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;

    const rawRate = data?.commissionRate;
    const commissionRate =
      data?.commissionEnabled === true &&
      typeof rawRate === "number" &&
      rawRate >= 0 &&
      rawRate <= 1
        ? rawRate
        : 0;

    return {
      freeShippingThreshold:
        typeof data?.freeShippingThreshold === "number"
          ? data.freeShippingThreshold
          : FALLBACK_FREE_SHIPPING_THRESHOLD,
      standardShippingCharge:
        typeof data?.standardShippingCharge === "number"
          ? data.standardShippingCharge
          : FALLBACK_STANDARD_SHIPPING_CHARGE,
      commissionRate,
    };
  } catch (error) {
    console.error(
      "orderPricing: settings/global read failed, using defaults (0% commission):",
      error
    );
    return {
      freeShippingThreshold: FALLBACK_FREE_SHIPPING_THRESHOLD,
      standardShippingCharge: FALLBACK_STANDARD_SHIPPING_CHARGE,
      commissionRate: 0,
    };
  }
}

/** Admin-SDK twin of lib/shipping.ts's getShippingSettings(). */
export async function getAdminShippingSettings(): Promise<{
  freeShippingThreshold: number;
  standardShippingCharge: number;
}> {
  const { freeShippingThreshold, standardShippingCharge } =
    await readGlobalSettings();
  return { freeShippingThreshold, standardShippingCharge };
}

/** Admin-SDK twin of lib/commission.ts's getEffectiveCommissionRate(). */
export async function getAdminCommissionRate(): Promise<number> {
  return (await readGlobalSettings()).commissionRate;
}

export async function computeOrderPricing(
  items: PricedItemInput[],
  uid: string,
  couponCode: string | null,
  redeemPoints: boolean
): Promise<PricingResult> {
  const db = getAdminDb();

  let subtotal = 0;
  const pricedItems: PricedLineItem[] = [];

  for (const item of items) {
    if (!item.id || !(Number(item.qty) > 0)) {
      return { ok: false, error: "Invalid item in cart", status: 400 };
    }

    const snap = await db.collection("products").doc(item.id).get();

    if (!snap.exists) {
      return {
        ok: false,
        error: "One or more products are no longer available",
        status: 400,
      };
    }

    const product: any = snap.data();

    if (product.active === false) {
      return {
        ok: false,
        error: "One or more products are currently unavailable",
        status: 400,
      };
    }

    const qty = Number(item.qty);

    if ((product.stock ?? 0) < qty) {
      return {
        ok: false,
        error: `${product.title || "A product"} has insufficient stock`,
        status: 400,
      };
    }

    const price =
      typeof product.sellingPrice === "number"
        ? product.sellingPrice
        : Number(product.price || 0);

    subtotal += price * qty;

    pricedItems.push({
      id: item.id,
      // Same precedence normalizeProduct() uses, so a line written here is
      // indistinguishable from one the cart produced.
      name: product.title || product.name || "",
      price,
      mrp: typeof product.mrp === "number" ? product.mrp : null,
      image:
        product.thumbnail ||
        product.image ||
        (Array.isArray(product.images) ? product.images[0] : "") ||
        "",
      qty,
      size: typeof item.size === "string" ? item.size : "",
      color: typeof item.color === "string" ? item.color : "",
      vendorId: typeof product.vendorId === "string" ? product.vendorId : "",
      vendorName: typeof product.vendorName === "string" ? product.vendorName : "",
      lineTotal: price * qty,
    });
  }

  const settings = await readGlobalSettings();

  const shipping = calculateShippingCharge(subtotal, settings);

  // ---- Coupon: percentage read from the coupon document itself ----
  // Mirrors app/checkout/page.tsx's applyCoupon() exactly, so a coupon the
  // customer legitimately applied prices the same here: coupons are created
  // with addDoc() (random id) so the code is a FIELD, not the id; the
  // percentage applies to the pre-shipping subtotal; and the same
  // userId+code redemption query rejects a code this customer already
  // spent. Rejecting rather than silently dropping the discount matters —
  // dropping it would charge more than the page displayed.
  let couponDiscount = 0;

  if (couponCode) {
    const couponSnap = await db
      .collection("coupons")
      .where("code", "==", couponCode)
      .limit(1)
      .get();

    if (couponSnap.empty) {
      return { ok: false, error: "Invalid coupon", status: 400 };
    }

    const couponData: any = couponSnap.docs[0].data();

    if (couponData.active !== true) {
      return {
        ok: false,
        error: "This coupon is no longer active.",
        status: 400,
      };
    }

    const percent = Number(couponData.discount);

    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return { ok: false, error: "This coupon is not valid.", status: 400 };
    }

    const priorRedemption = await db
      .collection("couponRedemptions")
      .where("userId", "==", uid)
      .where("code", "==", couponCode)
      .limit(1)
      .get();

    if (!priorRedemption.empty) {
      return {
        ok: false,
        error: "You've already used this coupon.",
        status: 400,
      };
    }

    couponDiscount = subtotal * (percent / 100);
  }

  // ---- Reward points: the authenticated user's real stored balance ----
  // The caller passes only a boolean. Capped at the post-coupon subtotal,
  // the same ceiling the checkout page applies, so points can never pay for
  // shipping or push the order below zero.
  let rewardValue = 0;

  if (redeemPoints) {
    const userSnap = await db.collection("users").doc(uid).get();
    const storedPoints = Number(userSnap.data()?.rewardPoints);
    const balance =
      userSnap.exists && Number.isFinite(storedPoints) && storedPoints > 0
        ? storedPoints
        : 0;

    rewardValue = Math.min(
      balance,
      Math.floor(Math.max(0, subtotal - couponDiscount))
    );
  }

  const rawTotal = subtotal + shipping;

  // Both components are server-derived, so the clamp is a floor guard
  // against rounding rather than the only thing standing between the
  // customer and an arbitrary price.
  const discountAmount = Math.min(couponDiscount + rewardValue, rawTotal);

  const finalTotal = Math.max(1, Math.round(rawTotal - discountAmount));

  // buildOrderData()'s formulas, unchanged: commission rounds against the
  // final charged amount and the seller keeps the remainder.
  const commission = Math.round(finalTotal * settings.commissionRate);
  const sellerEarning = finalTotal - commission;

  // applyPostOrderEffects()'s formula, unchanged.
  const earnedPoints = Math.floor(finalTotal / 100);

  // Mirrors vendorIdsForOrder(), but from live products rather than cart
  // data — this array is what the orders read rule and every seller query
  // key off, so it must never be client-declared.
  const vendorIds = [...new Set(pricedItems.map((i) => i.vendorId).filter(Boolean))];

  return {
    ok: true,
    pricing: {
      items: pricedItems,
      vendorIds,
      subtotal,
      shipping,
      couponDiscount,
      rewardValue,
      discountAmount,
      finalTotal,
      commissionRate: settings.commissionRate,
      commission,
      sellerEarning,
      earnedPoints,
    },
  };
}
