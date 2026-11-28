// ==========================================
// YOMICO Marketplace
// lib/products/bulkUpload.ts
// ==========================================
//
// Bulk Product Upload (V1) — the ONE definition of the Excel template, how a
// sheet row becomes a product, and what makes a row valid. Shared by the
// seller page (app/seller/products/bulk-upload: early feedback, before any
// photo is uploaded) and the server route (app/api/seller/bulk-create-products:
// the enforcement). The browser check is a convenience; the server re-runs
// everything here and is the authority.
//
// A bulk row is a SIMPLE product: one listing, no variants, no category
// specifications (both can be added afterwards with Edit). Everything a row
// becomes is a field of lib/products/sellerProductFields.ts, and every money
// rule is the existing one (lib/products/sellerProductValidation.ts) — MRP
// mandatory, selling price within [₹499, MRP], GST slab, whole-unit stock.
// Server-owned fields (vendor identity, product number, moderation, counters,
// timestamps) are never produced here.
//
// Dependency-free apart from shared pure modules: safe for the browser, the
// server route and plain-Node tests.

import { catalogTree } from "@/lib/catalog/catalogTree";
import { flattenTree } from "@/lib/catalog/categoryUtils";
import { MAX_RETURN_DAYS, MIN_RETURN_DAYS } from "@/lib/returnEligibility";
import { generateSlug } from "@/lib/products/helpers";
import {
  GST_SLABS,
  MIN_SELLING_PRICE,
  validateSellerProductMoney,
  validateSellerProductPricing,
} from "@/lib/products/sellerProductValidation";
import { unknownSellerProductFields } from "@/lib/products/sellerProductFields";

/** Most product rows one upload may carry (photos are uploaded per row). */
export const MAX_BULK_ROWS = 50;
/** The same limit as the single-product form. */
export const MAX_IMAGES_PER_PRODUCT = 5;
/** storage.rules products/{uid}/ accepts images under 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Defaults the single-product form starts every new product with. */
export const DEFAULT_RETURN_DAYS = 7;
const DEFAULT_MIN_STOCK = 5;
const DEFAULT_MAX_STOCK = 1000;

export const TEMPLATE_SHEET = "Products";
export const INSTRUCTIONS_SHEET = "Instructions";
export const CATEGORIES_SHEET = "Categories";

export type BulkColumnKey =
  | "sku" | "title" | "shortTitle" | "description" | "brand" | "model" | "categoryCode"
  | "mrp" | "sellingPrice" | "stock" | "gstRate" | "hsn" | "returnDays" | "warranty"
  | "weight" | "imageFiles";

export type BulkColumn = {
  key: BulkColumnKey;
  header: string;
  required: boolean;
  help: string;
  example: string | number;
};

/** The template's columns, in order. Headers are matched case-insensitively. */
export const BULK_COLUMNS: readonly BulkColumn[] = [
  { key: "sku", header: "SKU *", required: true, help: "Your own unique code for this product (letters, numbers, - _ . /). Used to stop the same product being added twice.", example: "TSHIRT-BLK-001" },
  { key: "title", header: "Product Name *", required: true, help: "Full product name shown on the product page (3–200 characters).", example: "Men's Cotton Round Neck T-Shirt" },
  { key: "shortTitle", header: "Short Title", required: false, help: "Optional short name for cards (up to 80 characters).", example: "Cotton T-Shirt" },
  { key: "description", header: "Description *", required: true, help: "Product description (up to 5000 characters).", example: "Soft 100% cotton t-shirt, regular fit." },
  { key: "brand", header: "Brand *", required: true, help: "Brand name.", example: "YourBrand" },
  { key: "model", header: "Model", required: false, help: "Optional model number or name.", example: "RN-01" },
  { key: "categoryCode", header: "Category Code *", required: true, help: `A code from the "${CATEGORIES_SHEET}" sheet. Pick the most specific one that fits.`, example: "MEN_TSHIRT_ROUND_NECK" },
  { key: "mrp", header: "MRP (₹) *", required: true, help: "Maximum retail price in rupees.", example: 999 },
  { key: "sellingPrice", header: "Selling Price (₹) *", required: true, help: `Your price in rupees, GST included. At least ₹${MIN_SELLING_PRICE} and not more than the MRP.`, example: 799 },
  { key: "stock", header: "Stock *", required: true, help: "Units available (whole number, 0 or more).", example: 25 },
  { key: "gstRate", header: "GST Rate (%) *", required: true, help: `One of ${GST_SLABS.join(", ")}.`, example: 5 },
  { key: "hsn", header: "HSN Code", required: false, help: "Optional HSN/SAC code (4 to 8 digits).", example: "6109" },
  { key: "returnDays", header: "Return Days", required: false, help: `Return window in days, ${MIN_RETURN_DAYS}–${MAX_RETURN_DAYS}. Leave blank for ${DEFAULT_RETURN_DAYS}.`, example: 7 },
  { key: "warranty", header: "Warranty", required: false, help: "Optional, e.g. \"6 months\".", example: "" },
  { key: "weight", header: "Weight (kg)", required: false, help: "Optional shipping weight in kg.", example: 0.25 },
  { key: "imageFiles", header: "Image Files *", required: true, help: `File names of the photos you select on the upload page, separated by commas (1 to ${MAX_IMAGES_PER_PRODUCT}). The first is the main photo.`, example: "tshirt-black-1.jpg, tshirt-black-2.jpg" },
];

// ------------------------------------------
// Categories
// ------------------------------------------

type CatalogNodeLike = { id: string; name: string; level: number; parentId?: string; active?: boolean };

let catalogIndex: Map<string, CatalogNodeLike> | null = null;
function catalog(): Map<string, CatalogNodeLike> {
  if (!catalogIndex) {
    catalogIndex = new Map();
    // Rebuilt from each node's own parentId, exactly as the form's
    // CategorySelector does; a repeated id keeps its first node, as there.
    for (const node of flattenTree(catalogTree) as CatalogNodeLike[]) {
      if (node.active !== false && !catalogIndex.has(node.id)) catalogIndex.set(node.id, node);
    }
  }
  return catalogIndex;
}

/** The path of node ids from the top-level category to `code`, or null. */
export function resolveCategoryCode(code: string): string[] | null {
  const index = catalog();
  const start = index.get(code.trim().toUpperCase());
  if (!start) return null;
  const path: string[] = [];
  const seen = new Set<string>();
  let node: CatalogNodeLike | undefined = start;
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.unshift(node.id);
    node = node.parentId ? index.get(node.parentId) : undefined;
  }
  return path;
}

/** Every selectable category code with its readable path, for the template. */
export function categoryOptions(): { code: string; path: string }[] {
  const index = catalog();
  return [...index.values()].map((node) => ({
    code: node.id,
    path: (resolveCategoryCode(node.id) || [node.id]).map((id) => index.get(id)?.name || id).join(" > "),
  }));
}

/**
 * The form's category fields for a resolved path: categoryId is the top
 * level, subCategoryId the second, leafCategoryId the code the seller chose.
 */
export function categoryFieldsFor(path: string[]) {
  return {
    categoryId: path[0] || "",
    subCategoryId: path[1] || "",
    leafCategoryId: path[path.length - 1] || "",
  };
}

// ------------------------------------------
// Sheet -> rows
// ------------------------------------------

const headerKey = (h: unknown) =>
  String(h ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

const HEADER_TO_KEY: Map<string, BulkColumnKey> = new Map(
  BULK_COLUMNS.map((c) => [headerKey(c.header), c.key])
);

export type RawBulkRow = { rowNumber: number; cells: Partial<Record<BulkColumnKey, unknown>> };

export type SheetParseResult =
  | { ok: true; rows: RawBulkRow[] }
  | { ok: false; error: string };

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/**
 * The product rows of a sheet given as a matrix (first row = headers, as
 * SheetJS sheet_to_json(..., { header: 1 }) returns it). Completely empty rows
 * are skipped; rowNumber is the spreadsheet row the seller sees (header = 1).
 */
export function rowsFromSheet(matrix: unknown[][]): SheetParseResult {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { ok: false, error: "The sheet is empty. Use the YOMICO template and add your products below the header row." };
  }
  const header = Array.isArray(matrix[0]) ? matrix[0] : [];
  const columnOf = new Map<BulkColumnKey, number>();
  header.forEach((h, i) => {
    const key = HEADER_TO_KEY.get(headerKey(h));
    if (key && !columnOf.has(key)) columnOf.set(key, i);
  });
  const missing = BULK_COLUMNS.filter((c) => c.required && !columnOf.has(c.key)).map((c) => c.header.replace(" *", ""));
  if (missing.length) {
    return { ok: false, error: `This file is missing required columns: ${missing.join(", ")}. Download the template and keep its header row.` };
  }
  const rows: RawBulkRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = Array.isArray(matrix[r]) ? matrix[r] : [];
    const cells: Partial<Record<BulkColumnKey, unknown>> = {};
    for (const [key, i] of columnOf) cells[key] = line[i];
    if (Object.values(cells).every(isBlank)) continue;
    rows.push({ rowNumber: r + 1, cells });
  }
  if (rows.length === 0) {
    return { ok: false, error: "No products found. Add one product per row below the header row." };
  }
  if (rows.length > MAX_BULK_ROWS) {
    return { ok: false, error: `This file has ${rows.length} products. Upload at most ${MAX_BULK_ROWS} at a time — split it into smaller files.` };
  }
  return { ok: true, rows };
}

// ------------------------------------------
// Cell parsing (strict: nothing is guessed)
// ------------------------------------------

const text = (v: unknown) => (isBlank(v) ? "" : String(v).replace(/\s+/g, " ").trim());
/** Description keeps the seller's line breaks. */
const longText = (v: unknown) => (isBlank(v) ? "" : String(v).replace(/\r\n?/g, "\n").trim());

/** A number from a cell: a real number, or text like "1,299" / "₹799" / "18%". */
export function numberCell(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/^₹\s*/, "").replace(/\s*%$/, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normalised SKU used for duplicate detection (case and spaces ignored). */
export function normalizeSku(sku: unknown): string {
  return text(sku).toUpperCase();
}

/** The image file names a row lists, in order, without duplicates. */
export function imageNamesOf(cell: unknown): string[] {
  const names = text(cell).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ------------------------------------------
// Row -> product
// ------------------------------------------

export type BulkRowDraft = {
  rowNumber: number;
  sku: string;
  title: string;
  imageNames: string[];
  /** The seller product fields this row becomes (images added at import). */
  product: Record<string, unknown>;
  errors: string[];
};

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const HSN_PATTERN = /^\d{4,8}$/;

/**
 * One sheet row as a product draft, with every problem found. Photos are not
 * part of the draft yet: the page uploads them and adds their URLs
 * (withImages) before import.
 */
export function draftFromRow(row: RawBulkRow): BulkRowDraft {
  const c = row.cells;
  const errors: string[] = [];

  const sku = text(c.sku);
  if (!sku) errors.push("SKU is required.");
  else if (!SKU_PATTERN.test(sku)) errors.push("SKU may only use letters, numbers and - _ . / (up to 64 characters).");

  const title = text(c.title);
  if (!title) errors.push("Product Name is required.");
  else if (title.length < 3 || title.length > 200) errors.push("Product Name must be 3 to 200 characters.");

  const shortTitle = text(c.shortTitle);
  if (shortTitle.length > 80) errors.push("Short Title must be at most 80 characters.");

  const description = longText(c.description);
  if (!description) errors.push("Description is required.");
  else if (description.length > 5000) errors.push("Description must be at most 5000 characters.");

  const brand = text(c.brand);
  if (!brand) errors.push("Brand is required.");
  else if (brand.length > 100) errors.push("Brand must be at most 100 characters.");

  const model = text(c.model);
  if (model.length > 100) errors.push("Model must be at most 100 characters.");

  const categoryCode = text(c.categoryCode);
  const path = categoryCode ? resolveCategoryCode(categoryCode) : null;
  if (!categoryCode) errors.push("Category Code is required.");
  else if (!path) errors.push(`Category Code "${categoryCode}" is not a YOMICO category. Use a code from the ${CATEGORIES_SHEET} sheet.`);

  const numeric = (key: BulkColumnKey, label: string, required: boolean): number | undefined => {
    if (isBlank(c[key])) {
      if (required) errors.push(`${label} is required.`);
      return undefined;
    }
    const n = numberCell(c[key]);
    if (n === null) errors.push(`${label} must be a number.`);
    return n === null ? undefined : n;
  };
  const mrp = numeric("mrp", "MRP", true);
  const sellingPrice = numeric("sellingPrice", "Selling Price", true);
  const stock = numeric("stock", "Stock", true);
  const gstRate = numeric("gstRate", "GST Rate", true);
  const returnDays = numeric("returnDays", "Return Days", false);
  const weight = numeric("weight", "Weight", false);
  if (weight !== undefined && (weight < 0 || weight > 1000)) errors.push("Weight must be between 0 and 1000 kg.");

  const hsn = text(c.hsn);
  if (hsn && !HSN_PATTERN.test(hsn)) errors.push("HSN Code must be 4 to 8 digits.");

  const warranty = text(c.warranty);
  if (warranty.length > 100) errors.push("Warranty must be at most 100 characters.");

  const imageNames = imageNamesOf(c.imageFiles);
  if (imageNames.length === 0) errors.push("Image Files is required: list at least one photo file name.");
  else if (imageNames.length > MAX_IMAGES_PER_PRODUCT) errors.push(`At most ${MAX_IMAGES_PER_PRODUCT} photos per product.`);

  // Exactly the fields the single-product form sends for a simple product.
  const product: Record<string, unknown> = {
    sku,
    slug: generateSlug(title),
    ...categoryFieldsFor(path || []),
    title,
    shortTitle,
    description,
    brand,
    model,
    mrp,
    sellingPrice,
    currency: "INR",
    hsn,
    gstRate,
    stock,
    minStock: DEFAULT_MIN_STOCK,
    maxStock: DEFAULT_MAX_STOCK,
    video: "",
    specifications: {},
    variants: [],
    weight: weight ?? 0,
    length: 0,
    width: 0,
    height: 0,
    warranty,
    returnDays: returnDays ?? DEFAULT_RETURN_DAYS,
    metaTitle: "",
    metaDescription: "",
    keywords: [],
  };

  // The existing money rules, verbatim. Only reported when the values parsed
  // (a "must be a number" error is already there otherwise).
  if ([mrp, sellingPrice, stock, gstRate].every((v) => v !== undefined)) {
    const money = validateSellerProductMoney(product);
    if (!money.ok) errors.push(...money.errors);
    const pricing = validateSellerProductPricing(product, { checkLegacyPrice: true });
    if (!pricing.ok) errors.push(...pricing.errors.filter((e) => !errors.includes(e)));
  } else if (returnDays !== undefined) {
    const money = validateSellerProductMoney({ ...product, sellingPrice: 1, stock: 0, gstRate: 0 });
    if (!money.ok) errors.push(...money.errors.filter((e) => /return days/i.test(e)));
  }

  return { rowNumber: row.rowNumber, sku, title, imageNames, product, errors: [...new Set(errors)] };
}

/** Flags every row whose SKU appears more than once in the same file. */
export function markDuplicateSkus(drafts: BulkRowDraft[]): BulkRowDraft[] {
  const rowsBySku = new Map<string, number[]>();
  for (const d of drafts) {
    const k = normalizeSku(d.sku);
    if (!k) continue;
    rowsBySku.set(k, [...(rowsBySku.get(k) || []), d.rowNumber]);
  }
  return drafts.map((d) => {
    const rows = rowsBySku.get(normalizeSku(d.sku)) || [];
    if (rows.length < 2) return d;
    const others = rows.filter((r) => r !== d.rowNumber).join(", ");
    return { ...d, errors: [...d.errors, `SKU "${d.sku}" is also used in row ${others}. Each product needs its own SKU.`] };
  });
}

/** The draft's product with its uploaded photo URLs (first = main photo). */
export function withImages(product: Record<string, unknown>, imageUrls: string[]): Record<string, unknown> {
  return { ...product, thumbnail: imageUrls[0] || "", images: imageUrls };
}

// ------------------------------------------
// Server-side validation of a submitted product
// ------------------------------------------

export type ImageUrlPolicy = {
  /** The project's Storage bucket the photos must be in. */
  bucket: string;
  /** Local emulator only: also accept http://127.0.0.1:9199 URLs. */
  allowEmulator?: boolean;
};

/**
 * True when `url` is a Firebase Storage download URL for an object this
 * seller uploaded: the project's own bucket, under products/{uid}/ — the
 * path storage.rules lets only that seller create.
 */
export function isOwnProductImageUrl(url: unknown, uid: string, policy: ImageUrlPolicy): boolean {
  if (typeof url !== "string" || url.length > 2048 || !uid) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const prod = u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com" && !u.port;
  const emu = policy.allowEmulator === true && u.protocol === "http:" && u.hostname === "127.0.0.1" && u.port === "9199";
  if (!prod && !emu) return false;
  if (u.username || u.password) return false;
  const m = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(u.pathname);
  if (!m || decodeURIComponent(m[1]) !== policy.bucket) return false;
  let objectPath: string;
  try { objectPath = decodeURIComponent(m[2]); } catch { return false; }
  const prefix = `products/${uid}/`;
  const name = objectPath.slice(prefix.length);
  return objectPath.startsWith(prefix) && name.length > 0 && !name.includes("/") && name !== "." && name !== "..";
}

/** The keys a bulk product carries: the draft's fields plus its photos. */
export const BULK_PRODUCT_KEYS: readonly string[] = [
  ...Object.keys(draftFromRow({ rowNumber: 0, cells: {} }).product),
  "thumbnail",
  "images",
];

const BULK_TEXT_KEYS = ["sku", "title", "shortTitle", "description", "brand", "model", "leafCategoryId", "hsn", "warranty"] as const;
const BULK_NUMBER_KEYS = { mrp: "MRP", sellingPrice: "Selling Price", stock: "Stock", gstRate: "GST Rate", returnDays: "Return Days", weight: "Weight" } as const;

export type SubmittedBulkProduct =
  | { ok: true; product: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * A product as the route receives it, checked and REBUILT by the server: the
 * product that is stored is derived here from the submitted values with the
 * sheet's own rules (draftFromRow), never the browser's object as sent. Only
 * the bulk product keys are accepted; text must be text and numbers numbers;
 * the category / slug / fixed simple-product fields must be exactly what the
 * rules derive; and, when photos are required (import), 1–5 photos this seller
 * uploaded, the first one as the main photo.
 */
export function checkSubmittedBulkProduct(
  product: unknown,
  opts: { uid: string; requireImages: boolean; images: ImageUrlPolicy }
): SubmittedBulkProduct {
  if (!product || typeof product !== "object" || Array.isArray(product)) return { ok: false, errors: ["Product data is missing."] };
  const p = product as Record<string, unknown>;
  const errors: string[] = [];

  const notSeller = unknownSellerProductFields(p);
  const notBulk = Object.keys(p).filter((k) => !BULK_PRODUCT_KEYS.includes(k) && !notSeller.includes(k));
  if (notSeller.length) errors.push(`These product fields can't be set: ${notSeller.join(", ")}`);
  if (notBulk.length) errors.push(`Bulk upload does not set: ${notBulk.join(", ")}`);

  const cell = (key: string): string => {
    const v = p[key];
    if (v === undefined) return "";
    if (typeof v !== "string") { errors.push(`${key} must be text.`); return ""; }
    return v;
  };
  const num = (key: keyof typeof BULK_NUMBER_KEYS): unknown => {
    const v = p[key];
    if (v !== undefined && typeof v !== "number") { errors.push(`${BULK_NUMBER_KEYS[key]} must be a number.`); return undefined; }
    return v;
  };
  const cells: Partial<Record<BulkColumnKey, unknown>> = {};
  for (const key of BULK_TEXT_KEYS) cells[key === "leafCategoryId" ? "categoryCode" : key] = cell(key);
  for (const key of Object.keys(BULK_NUMBER_KEYS) as (keyof typeof BULK_NUMBER_KEYS)[]) cells[key] = num(key);
  cells.imageFiles = "photos"; // photos are checked below, as URLs

  const re = draftFromRow({ rowNumber: 0, cells });
  errors.push(...re.errors);

  // Everything else the browser sent must equal what the rules derive.
  for (const key of Object.keys(re.product)) {
    if ((BULK_TEXT_KEYS as readonly string[]).includes(key) || key in BULK_NUMBER_KEYS) continue;
    if (p[key] !== undefined && stableJson(p[key]) !== stableJson(re.product[key])) {
      errors.push(`${key} does not match what bulk upload sets for this product.`);
    }
  }

  let imageUrls: string[] = [];
  const images = p.images;
  if (opts.requireImages || images !== undefined || p.thumbnail !== undefined) {
    if (!Array.isArray(images) || images.length === 0) errors.push("At least one photo is required.");
    else if (images.length > MAX_IMAGES_PER_PRODUCT) errors.push(`At most ${MAX_IMAGES_PER_PRODUCT} photos per product.`);
    else if (!images.every((u) => isOwnProductImageUrl(u, opts.uid, opts.images))) errors.push("Photos must be ones you uploaded on the bulk upload page.");
    else if (new Set(images).size !== images.length) errors.push("The same photo is listed twice.");
    else if (p.thumbnail !== images[0]) errors.push("The main photo must be the first photo.");
    else imageUrls = images as string[];
  }

  const unique = [...new Set(errors)];
  if (unique.length) return { ok: false, errors: unique };
  return { ok: true, product: imageUrls.length ? withImages(re.product, imageUrls) : re.product };
}

function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
}

// ------------------------------------------
// Request / response shapes (route <-> page)
// ------------------------------------------

export type BulkMode = "check" | "import";
export type BulkRowRequest = { rowNumber: number; product: Record<string, unknown> };
export type BulkRowStatus = "ready" | "created" | "duplicate" | "error";
export type BulkRowResult = {
  rowNumber: number;
  sku: string;
  status: BulkRowStatus;
  productId?: string;
  productNumber?: string;
  errors?: string[];
};
export type BulkResponse = {
  mode: BulkMode;
  results: BulkRowResult[];
  summary: Record<BulkRowStatus, number>;
};

export function summarize(results: BulkRowResult[]): Record<BulkRowStatus, number> {
  const s: Record<BulkRowStatus, number> = { ready: 0, created: 0, duplicate: 0, error: 0 };
  for (const r of results) s[r.status]++;
  return s;
}
