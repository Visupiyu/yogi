/*
 * Plain-Node test (no emulator) — Bulk Product Edit rules
 * (lib/products/bulkEdit.ts, lib/products/bulkEditTemplate.ts,
 * lib/products/bulkEditServer.ts).
 *
 * Proves: the exported workbook round-trips (ids, versions and values read
 * back exactly); an empty cell keeps the current value; reference columns are
 * never read as edits; malformed files and duplicate product rows are
 * refused; only the bulk-edit fields are accepted from the browser; and each
 * row's decision follows the shared edit rules — unchanged before stale,
 * stale on any change since export, variant stock refused, the ₹499 / MRP
 * policy, the derived discount, and re-review of an MRP change on a live
 * product only.
 *
 * Run: npx tsx scripts/test/bulk-edit/run.test.mts
 */
import * as XLSX from "xlsx";
import {
  EDIT_COLUMNS, MAX_EDIT_ROWS, checkSubmittedEditValues, editRowsFromSheet, exportRowCells,
} from "../../../lib/products/bulkEdit.ts";
import { buildEditWorkbook } from "../../../lib/products/bulkEditTemplate.ts";
import { readProductsMatrix } from "../../../lib/products/bulkTemplate.ts";
import { decideEditRow, exportRowFor, productVersion } from "../../../lib/products/bulkEditServer.ts";

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (ok) pass++; else fail++;
}
const has = (errs: string[] | undefined, re: RegExp) => (errs || []).some((e) => re.test(e));

const LIVE = {
  vendorId: "u1", productNumber: "PCT000001", sku: "LAMP-1", title: "Brass Lamp", approvalStatus: "approved", approved: true, active: true,
  mrp: 999, sellingPrice: 799, stock: 10, gstRate: 12, hsn: "9405", returnDays: 7, warranty: "", weight: 0.5, discount: 20, variants: [],
};
const VARIANT = { ...LIVE, productNumber: "PCT000002", title: "Shirt", variants: [{ id: "v1", stock: 3, price: 0 }, { id: "v2", stock: 4, price: 0 }], stock: 7 };
const PENDING = { ...LIVE, productNumber: "PCT000003", title: "New Lamp", approvalStatus: "pending", approved: false, active: false };

// ---- export -> workbook -> edited file round trip ----
const exported = [exportRowFor("p1", LIVE), exportRowFor("p2", VARIANT)];
const matrixOf = (rows: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Products");
  return readProductsMatrix(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
};
{
  const wb = buildEditWorkbook(exported);
  const matrix = readProductsMatrix(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const parsed = editRowsFromSheet(matrix);
  check("E1 export row: own values, version, status and variant flag",
    exported[0].values.sellingPrice === 799 && exported[0].values.hsn === "9405" && !("warranty" in exported[0].values) &&
    exported[0].status === "Live" && exported[0].variants === "No" && exported[1].variants === "Yes (2)" && exported[0].version === productVersion(LIVE));
  check("E2 workbook round trip: the untouched export reads back with the same ids, versions and values",
    parsed.ok && parsed.rows.length === 2 && parsed.rows[0].productId === "p1" && parsed.rows[0].version === exported[0].version &&
    parsed.rows[0].values.sellingPrice === 799 && parsed.rows[0].values.hsn === "9405" && parsed.rows.every((r) => r.errors.length === 0),
    JSON.stringify(parsed.ok ? parsed.rows[0] : parsed));
  check("E3 workbook has Products and Instructions sheets", wb.SheetNames.join() === "Products,Instructions");
}

// ---- reading an edited file ----
{
  const header = EDIT_COLUMNS.map((c) => c.header);
  const col = (k: string) => EDIT_COLUMNS.findIndex((c) => c.key === k);
  const line = exportRowCells(exported[0]);
  const edited = [...line]; edited[col("sellingPrice")] = "₹749"; edited[col("stock")] = ""; edited[col("title")] = "Renamed in Excel";
  const parsed = editRowsFromSheet(matrixOf([header, edited]));
  const r = parsed.ok ? parsed.rows[0] : null;
  check("R1 '₹749' read as 749; an EMPTY cell (stock) is absent = keep; a changed Product Name is never an edit",
    !!r && r.values.sellingPrice === 749 && !("stock" in r.values) && !("title" in r.values) && r.errors.length === 0, JSON.stringify(r));
  const bad = [...line]; bad[col("stock")] = "ten"; bad[col("hsn")] = "94A5";
  const badRow = editRowsFromSheet(matrixOf([header, bad]));
  check("R2 a non-number and a bad HSN are reported on the row", badRow.ok && has(badRow.rows[0].errors, /Stock must be a number/) && has(badRow.rows[0].errors, /HSN Code must be/));
  const noVersion = editRowsFromSheet(matrixOf([header.filter((h) => !h.startsWith("Version")), line.slice(0, -1)]));
  check("R3 a file without the Product ID / Version columns is refused", !noVersion.ok && /Product ID or Version/.test((noVersion as any).error));
  const dup = editRowsFromSheet(matrixOf([header, line, line]));
  check("R4 the same product twice in one file -> both rows flagged", dup.ok && dup.rows.every((x) => has(x.errors, /also in row/)));
  const blank = [...line]; blank[col("version")] = "";
  check("R5 a row whose Version was cleared is refused", (() => { const p = editRowsFromSheet(matrixOf([header, blank])); return p.ok && has(p.rows[0].errors, /Version is missing/); })());
  const big = editRowsFromSheet([header, ...Array.from({ length: MAX_EDIT_ROWS + 1 }, (_, i) => [`p${i}`, "", "", "", "", "", 999, 799, 1, 12, "", "", "", "", "v"])]);
  check(`R6 more than ${MAX_EDIT_ROWS} rows refused`, !big.ok);
  const onlyIdAndPrice = editRowsFromSheet([["Product ID (do not edit)", "Selling Price (₹)", "Version (do not edit)"], ["p1", 750, "v"]]);
  check("R7 deleted editable columns are fine (only present columns are read)", onlyIdAndPrice.ok && JSON.stringify(onlyIdAndPrice.rows[0].values) === '{"sellingPrice":750}');
}

// ---- what the server accepts from the browser ----
{
  const errs = (v: unknown) => { const r = checkSubmittedEditValues(v); return r.ok ? [] : r.errors; };
  check("S1 only the bulk-edit fields: title, vendorId, approvalStatus, categoryId, variants, discount all refused",
    ["title", "vendorId", "approvalStatus", "categoryId", "variants", "discount"].every((k) => has(errs({ [k]: "x" }), /can't be changed with Bulk Edit/)));
  check("S2 numbers must be numbers, text must be text (no '749' coercion)", has(errs({ sellingPrice: "749" }), /must be a number/) && has(errs({ hsn: 9405 }), /must be text/));
  check("S3 clean values pass", checkSubmittedEditValues({ sellingPrice: 749, stock: 5, hsn: "9405" }).ok);
}

// ---- per-row decision (shared edit rules) ----
{
  const v = productVersion(LIVE);
  const d = (existing: any, values: any, version = productVersion(existing)) => decideEditRow(existing, values, version);
  check("D1 a row equal to the product -> unchanged (even with an old version: re-applying a file writes nothing)",
    d(LIVE, { sellingPrice: 799, stock: 10 }).status === "unchanged" && d(LIVE, { sellingPrice: 799 }, "old").status === "unchanged");
  check("D2 a real change against a product that changed since export -> stale", d(LIVE, { sellingPrice: 749 }, "0000000000000000").status === "stale");
  const sold = { ...LIVE, stock: 9 };
  check("D3 the stock-sold case: the row still says 10, the product is now 9 -> stale, never a write back to 10",
    decideEditRow(sold, { sellingPrice: 749, stock: 10 }, v).status === "stale");
  const price = d(LIVE, { sellingPrice: 749 }) as any;
  check("D4 selling-price change on a live product -> ready, discount re-derived (25), NO re-review",
    price.status === "ready" && price.plan.changes.sellingPrice === 749 && price.plan.changes.discount === 25 && price.plan.reReview.length === 0 &&
    price.changes.length === 1 && price.changes[0].from === 799);
  const mrp = d(LIVE, { mrp: 1099 }) as any;
  check("D5 MRP change on a live product -> ready AND re-review (existing rule)", mrp.status === "ready" && mrp.plan.reReview.includes("mrp"));
  const mrpPending = d(PENDING, { mrp: 1099 }) as any;
  check("D6 MRP change on a pending product -> no re-review (stays pending)", mrpPending.status === "ready" && mrpPending.plan.reReview.length === 0);
  check("D7 ₹499 floor and MRP cap enforced", has((d(LIVE, { sellingPrice: 498 }) as any).errors, /at least ₹499/) && has((d(LIVE, { sellingPrice: 1200 }) as any).errors, /more than the MRP/));
  check("D8 GST slab, whole-unit stock and return days enforced",
    has((d(LIVE, { gstRate: 7 }) as any).errors, /GST rate/) && has((d(LIVE, { stock: 2.5 }) as any).errors, /Stock must be a whole/) &&
    has((d(LIVE, { returnDays: 45 }) as any).errors, /Return days/));
  check("D9 a product with stock-bearing variants: stock change refused, price change allowed",
    has((d(VARIANT, { stock: 20 }) as any).errors, /per variant with Edit/) && d(VARIANT, { sellingPrice: 749 }).status === "ready");
  const legacy = { vendorId: "u1", title: "Old", sellingPrice: 600, stock: 3, gstRate: 5 }; // no MRP (pre-policy listing)
  check("D10 a legacy product without MRP: a stock-only edit is not forced to reprice; a price edit needs the MRP",
    d(legacy, { stock: 5 }).status === "ready" && has((d(legacy, { sellingPrice: 650 }) as any).errors, /MRP is required/));
}

console.log(`\n${pass}/${pass + fail} bulk-edit checks passed`);
process.exit(fail === 0 ? 0 : 1);
