// Seller dashboard / analytics / reports aggregation — pure and dependency-
// light, so the API routes and the tests share one implementation.
//
// Everything here is computed on the server from data that is ALREADY scoped
// to one seller:
//   - their own products (products where vendorId == the verified uid), cut
//     down to an allow-listed stat shape (SELLER_PRODUCT_STAT_KEYS);
//   - their own order summaries (lib/sellerOrders/sellerOrderView — own lines
//     and own item value only);
//   - the settlement breakdown from lib/vendorPayable (passed through as-is;
//     never recomputed here).
//
// "Booked sales" is the seller's own item value (Σ price × qty of their lines)
// on orders that are not cancelled — an activity figure, NOT money owed.
// What the seller has actually earned or may withdraw only ever comes from the
// settlement breakdown (Delivered + Paid, returns and delivery charges netted),
// so this module is never a second source of truth for money.
import { ITEM_FULFILMENT_STAGES } from "@/lib/itemFulfilment";
import { productModerationStatus, type ModerationStatus } from "@/lib/products/visibility";
import type { SellerOrderSummary } from "@/lib/sellerOrders/sellerOrderView";
import type { VendorPayableBreakdown } from "@/lib/vendorPayable";

/** India Standard Time — month buckets and report date ranges are IST days. */
export const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Stock at or below this counts as "low" in the inventory health figures. */
export const LOW_STOCK_THRESHOLD = 5;
/** The dashboard's restock list shows products at or below this. */
export const RESTOCK_LIST_THRESHOLD = 10;
export const RESTOCK_LIST_MAX = 20;
export const RECENT_ORDERS_MAX = 5;
export const BEST_SELLERS_MAX = 5;
/** A report returns at most this many rows; its totals always cover every order in range. */
export const REPORT_MAX_ROWS = 5000;
/** Longest report range accepted, in days (about ten years). */
export const REPORT_MAX_RANGE_DAYS = 3660;

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The seller's own stage for an order, as the dashboards count it. */
export const SELLER_STAGES = [...ITEM_FULFILMENT_STAGES, "Cancelled"] as const;

type Doc = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
/** Money to paise precision, without float dust. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type SellerProductStat = {
  id: string;
  productNumber: string | null;
  title: string;
  image: string;
  stock: number;
  views: number;
  sales: number;
  rating: number;
  reviewCount: number;
  status: ModerationStatus;
};

/** The exact keys of a product stat — used by tests to pin the allow-list. */
export const SELLER_PRODUCT_STAT_KEYS = [
  "id", "productNumber", "title", "image", "stock", "views", "sales", "rating", "reviewCount", "status",
] as const;

export function buildSellerProductStat(id: string, data: Doc): SellerProductStat {
  const images = Array.isArray(data.images) ? data.images : [];
  const rating = num(data.rating);
  return {
    id,
    productNumber: str(data.productNumber) || null,
    title: str(data.title) || str(data.name),
    image: str(data.thumbnail) || str(images[0]) || str(data.image),
    stock: Math.max(0, num(data.stock)),
    // views/sales/rating/reviewCount are server-owned counters (firestore.rules
    // refuse a seller write to them), so a seller cannot inflate their own.
    views: Math.max(0, num(data.views)),
    sales: Math.max(0, num(data.sales)),
    rating: rating >= 1 && rating <= 5 ? rating : 0,
    reviewCount: Math.max(0, Math.floor(num(data.reviewCount))),
    status: productModerationStatus(data),
  };
}

export type SellerProductSummary = {
  total: number;
  byStatus: Record<ModerationStatus, number>;
  /** Over products still on the seller's books (not archived). */
  inventory: { healthy: number; low: number; out: number };
  lowStockThreshold: number;
  totalViews: number;
  reviews: { count: number; averageRating: number };
  /** Not-archived products at or below RESTOCK_LIST_THRESHOLD, lowest stock first. */
  restock: SellerProductStat[];
};

export function summariseSellerProducts(products: SellerProductStat[]): SellerProductSummary {
  const byStatus: Record<ModerationStatus, number> = { live: 0, pending: 0, rejected: 0, blocked: 0, archived: 0 };
  const inventory = { healthy: 0, low: 0, out: 0 };
  let totalViews = 0;
  let reviewCount = 0;
  let ratingWeight = 0;
  for (const p of products) {
    byStatus[p.status]++;
    totalViews += p.views;
    // product.rating / reviewCount are the storefront's own figures (one
    // review per reviewer, app/api/reviews/sync-rating), so the seller sees
    // the same rating their customers do — no review documents are read.
    if (p.reviewCount > 0 && p.rating > 0) {
      reviewCount += p.reviewCount;
      ratingWeight += p.rating * p.reviewCount;
    }
    if (p.status === "archived") continue;
    if (p.stock <= 0) inventory.out++;
    else if (p.stock <= LOW_STOCK_THRESHOLD) inventory.low++;
    else inventory.healthy++;
  }
  const restock = products
    .filter((p) => p.status !== "archived" && p.stock <= RESTOCK_LIST_THRESHOLD)
    .sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title))
    .slice(0, RESTOCK_LIST_MAX);
  return {
    total: products.length - byStatus.archived,
    byStatus,
    inventory,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    totalViews,
    reviews: {
      count: reviewCount,
      averageRating: reviewCount ? Math.round((ratingWeight / reviewCount) * 10) / 10 : 0,
    },
    restock,
  };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * The seller's OWN stage on an order: Cancelled when the order is cancelled,
 * otherwise their least-advanced line (the per-seller record), falling back to
 * the order status for orders confirmed before per-seller records existed.
 * Never the whole-order status of a multi-seller order, which can lag behind
 * this seller's own progress.
 */
export function sellerOrderStage(o: SellerOrderSummary): string {
  if (o.orderStatus === "Cancelled") return "Cancelled";
  return o.fulfilmentStage || o.orderStatus;
}

export function orderRef(o: Pick<SellerOrderSummary, "orderNumber" | "orderId">): string {
  // The human order number when there is one. Legacy orders without one fall
  // back to the id, which the seller already holds on their own records.
  return o.orderNumber || o.orderId;
}

function createdAtMs(o: SellerOrderSummary): number | null {
  const ms = o.createdAt ? Date.parse(o.createdAt) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** IST calendar year and month (0-11) of an instant. */
export function istYearMonth(ms: number): { year: number; month: number } {
  const d = new Date(ms + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export type SellerRecentOrder = {
  orderId: string;
  orderRef: string;
  customerName: string;
  amount: number;
  stage: string;
  createdAt: string | null;
};

export type SellerOrderAnalytics = {
  /** Orders that are not cancelled. */
  total: number;
  cancelled: number;
  byStage: Record<string, number>;
  /** Own stage Confirmed — waiting for the seller to pack. */
  toPack: number;
  /** Own stage Packed — waiting for the seller to ship. */
  toShip: number;
  bookedSales: number;
  unitsSold: number;
  bestSelling: { productId: string; name: string; units: number; bookedSales: number }[];
  year: number;
  monthly: { month: string; bookedSales: number }[];
  recent: SellerRecentOrder[];
};

export function summariseSellerOrders(orders: SellerOrderSummary[], nowMs: number): SellerOrderAnalytics {
  const byStage: Record<string, number> = Object.fromEntries(SELLER_STAGES.map((s) => [s, 0]));
  const year = istYearMonth(nowMs).year;
  const monthly = new Array(12).fill(0) as number[];
  const products = new Map<string, { productId: string; name: string; units: number; bookedSales: number }>();
  let total = 0;
  let cancelled = 0;
  let bookedSales = 0;
  let unitsSold = 0;

  for (const o of orders) {
    const stage = sellerOrderStage(o);
    byStage[stage] = (byStage[stage] || 0) + 1;
    if (stage === "Cancelled") {
      cancelled++;
      continue;
    }
    total++;
    const value = num(o.sellerShare?.rawSubtotal);
    bookedSales += value;
    const at = createdAtMs(o);
    if (at !== null) {
      const ym = istYearMonth(at);
      if (ym.year === year) monthly[ym.month] += value;
    }
    for (const item of o.items || []) {
      const qty = Math.max(0, num(item.qty));
      unitsSold += qty;
      const key = item.productId || item.name;
      if (!key) continue;
      const entry = products.get(key) || { productId: item.productId, name: item.name || item.productId, units: 0, bookedSales: 0 };
      entry.units += qty;
      entry.bookedSales += num(item.price) * qty;
      products.set(key, entry);
    }
  }

  const bestSelling = [...products.values()]
    .sort((a, b) => b.units - a.units || b.bookedSales - a.bookedSales || a.name.localeCompare(b.name))
    .slice(0, BEST_SELLERS_MAX)
    .map((p) => ({ ...p, bookedSales: round2(p.bookedSales) }));

  const recent = [...orders]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, RECENT_ORDERS_MAX)
    .map((o) => ({
      orderId: o.orderId,
      orderRef: orderRef(o),
      customerName: o.customerName,
      amount: round2(num(o.sellerShare?.rawSubtotal)),
      stage: sellerOrderStage(o),
      createdAt: o.createdAt,
    }));

  return {
    total,
    cancelled,
    byStage,
    toPack: byStage.Confirmed || 0,
    toShip: byStage.Packed || 0,
    bookedSales: round2(bookedSales),
    unitsSold,
    bestSelling,
    year,
    monthly: MONTH_LABELS.map((month, i) => ({ month, bookedSales: round2(monthly[i]) })),
    recent,
  };
}

// ---------------------------------------------------------------------------
// The /api/seller/analytics response
// ---------------------------------------------------------------------------

export type SellerAnalytics = {
  generatedAt: string;
  products: SellerProductSummary;
  orders: SellerOrderAnalytics;
  /** lib/vendorPayable's breakdown, unchanged — the authoritative money figures. */
  settlement: VendorPayableBreakdown;
};

/** The exact top-level keys of the analytics response. */
export const SELLER_ANALYTICS_KEYS = ["generatedAt", "products", "orders", "settlement"] as const;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportRange = { from: string | null; to: string | null; fromMs: number | null; toMs: number | null };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight IST at the start of a YYYY-MM-DD day, or null when it is not a real date. */
function istDayStart(value: string): number | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return utc - IST_OFFSET_MS;
}

/**
 * Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional, IST calendar days,
 * inclusive). Returns an error message for anything malformed.
 */
export function parseReportRange(from: string | null, to: string | null): ReportRange | { error: string } {
  const f = from?.trim() || null;
  const t = to?.trim() || null;
  const fromMs = f === null ? null : istDayStart(f);
  const toStart = t === null ? null : istDayStart(t);
  if (f !== null && fromMs === null) return { error: "from must be a date in YYYY-MM-DD form." };
  if (t !== null && toStart === null) return { error: "to must be a date in YYYY-MM-DD form." };
  const toMs = toStart === null ? null : toStart + DAY_MS; // exclusive end: the whole "to" day counts
  if (fromMs !== null && toMs !== null) {
    if (fromMs >= toMs) return { error: "from must be on or before to." };
    if ((toMs - fromMs) / DAY_MS > REPORT_MAX_RANGE_DAYS) return { error: "That date range is too long." };
  }
  return { from: f, to: t, fromMs, toMs };
}

export type SellerReportRow = {
  orderRef: string;
  customerName: string;
  lines: number;
  units: number;
  amount: number;
  stage: string;
  paymentMethod: string | null;
  createdAt: string | null;
};

/** The exact keys of a report row — used by tests to pin the allow-list. */
export const SELLER_REPORT_ROW_KEYS = [
  "orderRef", "customerName", "lines", "units", "amount", "stage", "paymentMethod", "createdAt",
] as const;

export type SellerReport = {
  range: { from: string | null; to: string | null };
  rows: SellerReportRow[];
  truncated: boolean;
  totals: { orders: number; cancelled: number; units: number; bookedSales: number };
};

export function buildSellerReport(orders: SellerOrderSummary[], range: ReportRange): SellerReport {
  const inRange = orders.filter((o) => {
    if (range.fromMs === null && range.toMs === null) return true;
    const at = createdAtMs(o);
    if (at === null) return false;
    return (range.fromMs === null || at >= range.fromMs) && (range.toMs === null || at < range.toMs);
  });
  inRange.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  let cancelled = 0;
  let units = 0;
  let bookedSales = 0;
  const rows: SellerReportRow[] = inRange.map((o) => {
    const stage = sellerOrderStage(o);
    const orderUnits = (o.items || []).reduce((s, i) => s + Math.max(0, num(i.qty)), 0);
    const amount = round2(num(o.sellerShare?.rawSubtotal));
    if (stage === "Cancelled") cancelled++;
    else {
      units += orderUnits;
      bookedSales += amount;
    }
    return {
      orderRef: orderRef(o),
      customerName: o.customerName,
      lines: (o.items || []).length,
      units: orderUnits,
      amount,
      stage,
      paymentMethod: o.payment?.method ?? null,
      createdAt: o.createdAt,
    };
  });

  return {
    range: { from: range.from, to: range.to },
    rows: rows.slice(0, REPORT_MAX_ROWS),
    truncated: rows.length > REPORT_MAX_ROWS,
    totals: { orders: inRange.length - cancelled, cancelled, units, bookedSales: round2(bookedSales) },
  };
}
