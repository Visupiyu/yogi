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
// "VERIFIED" is the seller's taxVerificationStatus as recorded at confirmation
// (set only by YOMICO's admin GST review — app/api/admin/seller-tax-verification;
// never by the seller, never inferred from GSTIN format). isValidGstin() checks
// FORMAT only. Snapshots from before verification was recorded carry none, so
// they are never treated as verified.
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
};

export type SupplierInvoice = {
  vendorId: string;
  kind: InvoiceDocumentKind;
  title: string;
  subtitle: string;
  gstStatus: string | null;
  /** The seller's taxVerificationStatus as recorded at confirmation, or null. */
  taxVerificationStatus: string | null;
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
    const own = opts.vendorId ? items.filter((it) => str(it.vendorId) === opts.vendorId) : items;
    const lines: InvoiceLine[] = own.map((it) => {
      const qty = num(it.qty ?? it.quantity);
      return {
        productId: str(it.productId) || str(it.id), name: str(it.name), hsn: str(it.hsn), qty,
        grossValue: round2(num(it.price) * qty), gstRate: null, taxableValue: null, gstAmount: null,
      };
    });
    return {
      snapshotPresent: false,
      suppliers: [{
        vendorId: opts.vendorId || "", kind: "ORDER_SUMMARY", title: "ORDER SUMMARY", subtitle: "Not a tax invoice",
        gstStatus: null, taxVerificationStatus: null, gstin: null, supplierStateCode: null, lines,
        totals: { gross: round2(lines.reduce((s, l) => s + l.grossValue, 0)), taxable: null, gst: null },
        notes: [NO_SNAPSHOT_NOTE],
      }],
    };
  }

  const sellers = snap && snap.sellers && typeof snap.sellers === "object" ? (snap.sellers as Record<string, unknown>) : {};
  const vendorOrder: string[] = [];
  const byVendor = new Map<string, SnapshotLine[]>();
  for (const line of snapItems) {
    const vid = str(line?.vendorId);
    if (opts.vendorId && vid !== opts.vendorId) continue;
    if (!byVendor.has(vid)) { byVendor.set(vid, []); vendorOrder.push(vid); }
    byVendor.get(vid)!.push(line);
  }

  const suppliers: SupplierInvoice[] = vendorOrder.map((vid) => {
    const seller = (sellers[vid] && typeof sellers[vid] === "object" ? sellers[vid] : {}) as Record<string, unknown>;
    const gstStatus = str(seller.gstStatus).toUpperCase();
    const gstinRaw = str(seller.gstin).trim().toUpperCase();
    const verification = str(seller.taxVerificationStatus).toUpperCase();
    const verified = verification === "VERIFIED";
    const gstin = isValidGstin(gstinRaw) ? gstinRaw : null;
    const cls: Pick<SupplierInvoice, "kind" | "title" | "subtitle"> = formal
      ? classify(gstStatus, gstinRaw, verified)
      : { kind: "ORDER_SUMMARY", title: "ORDER SUMMARY", subtitle: "Not a tax invoice" };
    const taxDoc = cls.kind === "TAX_INVOICE";
    const lines: InvoiceLine[] = byVendor.get(vid)!.map((l) => ({
      productId: str(l.productId),
      name: str(l.name),
      hsn: str(l.hsn),
      qty: num(l.qty),
      grossValue: round2(num(l.grossValue)),
      gstRate: taxDoc ? num(l.gstRate) : null,
      taxableValue: taxDoc ? round2(num(l.taxableValue)) : null,
      gstAmount: taxDoc ? round2(num(l.gstAmount)) : null,
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
      taxVerificationStatus: verification || null,
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
  tax: { gstStatus?: unknown; gstin?: unknown; taxVerificationStatus?: unknown; lines?: unknown } | null | undefined,
  vendorUid: string
): {
  items: Record<string, unknown>[];
  sellers: Record<string, { gstStatus: string; gstin: string; taxVerificationStatus: string }>;
} | undefined {
  if (!tax || !Array.isArray(tax.lines) || !vendorUid) return undefined;
  return {
    items: (tax.lines as Record<string, unknown>[]).map((l) => ({ ...l, vendorId: vendorUid })),
    sellers: {
      [vendorUid]: {
        gstStatus: str(tax.gstStatus), gstin: str(tax.gstin), taxVerificationStatus: str(tax.taxVerificationStatus),
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
