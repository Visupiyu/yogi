// ==========================================
// YOMICO Marketplace
// lib/sellerOrders/sellerOrderView.ts
// ==========================================
//
// The SELLER's view of an order — the only shape a seller ever receives.
//
// One orders/{id} document is shared by every seller on a multi-seller
// checkout: it holds every seller's lines, the customer's account identity,
// whole-order money, payment references and internal fields. A seller must
// see none of that beyond their own shipment. This module builds the view
// from an explicit ALLOW-LIST — every field below is picked and normalised
// one by one; the stored document is never spread into it.
//
//   own lines only      from the seller's own sellerOrders record (their
//                       items + per-item fulfilment), never another seller's
//   own money only      computeVendorShare() for THIS seller: their raw and
//                       net item value (and the always-0 commission) — the
//                       same figures the seller dashboard always showed
//   customer            name, phone and delivery address — what is needed
//                       to fulfil and label the shipment. No customer uid,
//                       no email.
//   payment             method and status only — no payment references,
//                       amounts to collect, or refund data
//   shipping            the seller's own tracking details
//
// Never included: other sellers' items, ids, names, prices or fulfilment;
// vendorIds; whole-order totals, discount, coupon, reward, delivery charges;
// commission/earning fields stored on the order; Razorpay/transaction ids;
// delivery partner / company / job ids; review, refund, timing and tax
// internals. Settlement figures live on the Seller Order Settlement
// Statement (app/api/seller/order-statement), not here.
//
// Dependency-free apart from shared pure helpers, so the server loader, the
// seller pages (types) and the tests share it.
import { computeVendorShare } from "@/lib/vendorEarnings";
import {
  deriveFulfilmentStage,
  itemKeyFor,
  type ItemFulfilmentMap,
} from "@/lib/itemFulfilment";
import { vendorsOnOrder } from "@/lib/sellerOrderRecord";

export type SellerOrderItemView = {
  itemKey: string;
  productId: string;
  name: string;
  image: string;
  qty: number;
  price: number;
  lineTotal: number;
  size: string;
  color: string;
  attributes: Record<string, string> | null;
  /** This item's own fulfilment stage. */
  status: string;
  deliveredAt: string | null;
};

export type SellerShareView = {
  /** Σ price × qty of this seller's lines. */
  rawSubtotal: number;
  /** After this seller's share of any customer discount. */
  netSubtotal: number;
  /** Always 0 (lib/commissionPolicy.ts). */
  commission: number;
  /** Item value net of discount share — NOT the settlement figure. */
  earning: number;
};

export type SellerOrderSummary = {
  orderId: string;
  orderNumber: string | null;
  createdAt: string | null;
  /** The parent order's status (least-advanced item across all sellers). */
  orderStatus: string;
  /** This seller's own least-advanced item. */
  fulfilmentStage: string | null;
  /** True when every item on the order is this seller's. */
  isSoleSeller: boolean;
  customerName: string;
  payment: { method: string | null; status: string | null };
  /** This seller's own shipment tracking number. */
  shipmentNumber: string | null;
  /** Legacy order-level delivery names — only on a sole-seller order. */
  delivery: { companyName: string | null; partnerName: string | null };
  sellerShare: SellerShareView;
  items: SellerOrderItemView[];
};

export type SellerOrderDetail = SellerOrderSummary & {
  invoiceNumber: string | null;
  confirmedAt: string | null;
  deliveryDeadlineAt: string | null;
  deliveredAt: string | null;
  customer: { name: string; phone: string; address: string };
  shipping: {
    trackingNumber: string;
    courierPartner: string;
    dispatchDate: string;
    expectedDelivery: string;
    sellerNotes: string;
    shipmentWeightKg: number | null;
  };
  /** Whether this seller may cancel (the server re-checks everything). */
  cancellable: boolean;
};

/** The exact keys of each shape — used by tests to pin the allow-list. */
export const SELLER_ORDER_SUMMARY_KEYS = [
  "orderId", "orderNumber", "createdAt", "orderStatus", "fulfilmentStage", "isSoleSeller",
  "customerName", "payment", "shipmentNumber", "delivery", "sellerShare", "items",
] as const;
export const SELLER_ORDER_DETAIL_KEYS = [
  ...SELLER_ORDER_SUMMARY_KEYS,
  "invoiceNumber", "confirmedAt", "deliveryDeadlineAt", "deliveredAt", "customer", "shipping", "cancellable",
] as const;
export const SELLER_ORDER_ITEM_KEYS = [
  "itemKey", "productId", "name", "image", "qty", "price", "lineTotal", "size", "color",
  "attributes", "status", "deliveredAt",
] as const;

type Doc = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
/** Firestore Timestamp | Date | ISO string | {seconds} -> ISO string, or null. */
export function toIso(v: unknown): string | null {
  if (!v) return null;
  const t = v as { toDate?: () => Date; seconds?: number };
  let d: Date | null = null;
  if (typeof t.toDate === "function") d = t.toDate();
  else if (v instanceof Date) d = v;
  else if (typeof t.seconds === "number") d = new Date(t.seconds * 1000);
  else if (typeof v === "string") d = new Date(v);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}
function attributesOf(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Doc)) {
    if (typeof val === "string" && k.length <= 60 && val.length <= 200) out[k] = val;
  }
  return Object.keys(out).length ? out : null;
}

const PRE_HANDOVER = new Set(["Confirmed", "Packed"]);

/** One of THIS seller's lines, allow-listed. */
function lineView(item: Doc, itemKey: string, fulfilment: ItemFulfilmentMap | null, fallbackStatus: string): SellerOrderItemView {
  const qty = Math.max(0, num(item.qty ?? item.quantity));
  const price = num(item.price);
  const entry = fulfilment?.[itemKey];
  return {
    itemKey,
    productId: str(item.productId) || str(item.id),
    name: str(item.name) || str(item.title),
    image: str(item.image),
    qty,
    price,
    lineTotal: typeof item.lineTotal === "number" && Number.isFinite(item.lineTotal) ? item.lineTotal : price * qty,
    size: str(item.size),
    color: str(item.color),
    attributes: attributesOf(item.attributes),
    status: str(entry?.status) || fallbackStatus,
    deliveredAt: toIso(entry?.deliveredAt),
  };
}

/**
 * The seller's summary of an order, or null when this seller has no part in
 * it (or it is still Pending — a seller never sees an unconfirmed order).
 */
export function buildSellerOrderSummary(params: {
  orderId: string;
  order: Doc;
  record: Doc | null;
  vendorUid: string;
}): SellerOrderSummary | null {
  const { orderId, order, record, vendorUid } = params;
  if (!vendorUid) return null;
  const orderStatus = str(order.status);
  if (!orderStatus || orderStatus === "Pending") return null;

  const sellers = vendorsOnOrder(order as never);
  if (!sellers.includes(vendorUid)) return null;
  const ownRecord = record && record.vendorId === vendorUid && record.orderId === orderId ? record : null;

  let items: SellerOrderItemView[];
  const fulfilment = (ownRecord?.itemFulfilment as ItemFulfilmentMap | undefined) || null;
  if (ownRecord && Array.isArray(ownRecord.items)) {
    items = (ownRecord.items as Doc[]).map((item, index) =>
      lineView(item, str(item.itemKey) || itemKeyFor(index, item.id), fulfilment, "Confirmed")
    );
  } else {
    // Orders confirmed before per-seller records existed: this seller's lines
    // from the order, at the order's own status.
    const own = (Array.isArray(order.items) ? (order.items as Doc[]) : []).filter((i) => i?.vendorId === vendorUid);
    items = own.map((item, index) => lineView(item, itemKeyFor(index, str(item.productId) || item.id), null, orderStatus));
  }
  if (items.length === 0) return null;

  const share = computeVendorShare(order as never, vendorUid);
  const isSoleSeller = sellers.length === 1;

  return {
    orderId,
    orderNumber: strOrNull(order.orderNumber),
    createdAt: toIso(order.createdAt),
    orderStatus,
    fulfilmentStage: deriveFulfilmentStage(fulfilment),
    isSoleSeller,
    customerName: str(order.customerName),
    payment: { method: strOrNull(order.paymentMethod), status: strOrNull(order.paymentStatus) },
    shipmentNumber: strOrNull(ownRecord?.shipmentNumber) || (isSoleSeller ? strOrNull(order.shipmentNumber) : null),
    delivery: {
      companyName: isSoleSeller ? strOrNull(order.deliveryCompanyName) : null,
      partnerName: isSoleSeller ? strOrNull(order.deliveryPartnerName) : null,
    },
    sellerShare: {
      rawSubtotal: num(share?.vendorRawSubtotal),
      netSubtotal: num(share?.vendorNetSubtotal),
      commission: num(share?.vendorCommission),
      earning: num(share?.vendorEarning),
    },
    items,
  };
}

/** The seller's full view of one order, or null (same conditions as the summary). */
export function buildSellerOrderDetail(params: {
  orderId: string;
  order: Doc;
  record: Doc | null;
  vendorUid: string;
}): SellerOrderDetail | null {
  const summary = buildSellerOrderSummary(params);
  if (!summary) return null;
  const { order, record } = params;
  const ownRecord = record && record.vendorId === params.vendorUid ? record : null;
  // Shipping details: the seller's own record; on a sole-seller order the
  // order-level copy (older saves) is the fallback.
  const ship = (field: string) =>
    str(ownRecord?.[field]) || (summary.isSoleSeller ? str(order[field]) : "");
  const weight = ownRecord?.shipmentWeightKg;

  return {
    ...summary,
    invoiceNumber: strOrNull(order.invoiceNumber),
    confirmedAt: toIso(ownRecord?.confirmedAt ?? order.confirmedAt),
    deliveryDeadlineAt: toIso(ownRecord?.deliveryDeadlineAt ?? order.deliveryDeadlineAt),
    deliveredAt: toIso(order.deliveredAt),
    customer: { name: str(order.customerName), phone: str(order.phone), address: str(order.address) },
    shipping: {
      trackingNumber: ship("trackingNumber"),
      courierPartner: ship("courierPartner"),
      dispatchDate: ship("dispatchDate"),
      expectedDelivery: ship("expectedDelivery"),
      sellerNotes: ship("sellerNotes"),
      shipmentWeightKg: typeof weight === "number" && Number.isFinite(weight) && weight > 0 ? weight : null,
    },
    cancellable:
      summary.isSoleSeller &&
      (summary.orderStatus === "Confirmed" || summary.orderStatus === "Packed") &&
      summary.items.every((i) => PRE_HANDOVER.has(i.status)),
  };
}
