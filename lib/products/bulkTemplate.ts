// ==========================================
// YOMICO Marketplace
// lib/products/bulkTemplate.ts
// ==========================================
//
// The bulk-upload Excel template and the sheet reader, built on the `xlsx`
// package the seller and admin reports already use. Kept apart from
// lib/products/bulkUpload.ts so the rules module stays dependency-free; the
// seller page loads this one lazily.
//
// The "Products" sheet holds ONLY the header row: the worked example lives on
// the Instructions sheet, so an example product can never be imported by
// accident.

import * as XLSX from "xlsx";
import {
  BULK_COLUMNS,
  CATEGORIES_SHEET,
  INSTRUCTIONS_SHEET,
  MAX_BULK_ROWS,
  MAX_IMAGES_PER_PRODUCT,
  TEMPLATE_SHEET,
  categoryOptions,
} from "@/lib/products/bulkUpload";
import { MIN_SELLING_PRICE } from "@/lib/products/sellerProductValidation";

export const TEMPLATE_FILE_NAME = "yomico-bulk-products-template.xlsx";

/** The template workbook (Products, Instructions, Categories sheets). */
export function buildTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const products = XLSX.utils.aoa_to_sheet([BULK_COLUMNS.map((c) => c.header)]);
  products["!cols"] = BULK_COLUMNS.map((c) => ({ wch: Math.max(14, c.header.length + 4) }));
  XLSX.utils.book_append_sheet(wb, products, TEMPLATE_SHEET);

  const instructions = XLSX.utils.aoa_to_sheet([
    ["How to use this template"],
    [`1. Fill in one product per row on the "${TEMPLATE_SHEET}" sheet. Keep the header row as it is.`],
    [`2. Columns marked * are required. Up to ${MAX_BULK_ROWS} products per file.`],
    [`3. Selling Price must be at least ₹${MIN_SELLING_PRICE} and not more than the MRP. Prices include GST.`],
    [`4. Category Code: copy a code from the "${CATEGORIES_SHEET}" sheet.`],
    [`5. Image Files: type the file names of each product's photos (1 to ${MAX_IMAGES_PER_PRODUCT}, separated by commas), then select those photo files on the upload page together with this sheet.`],
    ["6. Each product needs its own SKU. A SKU you already use is skipped, so uploading the same file again never creates duplicates."],
    ["7. New products are sent to YOMICO for review and appear in your store once approved. Add variants (sizes, colours) or specifications later with Edit."],
    [],
    ["Column", "Required", "What to enter", "Example"],
    ...BULK_COLUMNS.map((c) => [c.header.replace(" *", ""), c.required ? "Yes" : "No", c.help, c.example]),
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 90 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, instructions, INSTRUCTIONS_SHEET);

  const categories = XLSX.utils.aoa_to_sheet([
    ["Category Code", "Category"],
    ...categoryOptions().map((o) => [o.code, o.path]),
  ]);
  categories["!cols"] = [{ wch: 36 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, categories, CATEGORIES_SHEET);

  return wb;
}

/** Downloads the template in the browser. */
export function downloadTemplate(): void {
  XLSX.writeFile(buildTemplateWorkbook(), TEMPLATE_FILE_NAME);
}

/**
 * The cell matrix of the products sheet of an uploaded workbook (.xlsx, .xls
 * or .csv): the "Products" sheet when present, else the first sheet.
 */
export function readProductsMatrix(data: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(data, { type: "array" });
  const name = wb.SheetNames.find((n) => n.trim().toLowerCase() === TEMPLATE_SHEET.toLowerCase()) || wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return [];
  // Blank rows are kept (and skipped by rowsFromSheet) so each row's index is
  // the spreadsheet row number the seller sees in error messages. The range
  // is read from A1 for the same reason.
  const ref = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  const range = ref ? { s: { r: 0, c: 0 }, e: ref.e } : undefined;
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true, range });
}
