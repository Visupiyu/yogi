// ==========================================
// YOMICO Marketplace
// lib/products/bulkEditTemplate.ts
// ==========================================
//
// The Bulk Edit workbook: the seller's products (one row each, from the
// server's export) plus an Instructions sheet. Built on the `xlsx` package
// the bulk upload and reports already use; the page loads it lazily. The
// edited file is read back with lib/products/bulkTemplate.ts
// readProductsMatrix (same "Products" sheet).

import * as XLSX from "xlsx";
import {
  EDIT_COLUMNS,
  EDIT_INSTRUCTIONS_SHEET,
  EDIT_SHEET,
  MAX_CHANGED_ROWS,
  exportRowCells,
  type ExportRow,
} from "@/lib/products/bulkEdit";
import { MIN_SELLING_PRICE } from "@/lib/products/sellerProductValidation";

export function editFileName(at = new Date()): string {
  return `yomico-my-products-${at.toISOString().slice(0, 10)}.xlsx`;
}

export function buildEditWorkbook(rows: ExportRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([EDIT_COLUMNS.map((c) => c.header), ...rows.map(exportRowCells)]);
  sheet["!cols"] = EDIT_COLUMNS.map((c) => ({ wch: c.key === "title" ? 40 : Math.max(12, c.header.length + 2) }));
  XLSX.utils.book_append_sheet(wb, sheet, EDIT_SHEET);

  const editable = EDIT_COLUMNS.filter((c) => c.editable).map((c) => c.header).join(", ");
  const instructions = XLSX.utils.aoa_to_sheet([
    ["How to edit your products"],
    [`1. Change only these columns: ${editable}.`],
    ["2. Do not change Product ID or Version. Product No., SKU, Product Name, Status and Variants are for reference — changes there are ignored."],
    ["3. An empty cell keeps the current value. Delete rows you are not changing if you like."],
    [`4. Selling Price must be at least ₹${MIN_SELLING_PRICE} and not more than the MRP. Changing the MRP of a live product sends it for review again.`],
    ["5. Products with variants keep their stock per variant — change that stock with Edit."],
    [`6. Upload the file on the Bulk Edit page. You will see every change before it is applied (up to ${MAX_CHANGED_ROWS} changed products per upload).`],
    ["7. If a product changed after you downloaded this file (for example, stock sold), its row is skipped — download a fresh file. Uploading the same file twice changes nothing the second time."],
    [],
    ["Column", "Editable", "Notes"],
    ...EDIT_COLUMNS.map((c) => [c.header, c.editable ? "Yes" : "No", c.help]),
  ]);
  instructions["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instructions, EDIT_INSTRUCTIONS_SHEET);
  return wb;
}

export function downloadEditWorkbook(rows: ExportRow[]): void {
  XLSX.writeFile(buildEditWorkbook(rows), editFileName());
}
