import { LEGACY_ORDER_COMMISSION_RATE } from "@/lib/commission";

type OrderItem = {
  vendorId?: string;
  price?: number;
  qty?: number;
};

type Order = {
  items?: OrderItem[];
  total?: number;
  discount?: number;
  rewardValue?: number;
  commissionRate?: number;
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
  vendorUid: string
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
  const vendorEarning = vendorNetSubtotal - vendorCommission;

  return {
    vendorRawSubtotal,
    vendorNetSubtotal,
    vendorCommission,
    vendorEarning,
  };
}
