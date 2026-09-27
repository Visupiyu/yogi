// Seller Order Settlement Statement — one seller's settlement for ONE order.
//
// Every rupee here comes from lib/vendorPayable.ts's computeVendorEarningsBreakdown
// (the same function behind the seller wallet, payout report, withdrawals and
// admin payouts) run over just this order. There is no second formula: this
// file only decides which orders the engine is asked about and labels the
// result. Commission is therefore always ₹0, the seller delivery charge is the
// stored sellerOrders snapshot (or the engine's own legacy fallback), and the
// coupon split and return deductions are exactly the engine's.
//
// The engine only counts Delivered + Paid + !needsReview orders. For an order
// that is not there YET (in transit, COD awaiting verification, on review hold)
// the statement asks the same engine what the order will settle at once it
// is — clearly marked "projected" and never counted as payable. Cancelled /
// returned-to-origin orders settle at nothing and are not projected.
import {
  computeVendorEarningsBreakdown,
  type PayableItemRequest,
  type PayableLegacyReturn,
  type PayableOrder,
  type PayableSellerOrder,
} from "@/lib/vendorPayable";

export type SellerSettlementStatus =
  | "SETTLEMENT_ELIGIBLE"
  | "PENDING_DELIVERY"
  | "AWAITING_PAYMENT_CONFIRMATION"
  | "ON_HOLD_REVIEW"
  | "NOT_PAYABLE";

export type SellerOrderStatementFigures = {
  grossSales: number;
  discountShare: number;
  commission: number;
  sellerDeliveryCharges: number;
  returnDeductions: number;
  returnLogisticsCharges: number;
  adjustedEarnings: number;
};

export type SellerOrderStatement = {
  orderId: string;
  orderNumber: string | null;
  orderStatus: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  orderDate: string | null;
  /** What the CUSTOMER paid for the whole order (all sellers, incl. any customer delivery charge). */
  customerOrderTotal: number;
  /** The order's ONE delivery cost and whether the customer got free delivery. */
  orderDeliveryCost: number;
  freeDeliveryApplied: boolean;
  settlementStatus: SellerSettlementStatus;
  /** True only when these figures are already part of the seller's payable. */
  countsTowardPayable: boolean;
  /** "actual" = counted by the engine now; "projected" = the engine's figures once eligible; "none" = settles at nothing. */
  basis: "actual" | "projected" | "none";
  /** Where the seller delivery charge came from. */
  deliveryChargeSource: "snapshot" | "legacy-recalculated" | "none";
  /** This seller's figures only — straight from computeVendorEarningsBreakdown. */
  figures: SellerOrderStatementFigures;
};

const NOT_PAYABLE_STATUSES = new Set(["Cancelled", "Returned"]);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  if (typeof v === "string") return v;
  return null;
}

export function buildSellerOrderStatement(params: {
  vendorUid: string;
  order: PayableOrder & { id: string };
  sellerOrder?: PayableSellerOrder | null;
  itemRequests?: PayableItemRequest[];
  legacyReturns?: PayableLegacyReturn[];
}): SellerOrderStatement {
  const { vendorUid, order, sellerOrder } = params;
  const status = typeof order.status === "string" ? order.status : "";
  const paymentStatus = typeof order.paymentStatus === "string" ? order.paymentStatus : null;

  let settlementStatus: SellerSettlementStatus;
  if (NOT_PAYABLE_STATUSES.has(status)) settlementStatus = "NOT_PAYABLE";
  else if (order.needsReview === true) settlementStatus = "ON_HOLD_REVIEW";
  else if (status !== "Delivered") settlementStatus = "PENDING_DELIVERY";
  else if (paymentStatus !== "Paid") settlementStatus = "AWAITING_PAYMENT_CONFIRMATION";
  else settlementStatus = "SETTLEMENT_ELIGIBLE";

  const basis: SellerOrderStatement["basis"] =
    settlementStatus === "SETTLEMENT_ELIGIBLE"
      ? "actual"
      : settlementStatus === "NOT_PAYABLE"
      ? "none"
      : "projected";

  // Only this order's own return requests and this seller's own record.
  const itemRequests = (params.itemRequests || []).filter(
    (ir) => String(ir?.orderId || "") === order.id && ir?.vendorId === vendorUid
  );
  const sellerOrders =
    sellerOrder && sellerOrder.vendorId === vendorUid && String(sellerOrder.orderId || "") === order.id
      ? [sellerOrder]
      : [];

  // The engine, unchanged. "projected" asks it about this order as it will be
  // once Delivered + Paid; "none" and "actual" ask about the order as it is.
  const engineOrder =
    basis === "projected"
      ? { ...order, status: "Delivered", paymentStatus: "Paid", needsReview: false }
      : order;
  const b = computeVendorEarningsBreakdown({
    vendorUid,
    orders: [engineOrder],
    itemRequests,
    legacyReturns: params.legacyReturns || [],
    sellerOrders,
  });

  const snapshot = sellerOrders[0]?.sellerDeliveryCharge;
  const deliveryChargeSource: SellerOrderStatement["deliveryChargeSource"] =
    basis === "none"
      ? "none"
      : typeof snapshot === "number" && Number.isFinite(snapshot) && snapshot >= 0
      ? "snapshot"
      : "legacy-recalculated";

  return {
    orderId: order.id,
    orderNumber: typeof order.orderNumber === "string" ? order.orderNumber : null,
    orderStatus: status,
    paymentMethod: typeof order.paymentMethod === "string" ? order.paymentMethod : null,
    paymentStatus,
    orderDate: isoDate(order.createdAt),
    customerOrderTotal: num(order.finalTotal ?? order.total),
    orderDeliveryCost: num(order.deliveryCost),
    freeDeliveryApplied: order.freeDeliveryApplied === true,
    settlementStatus,
    countsTowardPayable: basis === "actual",
    basis,
    deliveryChargeSource,
    figures: {
      grossSales: b.grossSales,
      discountShare: b.discountShare,
      commission: b.commission,
      sellerDeliveryCharges: b.sellerDeliveryCharges,
      returnDeductions: b.returnDeductions,
      returnLogisticsCharges: b.returnLogisticsCharges,
      adjustedEarnings: b.adjustedEarnings,
    },
  };
}
