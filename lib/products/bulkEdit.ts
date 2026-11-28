// ==========================================
// YOMICO Marketplace
// lib/products/bulkEdit.ts
// ==========================================
//
// Bulk Product Edit (V1) — the exported sheet's columns, how an edited row is
// read, and the request/response shapes. Shared by the seller page
// (app/seller/products/bulk-edit) and the server route
// (app/api/seller/bulk-edit-products), which is the enforcement.
//
// Only OPERATIONAL fields are editable here: MRP, selling price, stock, GST
// rate, HSN, return days, warranty and weight. Name, description, brand,
// photos, category and variants stay with the product form (Edit). Every
// change is then applied by the SAME edit logic the form uses
// (lib/products/sellerProductUpdate.ts): the money/MRP/₹499 policy, the
// derived discount, the category lock and the re-review of an MRP change on a
// live product all apply unchanged.
//
// An empty cell keeps the product's current value. Rows carry the product's
// id and a version taken at export, so a row whose product changed since the
// file was downloaded (e.g. stock sold) is skipped instead of overwriting it.
//
// Dependency-free apart from shared pure modules.

import { numberCell } from "@/lib/products/bulkUpload";
import { MAX_RETURN_DAYS, MIN_RETURN_DAYS } from "@/lib/returnEligibility";
import { GST_SLABS, MIN_SELLING_PRICE } from "@/lib/products/sellerProductValidation";

/** Most rows one edited file may carry (a full export of a large catalogue). */
export const MAX_EDIT_ROWS = 500;
/** Most products one upload may actually change. */
export const MAX_CHANGED_ROWS = 100;

export const EDIT_SHEET = "Products";
export const EDIT_INSTRUCTIONS_SHEET = "Instructions";

/** The fields a bulk edit may change, in sheet order. */
export const BULK_EDIT_FIELDS = ["mrp", "sellingPrice", "stock", "gstRate", "hsn", "returnDays", "warranty", "weight"] as const;
export type BulkEditField = (typeof BULK_EDIT_FIELDS)[number];
const NUMERIC_FIELDS = new Set<BulkEditField>(["mrp", "sellingPrice", "stock", "gstRate", "returnDays", "weight"]);

export type EditColumnKey = "productId" | "productNumber" | "sku" | "title" | "status" | "variants" | BulkEditField | "version";
export type EditColumn = { key: EditColumnKey; header: string; editable: boolean; help: string };

export const EDIT_COLUMNS: readonly EditColumn[] = [
  { key: "productId", header: "Product ID (do not edit)", editable: false, help: "Identifies the product. Do not change it." },
  { key: "productNumber", header: "Product No.", editable: false, help: "For reference only." },
  { key: "sku", header: "SKU", editable: false, help: "For reference only." },
  { key: "title", header: "Product Name", editable: false, help: "For reference only — change it with Edit." },
  { key: "status", header: "Status", editable: false, help: "For reference only." },
  { key: "variants", header: "Variants", editable: false, help: "Products with variants keep per-variant stock: change their stock with Edit." },
  { key: "mrp", header: "MRP (₹)", editable: true, help: "Changing the MRP of a live product sends it for review again." },
  { key: "sellingPrice", header: "Selling Price (₹)", editable: true, help: `At least ₹${MIN_SELLING_PRICE} and not more than the MRP.` },
  { key: "stock", header: "Stock", editable: true, help: "Whole number, 0 or more." },
  { key: "gstRate", header: "GST Rate (%)", editable: true, help: `One of ${GST_SLABS.join(", ")}.` },
  { key: "hsn", header: "HSN Code", editable: true, help: "4 to 8 digits." },
  { key: "returnDays", header: "Return Days", editable: true, help: `${MIN_RETURN_DAYS}–${MAX_RETURN_DAYS} days.` },
  { key: "warranty", header: "Warranty", editable: true, help: "Up to 100 characters." },
  { key: "weight", header: "Weight (kg)", editable: true, help: "0 to 1000 kg." },
  { key: "version", header: "Version (do not edit)", editable: false, help: "Lets YOMICO tell whether the product changed after you downloaded this file." },
];

export const FIELD_LABEL: Record<BulkEditField, string> = {
  mrp: "MRP", sellingPrice: "Selling Price", stock: "Stock", gstRate: "GST Rate", hsn: "HSN Code",
  returnDays: "Return Days", warranty: "Warranty", weight: "Weight",
};

// ------------------------------------------
// Export (server -> page -> sheet)
// ------------------------------------------

export type ExportRow = {
  productId: string;
  productNumber: string;
  sku: string;
  title: string;
  status: string;
  variants: string;
  values: Partial<Record<BulkEditField, string | number>>;
  version: string;
};

/** One exported row as sheet cells, in EDIT_COLUMNS order. */
export function exportRowCells(row: ExportRow): (string | number)[] {
  return EDIT_COLUMNS.map((c) => {
    if ((BULK_EDIT_FIELDS as readonly string[]).includes(c.key)) return row.values[c.key as BulkEditField] ?? "";
    return (row as unknown as Record<string, string>)[c.key] ?? "";
  });
}

// ------------------------------------------
// Edited sheet -> rows
// ------------------------------------------

const headerKey = (h: unknown) => String(h ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
const HEADER_TO_KEY: Map<string, EditColumnKey> = new Map(EDIT_COLUMNS.map((c) => [headerKey(c.header), c.key]));
const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const text = (v: unknown) => (isBlank(v) ? "" : String(v).replace(/\s+/g, " ").trim());

export type EditedRow = {
  rowNumber: number;
  productId: string;
  version: string;
  title: string;
  /** The editable values the row states (an empty cell is absent = keep). */
  values: Partial<Record<BulkEditField, string | number>>;
  errors: string[];
};

export type EditSheetResult = { ok: true; rows: EditedRow[] } | { ok: false; error: string };

/**
 * The rows of an edited export, given as a cell matrix (first row = headers).
 * Product ID and Version are required columns; an editable column the seller
 * deleted simply changes nothing. Empty rows are skipped; rowNumber is the
 * spreadsheet row the seller sees.
 */
export function editRowsFromSheet(matrix: unknown[][]): EditSheetResult {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { ok: false, error: "The sheet is empty. Download your products from this page, edit that file, and upload it." };
  }
  const header = Array.isArray(matrix[0]) ? matrix[0] : [];
  const columnOf = new Map<EditColumnKey, number>();
  header.forEach((h, i) => {
    const key = HEADER_TO_KEY.get(headerKey(h));
    if (key && !columnOf.has(key)) columnOf.set(key, i);
  });
  if (!columnOf.has("productId") || !columnOf.has("version")) {
    return { ok: false, error: "This file is missing the Product ID or Version column. Download your products from this page and edit that file." };
  }
  if (!BULK_EDIT_FIELDS.some((f) => columnOf.has(f))) {
    return { ok: false, error: "This file has no editable columns (MRP, Selling Price, Stock, …)." };
  }
  const rows: EditedRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = Array.isArray(matrix[r]) ? matrix[r] : [];
    const cell = (key: EditColumnKey) => (columnOf.has(key) ? line[columnOf.get(key)!] : undefined);
    const all = [...columnOf.values()].map((i) => line[i]);
    if (all.every(isBlank)) continue;
    rows.push(readEditedRow(r + 1, cell));
  }
  if (rows.length === 0) return { ok: false, error: "No products found in this file." };
  if (rows.length > MAX_EDIT_ROWS) {
    return { ok: false, error: `This file has ${rows.length} products. Upload at most ${MAX_EDIT_ROWS} at a time.` };
  }
  return { ok: true, rows: markDuplicateProductIds(rows) };
}

function readEditedRow(rowNumber: number, cell: (key: EditColumnKey) => unknown): EditedRow {
  const errors: string[] = [];
  const productId = text(cell("productId"));
  const version = text(cell("version"));
  if (!productId) errors.push("Product ID is missing — this row can't be matched to a product.");
  if (!version) errors.push("Version is missing — download your products again and edit that file.");
  const values: EditedRow["values"] = {};
  for (const field of BULK_EDIT_FIELDS) {
    const raw = cell(field);
    if (isBlank(raw)) continue; // empty cell = keep the current value
    if (NUMERIC_FIELDS.has(field)) {
      const n = numberCell(raw);
      if (n === null) errors.push(`${FIELD_LABEL[field]} must be a number.`);
      else values[field] = n;
    } else {
      values[field] = text(raw);
    }
  }
  errors.push(...editValueErrors(values));
  return { rowNumber, productId, version, title: text(cell("title")), values, errors: [...new Set(errors)] };
}

/** Flags every row whose Product ID appears more than once in the file. */
function markDuplicateProductIds(rows: EditedRow[]): EditedRow[] {
  const byId = new Map<string, number[]>();
  for (const r of rows) if (r.productId) byId.set(r.productId, [...(byId.get(r.productId) || []), r.rowNumber]);
  return rows.map((r) => {
    const same = byId.get(r.productId) || [];
    if (same.length < 2) return r;
    return { ...r, errors: [...r.errors, `This product is also in row ${same.filter((n) => n !== r.rowNumber).join(", ")}. Keep one row per product.`] };
  });
}

/**
 * Value checks that need no product (the rest — MRP / ₹499 policy, GST slab,
 * whole-unit stock, return days — run on the product as it will be after the
 * edit, server-side, in lib/products/sellerProductUpdate.ts).
 */
export function editValueErrors(values: Partial<Record<BulkEditField, unknown>>): string[] {
  const errors: string[] = [];
  if (values.hsn !== undefined && !(typeof values.hsn === "string" && /^\d{4,8}$/.test(values.hsn))) errors.push("HSN Code must be 4 to 8 digits.");
  if (values.warranty !== undefined && !(typeof values.warranty === "string" && values.warranty.length <= 100)) errors.push("Warranty must be at most 100 characters.");
  if (values.weight !== undefined && !(typeof values.weight === "number" && values.weight >= 0 && values.weight <= 1000)) errors.push("Weight must be between 0 and 1000 kg.");
  return errors;
}

/**
 * The submitted values, checked on the server: only bulk-edit fields, numbers
 * as numbers and text as text, plus editValueErrors. Returns the clean values.
 */
export function checkSubmittedEditValues(values: unknown): { ok: true; values: Partial<Record<BulkEditField, string | number>> } | { ok: false; errors: string[] } {
  if (!values || typeof values !== "object" || Array.isArray(values)) return { ok: false, errors: ["No values to update."] };
  const v = values as Record<string, unknown>;
  const errors: string[] = [];
  const notEditable = Object.keys(v).filter((k) => !(BULK_EDIT_FIELDS as readonly string[]).includes(k));
  if (notEditable.length) errors.push(`These fields can't be changed with Bulk Edit: ${notEditable.join(", ")}`);
  const clean: Partial<Record<BulkEditField, string | number>> = {};
  for (const field of BULK_EDIT_FIELDS) {
    const value = v[field];
    if (value === undefined) continue;
    if (NUMERIC_FIELDS.has(field)) {
      if (typeof value !== "number" || !Number.isFinite(value)) { errors.push(`${FIELD_LABEL[field]} must be a number.`); continue; }
    } else if (typeof value !== "string") { errors.push(`${FIELD_LABEL[field]} must be text.`); continue; }
    clean[field] = value as string | number;
  }
  errors.push(...editValueErrors(clean));
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, values: clean };
}

// ------------------------------------------
// Request / response shapes (route <-> page)
// ------------------------------------------

export type EditRowRequest = { rowNumber: number; productId: string; version: string; values: Partial<Record<BulkEditField, string | number>> };
export type EditRowStatus = "ready" | "updated" | "unchanged" | "stale" | "error";
export type FieldChange = { field: BulkEditField; from: unknown; to: unknown };
export type EditRowResult = {
  rowNumber: number;
  productId: string;
  status: EditRowStatus;
  title?: string;
  changes?: FieldChange[];
  /** The change sends a live product back to admin review (e.g. MRP). */
  reReview?: boolean;
  errors?: string[];
};
export type EditResponse = {
  mode: "check" | "apply";
  results: EditRowResult[];
  summary: Record<EditRowStatus, number>;
};

export function summarizeEdits(results: EditRowResult[]): Record<EditRowStatus, number> {
  const s: Record<EditRowStatus, number> = { ready: 0, updated: 0, unchanged: 0, stale: 0, error: 0 };
  for (const r of results) s[r.status]++;
  return s;
}
