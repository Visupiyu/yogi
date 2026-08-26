import { LEGACY_ORDER_COMMISSION_RATE } from "@/lib/commission";

type OrderItem = {
  vendorId?: string;
  price?: number;
  qty?: number;
};

type Order = {
  items?: OrderItem[];
  total?: number;
  finalTotal?: number;
  discount?: number;
  rewardValue?: number;
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
};

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

  const orderRawSubtotal = order.total || 0;
  const totalDiscount = (order.discount || 0) + (order.rewardValue || 0);

  const vendorDiscountShare =
    orderRawSubtotal > 0
      ? totalDiscount * (vendorRawSubtotal / orderRawSubtotal)
      : 0;

  const vendorNetSubtotal = Math.max(
    0,
    vendorRawSubtotal - vendorDiscountShare
  );

  // Each order stamps the commission rate that was actually in effect when
  // it was placed (see checkout's buildOrderData) — so a later admin rate
  // change never retroactively recalculates an order already sold, paid,
  // or invoiced. Orders from before this field existed fall back to the
  // 10% they were implicitly always charged at — NOT to YOMICO's current
  // zero-commission launch default, which only applies to new orders.
  const rate =
    typeof order.commissionRate === "number" &&
    order.commissionRate >= 0 &&
    order.commissionRate <= 1
      ? order.commissionRate
      : LEGACY_ORDER_COMMISSION_RATE;

  const vendorCommission = Math.round(vendorNetSubtotal * rate);
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
  };
}
