import { YOMICO_COMMISSION_RATE } from "@/lib/commissionPolicy";
import { COUPON_FUNDED_BY_YOMICO } from "@/lib/coupons/couponRules";

type OrderItem = {
  vendorId?: string;
  price?: number;
  qty?: number;
};

type Order = {
  items?: OrderItem[];
  total?: number;
  itemsSubtotal?: number;
  finalTotal?: number;
  discount?: number;
  rewardValue?: number;
  /** "yomico" when YOMICO absorbed rewardValue (lib/rewards/redemption). */
  rewardFundedBy?: string;
  /** "yomico" when YOMICO absorbed the coupon `discount` (H3, lib/coupons/couponRules). */
  couponFundedBy?: string;
  commissionRate?: number;
};

export type RefundInfo = {
  status?: string;
  refundAmount?: number;
};

export type VendorShare = {
  vendorRawSubtotal: number;
  vendorNetSubtotal: number;
  vendorCommission: number;
  vendorEarning: number;
  /**
   * This seller's share of a YOMICO-funded coupon (orders stamped
   * couponFundedBy "yomico"): the promotion cost YOMICO absorbed on this
   * seller's items. Reporting only — it is NOT deducted from the seller.
   * 0 on legacy orders, whose coupon stays inside the seller's discount share.
   */
  yomicoCouponShare: number;
};

/**
 * The order's merchandise subtotal — the base a coupon/reward discount is
 * split across sellers by, and the base forward delivery cost is allocated by.
 *
 * Web orders store it as `total` (their pre-shipping subtotal). Mobile orders
 * use `total` for the GRAND total, so new mobile orders also write an
 * explicit `itemsSubtotal`, which wins when present. Orders without it —
 * every web order and every historical mobile order — resolve exactly as
 * before (`total`), so no stored order's payout changes.
 */
export function orderItemsSubtotalBasis(order: {
  itemsSubtotal?: unknown;
  total?: unknown;
}): number {
  const explicit = order?.itemsSubtotal;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }
  const legacy = Number(order?.total);
  return Number.isFinite(legacy) ? legacy : 0;
}

/**
 * Read-time normalisation the admin dashboard applies before computing seller
 * shares: historical orders that stored a line's quantity as `quantity` (not
 * `qty`) and any non-numeric price become numbers, so one malformed order
 * cannot poison a dashboard total with NaN. Extracted verbatim from
 * app/admin/page.tsx so tests can prove the admin view and the seller payout
 * engine agree for new orders (which carry `qty` natively).
 */
export function normalizeOrderForEarnings(
  order: Record<string, any>
): Record<string, any> & {
  items: Array<Record<string, any> & { qty: number; price: number }>;
} {
  const items: any[] = Array.isArray(order?.items) ? order.items : [];
  return {
    ...order,
    items: items.map((item: any) => ({
      ...item,
      qty: Number(item?.qty ?? item?.quantity ?? 0) || 0,
      price: Number(item?.price ?? 0) || 0,
    })),
  };
}

// order.commission/sellerEarning/discount are whole-order figures computed
// once at checkout for the entire (possibly multi-vendor) cart — crediting
// a single vendor with those directly would give them every other vendor's
// share too. This derives just one vendor's own share from their line
// items, proportionally carrying their share of any coupon/reward discount
// so a seller isn't credited as if the full pre-discount price was paid.
export function computeVendorShare(
  order: Order,
  vendorUid: string,
  refund?: RefundInfo | null
): VendorShare | null {
  const vendorItems = (order.items || []).filter(
    (item) => item.vendorId === vendorUid
  );

  if (vendorItems.length === 0) return null;

  const vendorRawSubtotal = vendorItems.reduce(
    (sum, item) => sum + (item.price || 0) * (item.qty || 0),
    0
  );

  const orderRawSubtotal = orderItemsSubtotalBasis(order);
  // A reward-points discount stamped rewardFundedBy "yomico" is YOMICO's cost,
  // not the seller's: it is left out here so the seller's net subtotal,
  // earning and payout basis equal what a full cash payment would give. Older
  // orders carry no stamp and keep subtracting rewardValue exactly as before.
  const sellerBorneReward = order.rewardFundedBy === "yomico" ? 0 : order.rewardValue || 0;
  // H3: a coupon on an order stamped couponFundedBy "yomico" is YOMICO's
  // promotion cost, so — like YOMICO-funded points — it is left out of what
  // the seller bears: their earning is their full pre-coupon item value.
  // Orders without the stamp (placed before H3) keep subtracting the coupon
  // exactly as before, so no historical payout or balance changes.
  const yomicoFundedCoupon = order.couponFundedBy === COUPON_FUNDED_BY_YOMICO;
  const coupon = order.discount || 0;
  const sellerBorneCoupon = yomicoFundedCoupon ? 0 : coupon;
  const totalDiscount = sellerBorneCoupon + sellerBorneReward;

  // Both shares split by the same rule: this seller's items as a fraction of
  // the order's items subtotal, so every seller's shares add up to the whole.
  const vendorFraction =
    orderRawSubtotal > 0 ? vendorRawSubtotal / orderRawSubtotal : 0;
  const vendorDiscountShare = totalDiscount * vendorFraction;
  const yomicoCouponShare = yomicoFundedCoupon ? coupon * vendorFraction : 0;

  const vendorNetSubtotal = Math.max(
    0,
    vendorRawSubtotal - vendorDiscountShare
  );

  // YOMICO charges sellers NO commission (lib/commissionPolicy.ts). Whatever
  // an order's stored commissionRate says — missing, legacy, invalid, or a
  // rate an admin setting once stamped — the seller's commission is ₹0. The
  // old 10% fallback for orders without a commissionRate is gone.
  const vendorCommission = Math.round(vendorNetSubtotal * YOMICO_COMMISSION_RATE);
  let vendorEarning = vendorNetSubtotal - vendorCommission;

  // A FULL refund (refundAmount == the order's actual grand total) means
  // YOMICO gave the customer back everything they paid — the vendor is
  // owed nothing further for this order. Both figures are server-rounded
  // integers (see lib/orderPricing.ts / firestore.rules' refundCeiling),
  // so exact equality is reliable here, not fragile.
  //
  // Partial refunds are deliberately left untouched: refundAmount is one
  // whole-order figure with no per-vendor or per-item breakdown, so a
  // proportional cut would risk clawing back money from a vendor who
  // wasn't even part of what was returned (see audit notes). Only
  // vendorEarning changes — vendorRawSubtotal/vendorNetSubtotal/
  // vendorCommission stay as computed for sales/commission reporting.
  if (refund?.status === "Refunded") {
    const refundAmount = Number(refund.refundAmount);
    const orderGrandTotal =
      typeof order.finalTotal === "number" ? order.finalTotal : orderRawSubtotal;

    if (
      Number.isFinite(refundAmount) &&
      orderGrandTotal > 0 &&
      refundAmount === orderGrandTotal
    ) {
      vendorEarning = 0;
    }
  }

  return {
    vendorRawSubtotal,
    vendorNetSubtotal,
    vendorCommission,
    vendorEarning,
    yomicoCouponShare,
  };
}
