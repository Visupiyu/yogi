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
};

export type VendorShare = {
  vendorRawSubtotal: number;
  vendorNetSubtotal: number;
  vendorCommission: number;
  vendorEarning: number;
};

const COMMISSION_RATE = 0.1;

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

  const vendorCommission = Math.round(vendorNetSubtotal * COMMISSION_RATE);
  const vendorEarning = vendorNetSubtotal - vendorCommission;

  return {
    vendorRawSubtotal,
    vendorNetSubtotal,
    vendorCommission,
    vendorEarning,
  };
}
