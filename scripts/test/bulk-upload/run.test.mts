/*
 * Plain-Node test (no emulator) — Bulk Product Upload rules and template
 * (lib/products/bulkUpload.ts, lib/products/bulkTemplate.ts).
 *
 * Proves: the template round-trips (header-only Products sheet, so no example
 * product can be imported; every listed category code resolves); sheet rows
 * are read with the spreadsheet's own row numbers; every row rule — required
 * columns, the ₹499 / MRP pricing policy, GST slab, whole-unit stock, return
 * days, category, SKU, photos — is enforced; duplicate SKUs in one file are
 * flagged; and the server's re-check accepts only the bulk product shape with
 * photos from this seller's own Storage folder, rebuilding the product itself.
 *
 * Run: npx tsx scripts/test/bulk-upload/run.test.mts
 */
import * as XLSX from "xlsx";
import {
  BULK_COLUMNS, BULK_PRODUCT_KEYS, CATEGORIES_SHEET, INSTRUCTIONS_SHEET, MAX_BULK_ROWS, TEMPLATE_SHEET,
  categoryOptions, checkSubmittedBulkProduct, draftFromRow, isOwnProductImageUrl, markDuplicateSkus,
  resolveCategoryCode, rowsFromSheet, withImages, type RawBulkRow,
} from "../../../lib/products/bulkUpload.ts";
import { buildTemplateWorkbook, readProductsMatrix } from "../../../lib/products/bulkTemplate.ts";
import { SELLER_PRODUCT_FIELDS } from "../../../lib/products/sellerProductFields.ts";

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
}

const HEADERS = BULK_COLUMNS.map((c) => c.header);
const base = {
  sku: "LAMP-001", title: "Brass Table Lamp", shortTitle: "", description: "A brass lamp.", brand: "Lumo", model: "",
  categoryCode: "MEN_TSHIRT_ROUND_NECK", mrp: 999, sellingPrice: 799, stock: 10, gstRate: 12, hsn: "", returnDays: "",
  warranty: "", weight: "", imageFiles: "lamp1.jpg, lamp2.jpg",
};
const row = (over: Record<string, unknown> = {}, rowNumber = 2): RawBulkRow => ({ rowNumber, cells: { ...base, ...over } as never });
const errorsOf = (over: Record<string, unknown>) => draftFromRow(row(over)).errors;
const has = (errs: string[], re: RegExp) => errs.some((e) => re.test(e));

// ---- template ----
{
  const wb = buildTemplateWorkbook();
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const matrix = readProductsMatrix(buf);
  check("T1 template has Products, Instructions and Categories sheets",
    [TEMPLATE_SHEET, INSTRUCTIONS_SHEET, CATEGORIES_SHEET].every((s) => wb.SheetNames.includes(s)));
  check("T2 Products sheet is the header row ONLY (no example product to import by accident)",
    matrix.length === 1 && JSON.stringify(matrix[0]) === JSON.stringify(HEADERS));
  const parsed = rowsFromSheet(matrix);
  check("T3 an untouched template is refused with a clear 'no products' message", !parsed.ok && /No products found/.test((parsed as any).error));
  const cats = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[CATEGORIES_SHEET], { header: 1 }).slice(1);
  check("T4 every Categories-sheet code resolves to a real path (and the list is the full catalog)",
    cats.length === categoryOptions().length && cats.length > 300 && cats.every((c) => !!resolveCategoryCode(String(c[0]))), String(cats.length));
  const instr = JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[INSTRUCTIONS_SHEET], { header: 1 }));
  check("T5 Instructions state the ₹499 minimum and the duplicate-safe re-upload", instr.includes("₹499") && /never creates duplicates/.test(instr));
}

// ---- reading a filled sheet ----
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    HEADERS,
    BULK_COLUMNS.map((c) => (base as any)[c.key]),
    [],
    BULK_COLUMNS.map((c) => ({ ...base, sku: "LAMP-002", mrp: "1,299", sellingPrice: "₹999", gstRate: "18%" } as any)[c.key]),
  ]), TEMPLATE_SHEET);
  const matrix = readProductsMatrix(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const parsed = rowsFromSheet(matrix);
  const drafts = parsed.ok ? parsed.rows.map(draftFromRow) : [];
  check("S1 rows keep the spreadsheet's own row numbers (a blank row is skipped, not renumbered)",
    parsed.ok && parsed.rows.map((r) => r.rowNumber).join() === "2,4", parsed.ok ? parsed.rows.map((r) => r.rowNumber).join() : (parsed as any).error);
  check("S2 text numbers like '1,299', '₹999', '18%' are read exactly; both rows valid",
    drafts.length === 2 && drafts.every((d) => d.errors.length === 0) && drafts[1].product.mrp === 1299 &&
    drafts[1].product.sellingPrice === 999 && drafts[1].product.gstRate === 18, JSON.stringify(drafts.map((d) => d.errors)));
  const csv = readProductsMatrix(new TextEncoder().encode(`${HEADERS.join(",")}\nCSV-1,Steel Bottle,,Bottle,Brand,,MEN_TSHIRT_ROUND_NECK,999,599,5,18,,,,,b.jpg\n`).buffer as ArrayBuffer);
  const csvParsed = rowsFromSheet(csv);
  check("S3 a .csv with the template headers is read too", csvParsed.ok && draftFromRow(csvParsed.rows[0]).errors.length === 0);
  const noPrice = rowsFromSheet([HEADERS.filter((h) => !h.startsWith("Selling Price")), ["x"]]);
  check("S4 a missing required column is refused by name", !noPrice.ok && /Selling Price/.test((noPrice as any).error));
  const tooMany = rowsFromSheet([HEADERS, ...Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => [`S${i}`])]);
  check(`S5 more than ${MAX_BULK_ROWS} products in one file is refused`, !tooMany.ok && /at most 50/.test((tooMany as any).error));
  const lowerHeaders = rowsFromSheet([HEADERS.map((h) => h.toLowerCase().replace(" *", "")), BULK_COLUMNS.map((c) => (base as any)[c.key])]);
  check("S6 headers match case-insensitively and without the * marker", lowerHeaders.ok);
}

// ---- row rules ----
{
  const ok = draftFromRow(row());
  check("R1 a complete row is valid and becomes the form's simple-product shape",
    ok.errors.length === 0 && ok.product.categoryId === "FASHION" && ok.product.subCategoryId === "FASHION_MEN" &&
    ok.product.leafCategoryId === "MEN_TSHIRT_ROUND_NECK" && ok.product.slug === "brass-table-lamp" && ok.product.returnDays === 7 &&
    Array.isArray(ok.product.variants) && (ok.product.variants as unknown[]).length === 0 && ok.product.currency === "INR",
    JSON.stringify(ok.errors));
  check("R2 every product key is a seller product field (lib/products/sellerProductFields)",
    BULK_PRODUCT_KEYS.every((k) => (SELLER_PRODUCT_FIELDS as readonly string[]).includes(k)));
  check("R3 ₹499 minimum: 498 refused, exactly 499 accepted", has(errorsOf({ sellingPrice: 498 }), /at least ₹499/) && errorsOf({ sellingPrice: 499, mrp: 499 }).length === 0);
  check("R4 selling price above MRP refused; MRP missing refused", has(errorsOf({ sellingPrice: 1200 }), /more than the MRP/) && has(errorsOf({ mrp: "" }), /MRP is required/));
  check("R5 GST rate must be a slab (7 refused)", has(errorsOf({ gstRate: 7 }), /GST rate must be one of/));
  check("R6 stock must be a whole number of 0 or more (2.5 and -1 refused, 0 accepted)",
    has(errorsOf({ stock: 2.5 }), /Stock must be a whole number/) && has(errorsOf({ stock: -1 }), /Stock must be a whole number/) && errorsOf({ stock: 0 }).length === 0);
  check("R7 return days 1–30 (45 refused, blank = 7)", has(errorsOf({ returnDays: 45 }), /Return days must be/) && draftFromRow(row({ returnDays: "" })).product.returnDays === 7);
  check("R8 non-numeric price refused, never coerced", has(errorsOf({ sellingPrice: "eight hundred" }), /Selling Price must be a number/));
  check("R9 unknown category refused; a lower-case code is accepted",
    has(errorsOf({ categoryCode: "NOT_A_CATEGORY" }), /not a YOMICO category/) && errorsOf({ categoryCode: "men_tshirt_round_neck" }).length === 0);
  check("R10 required text: SKU, name, description, brand", ["sku", "title", "description", "brand"].every((k) => errorsOf({ [k]: "" }).length > 0));
  check("R11 SKU characters and HSN digits are checked", has(errorsOf({ sku: "LAMP 001!" }), /SKU may only use/) && has(errorsOf({ hsn: "61A9" }), /HSN Code must be/) && errorsOf({ hsn: 61091000 }).length === 0);
  check("R12 photos: none refused, 6 refused, repeated names counted once",
    has(errorsOf({ imageFiles: "" }), /Image Files is required/) && has(errorsOf({ imageFiles: "a,b,c,d,e,f" }), /At most 5 photos/) &&
    draftFromRow(row({ imageFiles: "a.jpg, A.JPG; b.jpg" })).imageNames.join() === "a.jpg,b.jpg");
  const dups = markDuplicateSkus([draftFromRow(row({}, 2)), draftFromRow(row({ sku: "lamp-001" }, 3)), draftFromRow(row({ sku: "OTHER" }, 4))]);
  check("R13 the same SKU twice in one file (case-insensitive) flags BOTH rows; others untouched",
    has(dups[0].errors, /also used in row 3/) && has(dups[1].errors, /also used in row 2/) && dups[2].errors.length === 0);
}

// ---- photo URLs ----
{
  const BUCKET = "yogi-mart.firebasestorage.app";
  const url = (path: string, bucket = BUCKET, origin = "https://firebasestorage.googleapis.com") =>
    `${origin}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=t`;
  const pol = { bucket: BUCKET };
  check("U1 own photo (products/{uid}/file) accepted", isOwnProductImageUrl(url("products/u1/a.jpg"), "u1", pol));
  check("U2 another seller's folder, another bucket, a nested or traversal path, http, other host, credentials — all refused",
    [url("products/u2/a.jpg"), url("products/u1/a.jpg", "evil-bucket"), url("products/u1/x/a.jpg"), url("products/u1/../u2/a.jpg"),
      url("products/u1/a.jpg", BUCKET, "http://firebasestorage.googleapis.com"), url("products/u1/a.jpg", BUCKET, "https://evil.example"),
      url("products/u1/a.jpg", BUCKET, "https://x:y@firebasestorage.googleapis.com"), url("vendor-store/u1/a.jpg"), "not a url", 42,
    ].every((u) => !isOwnProductImageUrl(u, "u1", pol)));
  const emu = url("products/u1/a.jpg", BUCKET, "http://127.0.0.1:9199");
  check("U3 emulator URLs only when the emulator switch is on", !isOwnProductImageUrl(emu, "u1", pol) && isOwnProductImageUrl(emu, "u1", { ...pol, allowEmulator: true }));

  // ---- the server's re-check ----
  const opts = { uid: "u1", requireImages: true, images: pol };
  const good = withImages(draftFromRow(row()).product, [url("products/u1/a.jpg"), url("products/u1/b.jpg")]);
  const okRes = checkSubmittedBulkProduct(good, opts);
  check("V1 a page-built product passes and is rebuilt by the server", okRes.ok && (okRes as any).product.thumbnail === good.images?.[0 as never]);
  const errs = (p: unknown, o = opts) => { const r = checkSubmittedBulkProduct(p, o); return r.ok ? [] : r.errors; };
  check("V2 server-owned or non-bulk fields refused (vendorId, approved, costPrice, price)",
    has(errs({ ...good, vendorId: "u2" }), /can't be set: vendorId/) && has(errs({ ...good, approved: true }), /can't be set: approved/) &&
    has(errs({ ...good, costPrice: 1 }), /does not set: costPrice/) && has(errs({ ...good, price: 799 }), /does not set: price/));
  check("V3 the ₹499 floor is enforced on the server too (a forged 100 refused)", has(errs({ ...good, sellingPrice: 100 }), /at least ₹499/));
  check("V4 numbers must be numbers and text must be text (no coercion of '799' or an object SKU)",
    has(errs({ ...good, sellingPrice: "799" }), /Selling Price must be a number/) && has(errs({ ...good, sku: { $gt: "" } }), /sku must be text/));
  check("V5 tampered derived fields refused (category path, slug, variants, specifications, minStock)",
    has(errs({ ...good, categoryId: "ELECTRONICS" }), /categoryId does not match/) && has(errs({ ...good, slug: "x" }), /slug does not match/) &&
    has(errs({ ...good, variants: [{ id: "v", price: 0, stock: 1 }] }), /variants does not match/) &&
    has(errs({ ...good, specifications: { a: "b" } }), /specifications does not match/) && has(errs({ ...good, minStock: 0 }), /minStock does not match/));
  check("V6 photos: required on import, must be own, distinct, main photo first, at most 5",
    has(errs({ ...good, images: undefined, thumbnail: undefined }), /At least one photo/) &&
    has(errs({ ...good, images: [url("products/u2/a.jpg")], thumbnail: url("products/u2/a.jpg") }), /ones you uploaded/) &&
    has(errs({ ...good, images: [good.thumbnail, good.thumbnail] }), /listed twice/) &&
    has(errs({ ...good, thumbnail: (good.images as string[])[1] }), /main photo must be the first/) &&
    has(errs({ ...good, images: Array.from({ length: 6 }, (_, i) => url(`products/u1/${i}.jpg`)) }), /At most 5 photos/));
  const { images: _i, thumbnail: _t, ...noPhotos } = good as any;
  check("V7 check mode needs no photos yet", errs(noPhotos, { ...opts, requireImages: false }).length === 0);
  const spaced = checkSubmittedBulkProduct({ ...good, title: "  Brass   Table Lamp ", sku: " LAMP-001 " }, opts);
  check("V8 the stored values are the server's normalised ones, not the browser's", spaced.ok && (spaced as any).product.title === "Brass Table Lamp" && (spaced as any).product.sku === "LAMP-001");
  check("V9 not an object -> refused", has(errs(null), /missing/) && has(errs([good]), /missing/));
}

console.log(`\n${pass}/${pass + fail} bulk-upload checks passed`);
process.exit(fail === 0 ? 0 : 1);
