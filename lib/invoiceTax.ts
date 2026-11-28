// ==========================================
// YOMICO Marketplace
// lib/invoiceTax.ts
// ==========================================
//
// What an invoice may say about tax — derived ONLY from the immutable
// order.taxSnapshot that app/api/confirm-order freezes at confirmation
// (per-line gstRate / hsn / grossValue / taxableValue / gstAmount, and per
// seller gstStatus / gstin). Nothing here recalculates tax at a hard-coded
// rate or invents a GSTIN.
//
// YOMICO is a marketplace: each SELLER is the supplier of their own goods, so
// one supply document is produced per seller on the order. Its kind follows
// the seller's recorded GST status:
//   REGISTERED, GSTIN well-formed  -> TAX INVOICE (recorded rate, taxable
//   AND verification VERIFIED         value and GST per line)
//   REGISTERED, not VERIFIED       -> ORDER SUMMARY (not a tax invoice)
//   COMPOSITION                    -> BILL OF SUPPLY, no tax shown; GSTIN
//                                     printed only when VERIFIED
//   UNREGISTERED                   -> BILL OF SUPPLY, no tax shown
//   anything else / no snapshot    -> ORDER SUMMARY, explicitly NOT a tax
//                                     document (the facts were not recorded)
// "VERIFIED" is the snapshot's per-seller `gstinVerified === true`, recorded at
// confirmation from the vendor's taxVerificationStatus (set only by YOMICO's
// admin GST review — app/api/admin/seller-tax-verification; never by the
// seller, never inferred from GSTIN format). Only that boolean is recorded:
// the order is readable by the customer and the assigned delivery partner, so
// the internal review state (PENDING / REJECTED) is not copied onto it.
// Snapshots written before this carry the raw `taxVerificationStatus` and are
// still read (VERIFIED -> true); snapshots with neither are never verified.
// isValidGstin() checks FORMAT only.
// The CGST/SGST vs IGST split needs the place of supply, which orders store
// only as free-text addresses — so the split is not shown, and every tax
// document says so (an explicit limitation, not a guess).
//
// Dependency-free: safe for client components and tests.

import { isValidGstin, gstinStateCode } from "@/lib/sellerTax";

export type InvoiceDocumentKind = "TAX_INVOICE" | "BILL_OF_SUPPLY" | "ORDER_SUMMARY";

export type InvoiceLine = {
  productId: string;
  name: string;
  hsn: string;
  qty: number;
  grossValue: number;
  /** null on documents that carry no tax (bill of supply / order summary). */
  gstRate: number | null;
  taxableValue: number | null;
  gstAmount: number | null;
  /**
   * Index into the order's `items` of the order line this document line is,
   * or null when that cannot be established with certainty. Snapshot lines are
   * built 1:1, in order, from order.items (app/api/confirm-order), and a
   * seller's lines keep that order (lib/sellerOrderRecord), so the k-th line of
   * a seller here is the k-th order line of that seller — checked against the
   * product id and the seller's line count, never guessed by product id alone
   * (one product can be on an order twice, in two variants).
   */
  orderItemIndex: number | null;
};

export type SupplierInvoice = {
  vendorId: string;
  kind: InvoiceDocumentKind;
  title: string;
  subtitle: string;
  gstStatus: string | null;
  /**
   * Whether the seller's GSTIN was recorded as verified by YOMICO's admin GST
   * review at confirmation: true / false, or null when nothing was recorded.
   */
  gstinVerified: boolean | null;
  gstin: string | null;
  supplierStateCode: string | null;
  lines: InvoiceLine[];
  totals: { gross: number; taxable: number | null; gst: number | null };
  notes: string[];
};

export type InvoiceTaxView = {
  snapshotPresent: boolean;
  suppliers: SupplierInvoice[];
};

export const PLACE_OF_SUPPLY_NOTE =
  "Place of supply was not recorded in a structured form, so the CGST/SGST or IGST split is not shown. GST is shown per line at the rate recorded when the order was confirmed.";
export const NO_SNAPSHOT_NOTE =
  "Tax details were not recorded for this order (it has not been confirmed, or it predates tax records). This is an order summary, not a tax invoice.";
export const GST_NOT_VERIFIED_NOTE =
  "The seller's GSTIN was not recorded as verified by YOMICO when this order was confirmed, so no tax invoice is issued from this record.";
export const COMPOSITION_GSTIN_NOT_VERIFIED_NOTE =
  "The seller's GSTIN was not recorded as verified by YOMICO when this order was confirmed, so it is not printed.";
export const STATUS_NOT_RECORDED_NOTE =
  "The seller's GST registration was not recorded for this order, so no tax document can be issued from this record.";

// INTERIM (CX-01): no formal tax document (tax invoice or bill of supply) is
// issued from these pages until the outstanding tax/legal requirements are
// reviewed and resolved. While this is false every seller's document is an
// ORDER SUMMARY ("Not a tax invoice") with no GST figures and no GSTIN. The
// full classification below is kept intact (and tested) for when review
// completes; enabling it is a deliberate, separately reviewed change.
export const FORMAL_TAX_DOCUMENTS_ENABLED = false;
export const INTERIM_NOT_TAX_DOCUMENT_NOTE =
  "This is an order summary, not a tax invoice or bill of supply. Prices are as charged on your order.";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

type SnapshotLine = {
  productId?: unknown; vendorId?: unknown; name?: unknown; hsn?: unknown; qty?: unknown;
  grossValue?: unknown; gstRate?: unknown; taxableValue?: unknown; gstAmount?: unknown;
};

function classify(gstStatus: string, gstin: string, verified: boolean): Pick<SupplierInvoice, "kind" | "title" | "subtitle"> {
  if (gstStatus === "REGISTERED" && isValidGstin(gstin) && verified) {
    return { kind: "TAX_INVOICE", title: "TAX INVOICE", subtitle: "Original for Recipient" };
  }
  if (gstStatus === "COMPOSITION") {
    return {
      kind: "BILL_OF_SUPPLY",
      title: "BILL OF SUPPLY",
      subtitle: "Composition taxable person, not eligible to collect tax on supplies",
    };
  }
  if (gstStatus === "UNREGISTERED") {
    return {
      kind: "BILL_OF_SUPPLY",
      title: "BILL OF SUPPLY",
      subtitle: "Supplier not registered under GST — no GST charged",
    };
  }
  return { kind: "ORDER_SUMMARY", title: "ORDER SUMMARY", subtitle: "Not a tax invoice" };
}

/**
 * The recorded verification of one seller entry of the snapshot: the minimal
 * `gstinVerified` boolean, or — for snapshots written before it — the raw
 * `taxVerificationStatus` (only "VERIFIED" counts). null when neither exists.
 */
export function recordedGstinVerified(seller: unknown): boolean | null {
  const s = (seller && typeof seller === "object" ? seller : {}) as Record<string, unknown>;
  if (typeof s.gstinVerified === "boolean") return s.gstinVerified;
  const raw = str(s.taxVerificationStatus).trim().toUpperCase();
  return raw ? raw === "VERIFIED" : null;
}

/** The product id an order line is recorded under (the snapshot uses `id`). */
const orderLineProductId = (it: Record<string, unknown> | null | undefined) =>
  str(it?.id) || str(it?.productId);

/**
 * For each snapshot line, the index of the order line it was built from, or
 * null. The k-th snapshot line of a seller pairs with the k-th order line of
 * that seller — only when the seller has the same number of lines in both and
 * the product ids agree; otherwise none of that seller's lines are paired.
 */
function alignSnapshotToOrder(snapItems: SnapshotLine[], orderItems: Record<string, unknown>[]): (number | null)[] {
  const orderIdx = new Map<string, number[]>();
  orderItems.forEach((it, i) => {
    const vid = str(it?.vendorId);
    if (!orderIdx.has(vid)) orderIdx.set(vid, []);
    orderIdx.get(vid)!.push(i);
  });
  const snapCount = new Map<string, number>();
  for (const line of snapItems) {
    const vid = str(line?.vendorId);
    snapCount.set(vid, (snapCount.get(vid) || 0) + 1);
  }
  const seen = new Map<string, number>();
  const pairs = snapItems.map((line) => {
    const vid = str(line?.vendorId);
    const k = seen.get(vid) || 0;
    seen.set(vid, k + 1);
    const candidates = orderIdx.get(vid) || [];
    if (candidates.length !== snapCount.get(vid)) return null;
    const idx = candidates[k];
    const pid = str(line?.productId);
    return idx !== undefined && pid && orderLineProductId(orderItems[idx]) === pid ? idx : null;
  });
  // One mismatch on a seller means the pairing is not trustworthy for any of
  // that seller's lines.
  const broken = new Set<string>();
  snapItems.forEach((line, i) => { if (pairs[i] === null) broken.add(str(line?.vendorId)); });
  return pairs.map((p, i) => (broken.has(str(snapItems[i]?.vendorId)) ? null : p));
}

/**
 * The supply documents for an order. `vendorId` restricts the result to one
 * seller (the seller's own invoice); without it every seller on the order gets
 * their own document (customer / admin view).
 */
export function buildInvoiceTax(
  order: unknown,
  opts: { vendorId?: string; formalTaxDocuments?: boolean } = {}
): InvoiceTaxView {
  const formal = opts.formalTaxDocuments ?? FORMAL_TAX_DOCUMENTS_ENABLED;
  const o =(order && typeof order === "object" ? order : {}) as Record<string, unknown>;
  const snap = o.taxSnapshot && typeof o.taxSnapshot === "object" ? (o.taxSnapshot as Record<string, unknown>) : null;
  const snapItems = snap && Array.isArray(snap.items) ? (snap.items as SnapshotLine[]) : null;

  if (!snapItems) {
    // No recorded tax facts: an order summary from the order lines, no tax at all.
    const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
    const own = items
      .map((it, index) => ({ it, index }))
      .filter(({ it }) => !opts.vendorId || str(it?.vendorId) === opts.vendorId);
    const lines: InvoiceLine[] = own.map(({ it, index }) => {
      const qty = num(it.qty ?? it.quantity);
      return {
        productId: str(it.productId) || str(it.id), name: str(it.name), hsn: str(it.hsn), qty,
        grossValue: round2(num(it.price) * qty), gstRate: null, taxableValue: null, gstAmount: null,
        orderItemIndex: index,
      };
    });
    return {
      snapshotPresent: false,
      suppliers: [{
        vendorId: opts.vendorId || "", kind: "ORDER_SUMMARY", title: "ORDER SUMMARY", subtitle: "Not a tax invoice",
        gstStatus: null, gstinVerified: null, gstin: null, supplierStateCode: null, lines,
        totals: { gross: round2(lines.reduce((s, l) => s + l.grossValue, 0)), taxable: null, gst: null },
        notes: [NO_SNAPSHOT_NOTE],
      }],
    };
  }

  const sellers = snap && snap.sellers && typeof snap.sellers === "object" ? (snap.sellers as Record<string, unknown>) : {};
  const orderItems = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
  const orderIndexOf = alignSnapshotToOrder(snapItems, orderItems);
  const vendorOrder: string[] = [];
  const byVendor = new Map<string, { line: SnapshotLine; orderItemIndex: number | null }[]>();
  snapItems.forEach((line, i) => {
    const vid = str(line?.vendorId);
    if (opts.vendorId && vid !== opts.vendorId) return;
    if (!byVendor.has(vid)) { byVendor.set(vid, []); vendorOrder.push(vid); }
    byVendor.get(vid)!.push({ line, orderItemIndex: orderIndexOf[i] });
  });

  const suppliers: SupplierInvoice[] = vendorOrder.map((vid) => {
    const seller = (sellers[vid] && typeof sellers[vid] === "object" ? sellers[vid] : {}) as Record<string, unknown>;
    const gstStatus = str(seller.gstStatus).toUpperCase();
    const gstinRaw = str(seller.gstin).trim().toUpperCase();
    const gstinVerified = recordedGstinVerified(seller);
    const verified = gstinVerified === true;
    const gstin = isValidGstin(gstinRaw) ? gstinRaw : null;
    const cls: Pick<SupplierInvoice, "kind" | "title" | "subtitle"> = formal
      ? classify(gstStatus, gstinRaw, verified)
      : { kind: "ORDER_SUMMARY", title: "ORDER SUMMARY", subtitle: "Not a tax invoice" };
    const taxDoc = cls.kind === "TAX_INVOICE";
    const lines: InvoiceLine[] = byVendor.get(vid)!.map(({ line: l, orderItemIndex }) => ({
      productId: str(l.productId),
      name: str(l.name),
      hsn: str(l.hsn),
      qty: num(l.qty),
      grossValue: round2(num(l.grossValue)),
      gstRate: taxDoc ? num(l.gstRate) : null,
      taxableValue: taxDoc ? round2(num(l.taxableValue)) : null,
      gstAmount: taxDoc ? round2(num(l.gstAmount)) : null,
      orderItemIndex,
    }));
    const notes: string[] = [];
    if (!formal) {
      notes.push(INTERIM_NOT_TAX_DOCUMENT_NOTE);
    } else {
      if (taxDoc) notes.push(PLACE_OF_SUPPLY_NOTE);
      if (cls.kind === "ORDER_SUMMARY") {
        notes.push(gstStatus === "REGISTERED" && gstin && !verified ? GST_NOT_VERIFIED_NOTE : STATUS_NOT_RECORDED_NOTE);
      }
      if (gstStatus === "COMPOSITION" && gstin && !verified) notes.push(COMPOSITION_GSTIN_NOT_VERIFIED_NOTE);
    }
    return {
      vendorId: vid,
      ...cls,
      gstStatus: gstStatus || null,
      gstinVerified,
      // A GSTIN is printed only when it is well-formed, recorded as VERIFIED,
      // AND the document is one a GSTIN belongs on (a tax invoice, or a
      // composition bill of supply).
      gstin: formal && verified && (cls.kind === "TAX_INVOICE" || gstStatus === "COMPOSITION") ? gstin : null,
      supplierStateCode: formal && gstin ? gstinStateCode(gstin) : null,
      lines,
      totals: {
        gross: round2(lines.reduce((s, l) => s + l.grossValue, 0)),
        taxable: taxDoc ? round2(lines.reduce((s, l) => s + (l.taxableValue || 0), 0)) : null,
        gst: taxDoc ? round2(lines.reduce((s, l) => s + (l.gstAmount || 0), 0)) : null,
      },
      notes,
    };
  });

  return { snapshotPresent: true, suppliers };
}

/**
 * The documents a given viewer may see. A SELLER sees only their own document,
 * and FAILS CLOSED: with no seller id there is nothing to show (never every
 * seller's document). Customer and admin views show every seller's document.
 */
export function invoiceDocumentsFor(
  order: unknown,
  viewer: "customer" | "seller" | "admin"
): InvoiceTaxView {
  if (viewer === "seller") {
    const vendorId = (order as { vendorId?: unknown } | null | undefined)?.vendorId;
    const vid = typeof vendorId === "string" ? vendorId.trim() : "";
    if (!vid) return { snapshotPresent: false, suppliers: [] };
    return buildInvoiceTax(order, { vendorId: vid });
  }
  return buildInvoiceTax(order);
}

/**
 * A seller page holds only its own allow-listed slice of the snapshot
 * (lib/sellerOrders/sellerOrderView `tax`). Rebuild the snapshot shape from it
 * so the seller's invoice runs through exactly the same buildInvoiceTax().
 */
export function taxSnapshotFromSellerView(
  tax: { gstStatus?: unknown; gstin?: unknown; gstinVerified?: unknown; lines?: unknown } | null | undefined,
  vendorUid: string
): {
  items: Record<string, unknown>[];
  sellers: Record<string, { gstStatus: string; gstin: string; gstinVerified?: boolean }>;
} | undefined {
  if (!tax || !Array.isArray(tax.lines) || !vendorUid) return undefined;
  return {
    // The slice keeps the seller's lines in order-line order, so the page's
    // own items (the same lines, same order) pair with them by position.
    items: (tax.lines as Record<string, unknown>[]).map((l) => ({ ...l, vendorId: vendorUid })),
    sellers: {
      [vendorUid]: {
        gstStatus: str(tax.gstStatus), gstin: str(tax.gstin),
        ...(typeof tax.gstinVerified === "boolean" ? { gstinVerified: tax.gstinVerified } : {}),
      },
    },
  };
}

/** The order-line fields the invoice components read (display only). */
export type InvoiceOrderItem = {
  id?: string;
  productId?: string;
  vendorId?: string;
  vendorName?: string;
  attributes?: Record<string, unknown>;
  color?: string;
  size?: string;
};
/** The order fields the seller block and items table read (display only). */
export type InvoiceOrderLike = {
  items?: InvoiceOrderItem[];
  vendorName?: string;
  vendorPhone?: string;
  vendorEmail?: string;
  vendorAddress?: string;
  vendorId?: string;
};

/** Labels for a document's reference block, by document kind (never "invoice" on a non-invoice). */
export function documentLabels(kind: InvoiceDocumentKind): { section: string; number: string; date: string } {
  if (kind === "TAX_INVOICE") return { section: "Invoice Information", number: "Invoice No", date: "Invoice Date" };
  if (kind === "BILL_OF_SUPPLY") return { section: "Bill of Supply Information", number: "Bill No", date: "Bill Date" };
  return { section: "Order Summary", number: "Reference No", date: "Order Date" };
}

/**
 * The supplier's display name for a document: the seller name on one of that
 * seller's own order lines, else the order-level name. Never invents a legal
 * entity — "the seller" when nothing is recorded.
 */
export function supplierDisplayName(order: InvoiceOrderLike, vendorId: string): string {
  const line = vendorId ? (order.items || []).find((it) => it?.vendorId === vendorId) : undefined;
  return line?.vendorName || order.vendorName || "the seller";
}
