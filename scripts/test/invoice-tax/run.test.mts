/*
 * Plain-Node test (no emulator) — invoice tax correctness (lib/invoiceTax.ts,
 * components/invoice/*). Proves every invoice figure comes from the order's
 * recorded taxSnapshot, the document kind follows the seller's recorded GST
 * status, no rate is assumed, and no placeholder GSTIN can appear.
 *
 * Run: npx tsx scripts/test/invoice-tax/run.test.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildInvoiceTax, invoiceDocumentsFor, taxSnapshotFromSellerView, documentLabels, supplierDisplayName,
  PLACE_OF_SUPPLY_NOTE, NO_SNAPSHOT_NOTE, STATUS_NOT_RECORDED_NOTE, GST_NOT_VERIFIED_NOTE, COMPOSITION_GSTIN_NOT_VERIFIED_NOTE,
  FORMAL_TAX_DOCUMENTS_ENABLED, INTERIM_NOT_TAX_DOCUMENT_NOTE,
} from "../../../lib/invoiceTax.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
}

const REG = "27AAPFU0939F1ZV"; // syntactically valid GSTIN (state 27)
const COMP = "24AAACC1206D1ZM";
// The full classifier (kept for when tax review completes) is opted into explicitly;
// the shipped default is the interim ORDER SUMMARY (checks I1-I5 below).
const FORMAL = { formalTaxDocuments: true } as const;
// Deliberately NOT 18%: 5% slab with recorded figures; a recalculation at any
// assumed rate would not reproduce them.
const lineA = { productId: "pa", vendorId: "A", name: "Lamp", qty: 2, hsn: "9405", gstRate: 5, grossValue: 210, taxableValue: 200, gstAmount: 10 };
const lineA2 = { productId: "pa2", vendorId: "A", name: "Shade", qty: 1, hsn: "9405", gstRate: 12, grossValue: 112, taxableValue: 100, gstAmount: 12 };
const lineB = { productId: "pb", vendorId: "B", name: "Mug", qty: 1, hsn: "6912", gstRate: 18, grossValue: 118, taxableValue: 100, gstAmount: 18 };
const orderWith = (sellers: Record<string, unknown>, items = [lineA, lineA2, lineB]) => ({
  items: [{ id: "pa", vendorId: "A", vendorName: "Shop A", price: 105, qty: 2 }, { id: "pb", vendorId: "B", vendorName: "Shop B", price: 118, qty: 1 }],
  taxSnapshot: { items, sellers },
});

// 1. no snapshot
{
  const v = buildInvoiceTax({ items: [{ id: "x", name: "X", price: 100, qty: 3, vendorId: "A" }] });
  const s = v.suppliers[0];
  check("1 no taxSnapshot -> ORDER SUMMARY, not a tax document, no GST figures, explicit note",
    !v.snapshotPresent && v.suppliers.length === 1 && s.kind === "ORDER_SUMMARY" && s.title === "ORDER SUMMARY" &&
    s.totals.gst === null && s.totals.taxable === null && s.lines[0].gstAmount === null && s.lines[0].grossValue === 300 &&
    s.gstin === null && s.notes.includes(NO_SNAPSHOT_NOTE));
}

// 2. registered seller -> TAX INVOICE with exactly the recorded figures
{
  const v = buildInvoiceTax(orderWith({ A: { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "VERIFIED" }, B: { gstStatus: "UNREGISTERED", gstin: "" } }), FORMAL);
  const a = v.suppliers.find((s) => s.vendorId === "A")!;
  check("2 REGISTERED + valid GSTIN -> TAX INVOICE; per-line recorded rate/taxable/GST used verbatim (5% and 12%, not 18%)",
    a.kind === "TAX_INVOICE" && a.title === "TAX INVOICE" && a.gstin === REG && a.supplierStateCode === "27" &&
    a.lines.length === 2 && a.lines[0].gstRate === 5 && a.lines[0].taxableValue === 200 && a.lines[0].gstAmount === 10 &&
    a.lines[1].gstRate === 12 && a.lines[1].gstAmount === 12 && a.lines[0].hsn === "9405",
    JSON.stringify(a.lines));
  check("2b TAX INVOICE totals are sums of the recorded lines (taxable 300, GST 22, gross 322)",
    a.totals.taxable === 300 && a.totals.gst === 22 && a.totals.gross === 322);
  check("2c TAX INVOICE states the place-of-supply limitation (no invented CGST/SGST/IGST split)",
    a.notes.includes(PLACE_OF_SUPPLY_NOTE));
  // 3. multi-seller: separate documents per seller
  const b = v.suppliers.find((s) => s.vendorId === "B")!;
  check("3 multi-seller order -> one document per seller, each with only its own lines",
    v.suppliers.length === 2 && b.lines.length === 1 && b.lines[0].name === "Mug" && !a.lines.some((l) => l.name === "Mug"));
  // 4. unregistered seller with an 18% line recorded -> bill of supply, no tax
  check("4 UNREGISTERED seller -> BILL OF SUPPLY, no GST shown even though an 18% line was recorded, no GSTIN",
    b.kind === "BILL_OF_SUPPLY" && b.title === "BILL OF SUPPLY" && /not registered/i.test(b.subtitle) &&
    b.lines[0].gstAmount === null && b.lines[0].gstRate === null && b.totals.gst === null && b.totals.gross === 118 && b.gstin === null);
  // 5. seller filter
  const onlyA = buildInvoiceTax(orderWith({ A: { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "VERIFIED" }, B: { gstStatus: "REGISTERED", gstin: COMP, taxVerificationStatus: "VERIFIED" } }), { vendorId: "A" });
  check("5 vendorId filter -> only that seller's document (seller's own invoice never shows another seller)",
    onlyA.suppliers.length === 1 && onlyA.suppliers[0].vendorId === "A" && !JSON.stringify(onlyA).includes(COMP));
}

// 6. composition
{
  const v = buildInvoiceTax(orderWith({ A: { gstStatus: "COMPOSITION", gstin: COMP, taxVerificationStatus: "VERIFIED" } }, [lineA]), FORMAL);
  const a = v.suppliers[0];
  check("6 COMPOSITION -> BILL OF SUPPLY with the composition statement, GSTIN printed, no tax collected",
    a.kind === "BILL_OF_SUPPLY" && /composition taxable person/i.test(a.subtitle) && a.gstin === COMP &&
    a.totals.gst === null && a.lines[0].gstAmount === null && a.totals.gross === 210);
}

// 7. registered but GSTIN missing / invalid, or status not recorded
{
  const bad = buildInvoiceTax(orderWith({ A: { gstStatus: "REGISTERED", gstin: "24ABCDE1234" } }, [lineA]), FORMAL).suppliers[0];
  const none = buildInvoiceTax(orderWith({}, [lineA]), FORMAL).suppliers[0];
  const unknown = buildInvoiceTax(orderWith({ A: { gstStatus: "UNKNOWN", gstin: "" } }, [lineA]), FORMAL).suppliers[0];
  check("7 REGISTERED with an invalid GSTIN, a missing seller entry, or UNKNOWN status -> ORDER SUMMARY (not a tax invoice), no GSTIN, explicit note",
    [bad, none, unknown].every((s) => s.kind === "ORDER_SUMMARY" && s.gstin === null && s.totals.gst === null && s.notes.includes(STATUS_NOT_RECORDED_NOTE)));
}

// 8. lower-case / padded status and GSTIN are normalised, never "fixed up" into a tax invoice otherwise
{
  const s = buildInvoiceTax(orderWith({ A: { gstStatus: "registered", gstin: ` ${REG.toLowerCase()} `, taxVerificationStatus: "verified" } }, [lineA]), FORMAL).suppliers[0];
  check("8 status/GSTIN case and spaces normalised (still the recorded values)", s.kind === "TAX_INVOICE" && s.gstin === REG);
}

// 9. seller-view round trip
{
  const full = buildInvoiceTax(orderWith({ A: { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "VERIFIED" } }, [lineA, lineA2]), { vendorId: "A" });
  const viewTax = { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "VERIFIED", lines: [lineA, lineA2].map(({ vendorId: _v, ...rest }) => rest) };
  const fromView = buildInvoiceTax({ items: [], taxSnapshot: taxSnapshotFromSellerView(viewTax, "A") }, { vendorId: "A" });
  check("9 seller page (own tax slice) renders the same document as the full snapshot does for that seller",
    JSON.stringify(fromView.suppliers) === JSON.stringify(full.suppliers));
  check("9b no tax slice -> undefined snapshot -> ORDER SUMMARY (never a fabricated tax invoice)",
    taxSnapshotFromSellerView(null, "A") === undefined &&
    buildInvoiceTax({ items: [], taxSnapshot: taxSnapshotFromSellerView(null, "A") }, { vendorId: "A" }).suppliers[0].kind === "ORDER_SUMMARY");
}

// 11. viewer scoping (what components/invoice/Invoice.tsx renders)
{
  const order = orderWith({ A: { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "VERIFIED" }, B: { gstStatus: "REGISTERED", gstin: COMP, taxVerificationStatus: "VERIFIED" } });
  const noId = invoiceDocumentsFor({ ...order }, "seller");
  const blankId = invoiceDocumentsFor({ ...order, vendorId: "   " }, "seller");
  const asA = invoiceDocumentsFor({ ...order, vendorId: "A" }, "seller");
  const asC = invoiceDocumentsFor({ ...order, vendorId: "C" }, "seller");
  check("11 seller view FAILS CLOSED: no / blank seller id -> no documents at all (never every seller's)",
    noId.suppliers.length === 0 && blankId.suppliers.length === 0);
  check("11b seller view -> only that seller's document; a seller not on the order -> nothing",
    asA.suppliers.length === 1 && asA.suppliers[0].vendorId === "A" && !JSON.stringify(asA).includes(COMP) && asC.suppliers.length === 0);
  check("11c customer and admin views -> every seller's document",
    invoiceDocumentsFor(order, "customer").suppliers.length === 2 && invoiceDocumentsFor(order, "admin").suppliers.length === 2);
  // Seller page, no snapshot: its items carry the seller's own uid (seller pages tag them).
  const pending = { vendorId: "A", items: [{ id: "pa", vendorId: "A", name: "Lamp", price: 100, qty: 1 }, { id: "pb", vendorId: "B", name: "Mug", price: 50, qty: 1 }] };
  const pv = invoiceDocumentsFor(pending, "seller");
  check("11d seller view with no snapshot -> ORDER SUMMARY of only the seller's own lines, no tax",
    pv.suppliers.length === 1 && pv.suppliers[0].kind === "ORDER_SUMMARY" && pv.suppliers[0].lines.length === 1 &&
    pv.suppliers[0].lines[0].name === "Lamp" && pv.suppliers[0].totals.gst === null);
}

// 12. C-1: a TAX INVOICE needs the RECORDED admin verification, never GSTIN format alone
{
  const reg = (taxVerificationStatus?: string) =>
    buildInvoiceTax(orderWith({ A: { gstStatus: "REGISTERED", gstin: REG, ...(taxVerificationStatus !== undefined ? { taxVerificationStatus } : {}) } }, [lineA]), FORMAL).suppliers[0];
  const unverified = ["PENDING", "REJECTED", "UNKNOWN", ""].map(reg);
  const legacy = reg(undefined); // snapshot from before verification was recorded
  check("12 REGISTERED + well-formed GSTIN but PENDING / REJECTED / UNKNOWN / blank / not recorded -> ORDER SUMMARY, no GSTIN printed, no tax, not-verified note",
    [...unverified, legacy].every((s) => s.kind === "ORDER_SUMMARY" && s.gstin === null && s.totals.gst === null &&
      s.lines[0].gstAmount === null && s.notes.includes(GST_NOT_VERIFIED_NOTE) && !s.notes.includes(STATUS_NOT_RECORDED_NOTE)));
  const verified = reg("VERIFIED");
  check("12b REGISTERED + well-formed GSTIN + recorded VERIFIED -> TAX INVOICE with the GSTIN and the recorded verification status",
    verified.kind === "TAX_INVOICE" && verified.gstin === REG && verified.taxVerificationStatus === "VERIFIED");
  const fakeFormat = buildInvoiceTax(orderWith({ A: { gstStatus: "REGISTERED", gstin: "24ABCDE1234", taxVerificationStatus: "VERIFIED" } }, [lineA]), FORMAL).suppliers[0];
  check("12c a VERIFIED status never rescues a malformed GSTIN (still ORDER SUMMARY, no GSTIN)",
    fakeFormat.kind === "ORDER_SUMMARY" && fakeFormat.gstin === null);
  const compUnverified = buildInvoiceTax(orderWith({ A: { gstStatus: "COMPOSITION", gstin: COMP, taxVerificationStatus: "PENDING" } }, [lineA]), FORMAL).suppliers[0];
  check("12d COMPOSITION not verified -> still a BILL OF SUPPLY (no tax either way) but its GSTIN is NOT printed, with a note",
    compUnverified.kind === "BILL_OF_SUPPLY" && compUnverified.gstin === null && compUnverified.notes.includes(COMPOSITION_GSTIN_NOT_VERIFIED_NOTE));
  const viewTax = { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "PENDING", lines: [lineA].map(({ vendorId: _v, ...rest }) => rest) };
  const fromView = buildInvoiceTax({ items: [], taxSnapshot: taxSnapshotFromSellerView(viewTax, "A") }, { vendorId: "A" }).suppliers[0];
  check("12e seller page carries the recorded verification too: an unverified seller's own document is not a tax invoice",
    fromView.kind === "ORDER_SUMMARY" && fromView.taxVerificationStatus === "PENDING");
  const confirmSrc = fs.readFileSync(path.join(REPO, "app/api/confirm-order/route.ts"), "utf8");
  check("12f confirm-order records taxVerificationStatus from the vendor record it reads (Admin SDK), not from the request",
    confirmSrc.includes(`typeof d.taxVerificationStatus === "string"`) &&
    confirmSrc.includes("? d.taxVerificationStatus") &&
    !confirmSrc.includes("body.taxVerificationStatus"));
}

// 13. C-3: wording follows the document kind; the supplier, never YOMICO, signs
{
  const t = documentLabels("TAX_INVOICE"), b = documentLabels("BILL_OF_SUPPLY"), o = documentLabels("ORDER_SUMMARY");
  check("13 labels by kind: Invoice No/Date only on a TAX INVOICE; Bill No/Date on a BILL OF SUPPLY; Reference No/Order Date on an ORDER SUMMARY",
    t.number === "Invoice No" && t.date === "Invoice Date" && b.number === "Bill No" && b.date === "Bill Date" &&
    !/invoice/i.test(JSON.stringify(b)) && !/invoice/i.test(JSON.stringify(o)) && o.number === "Reference No");
  check("13b supplier name comes from the seller's own line, else the order-level name, else 'the seller' (no invented entity)",
    supplierDisplayName({ items: [{ vendorId: "A", vendorName: "Shop A" }] }, "A") === "Shop A" &&
    supplierDisplayName({ items: [], vendorName: "Solo" }, "A") === "Solo" && supplierDisplayName({ items: [] }, "A") === "the seller");
  const dir = path.join(REPO, "components/invoice");
  const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
  const info = read("InvoiceInfo.tsx"), footer = read("InvoiceFooter.tsx"), items = read("InvoiceItems.tsx"), inv = read("Invoice.tsx");
  check("13c InvoiceInfo labels come from documentLabels(supplier.kind); no hard-coded 'Invoice No' / 'Invoice Date' / 'Invoice Information'",
    info.includes("documentLabels(supplier.kind)") &&
    ["Invoice No", "Invoice Date", "Invoice Information"].every((label) => !info.includes(label)));
  check("13d footer: no YOMICO signatory, no 'Authorized Signatory', no 'keep this invoice'; signs 'For <supplier>' as the supplier's signatory",
    !footer.includes("YOMICO Marketplace") && !footer.includes("Authorized Signatory") && !footer.includes("keep this invoice") &&
    footer.includes("Authorised signatory of the supplier") && footer.includes("For {name}"));
  check("13e Invoice passes signatories only for documents issued in a supplier's name (ORDER SUMMARY is not signed); items heading is neutral",
    inv.includes(`.filter((supplier) => supplier.kind !== "ORDER_SUMMARY")`) && inv.includes("supplierDisplayName(order, supplier.vendorId)") &&
    !items.includes("Invoice Items"));
}

// 10. source checks: placeholder GSTIN and the fixed 18% are gone from every invoice component
{
  const dir = path.join(REPO, "components/invoice");
  const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const invoice = fs.readFileSync(path.join(dir, "Invoice.tsx"), "utf8");
  check("10 no placeholder GSTIN, no /1.18 back-calculation, no 'GST (18%)' label, no `|| 18` default in components/invoice",
    !src.includes("24ABCDE1234F1Z5") && !/\/\s*1\.18/.test(src) && !src.includes("GST (18%)") && !/\|\|\s*18\b/.test(src));
  check("10b the Invoice component derives its documents from the fail-closed invoiceDocumentsFor(order, type)",
    invoice.includes("invoiceDocumentsFor(order, type)") && !invoice.includes("buildInvoiceTax("));
  const sellerPages = ["app/seller/invoice/[id]/page.tsx", "app/seller/orders/[id]/page.tsx"]
    .map((p) => fs.readFileSync(path.join(REPO, p), "utf8"));
  check("10c both seller invoice pages pass the seller's uid and their own tax slice",
    sellerPages.every((s) => s.includes("taxSnapshotFromSellerView(view.tax,") && /vendorId: (user\.uid|vendorUid)/.test(s)));
}

// I. INTERIM restriction (CX-01): the shipped default issues no formal tax document
{
  const verifiedReg = { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "VERIFIED" };
  const order = orderWith({ A: verifiedReg, B: { gstStatus: "UNREGISTERED", gstin: "" } });
  const comp = orderWith({ A: { gstStatus: "COMPOSITION", gstin: COMP, taxVerificationStatus: "VERIFIED" } }, [lineA]);
  check("I1 FORMAL_TAX_DOCUMENTS_ENABLED is false (interim default)", FORMAL_TAX_DOCUMENTS_ENABLED === false);
  const views = [
    buildInvoiceTax(order), buildInvoiceTax(comp),
    invoiceDocumentsFor(order, "customer"), invoiceDocumentsFor(order, "admin"),
    invoiceDocumentsFor({ ...order, vendorId: "A" }, "seller"), invoiceDocumentsFor({ ...comp, vendorId: "A" }, "seller"),
  ];
  const all = views.flatMap((v) => v.suppliers);
  check("I2 by default a VERIFIED registered, an unregistered and a composition seller all get ORDER SUMMARY (never TAX INVOICE / BILL OF SUPPLY), for customer, admin and seller views",
    all.length === 9 && all.every((s) => s.kind === "ORDER_SUMMARY" && s.title === "ORDER SUMMARY" && s.subtitle === "Not a tax invoice"));
  check("I3 interim documents show no GST rate/taxable/GST amount and print no GSTIN or supplier state code",
    all.every((s) => s.gstin === null && s.supplierStateCode === null && s.totals.gst === null && s.totals.taxable === null &&
      s.lines.every((l) => l.gstRate === null && l.taxableValue === null && l.gstAmount === null)));
  check("I4 interim documents carry the explicit not-a-tax-document note (and no tax-invoice note)",
    all.every((s) => s.notes.length === 1 && s.notes[0] === INTERIM_NOT_TAX_DOCUMENT_NOTE && /not a tax invoice/i.test(s.notes[0])));
  const a = buildInvoiceTax(order).suppliers.find((s) => s.vendorId === "A")!;
  const b = buildInvoiceTax(order).suppliers.find((s) => s.vendorId === "B")!;
  check("I5 amounts unchanged: each interim document's gross is exactly its recorded snapshot gross (A 322, B 118) and the seller split is preserved",
    a.totals.gross === 322 && b.totals.gross === 118 && a.lines.length === 2 && b.lines.length === 1 &&
    a.lines.map((l) => l.grossValue).join() === "210,112");
}

// R. RENDERED output (CX-01 Phase 2B): what the seller block and items table
// actually print. Interim ORDER SUMMARY: no GST status / GSTIN / verification
// and no HSN. Formal documents: unchanged.
{
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const InvoiceVendor = (await import("../../../components/invoice/InvoiceVendor.tsx")).default;
  const InvoiceItems = (await import("../../../components/invoice/InvoiceItems.tsx")).default;
  const render = (order: any, supplier: any) => ({
    vendor: renderToStaticMarkup(React.createElement(InvoiceVendor, { order, supplier })),
    items: renderToStaticMarkup(React.createElement(InvoiceItems, { order, supplier })),
  });
  const base = { items: [{ id: "pa", vendorId: "A", vendorName: "Shop A" }] };
  const regOrder = { ...base, ...orderWith({ A: { gstStatus: "REGISTERED", gstin: REG, taxVerificationStatus: "VERIFIED" } }, [lineA]) };
  const compOrder = { ...base, ...orderWith({ A: { gstStatus: "COMPOSITION", gstin: COMP, taxVerificationStatus: "VERIFIED" } }, [lineA]) };
  const taxIdentity = ["GST status", "GSTIN", "verification", "Verified by YOMICO", "Registered (Regular)", "Composition", REG, COMP];

  const interim = render(regOrder, buildInvoiceTax(regOrder).suppliers[0]);
  const interimComp = render(compOrder, buildInvoiceTax(compOrder).suppliers[0]);
  check("R1 interim ORDER SUMMARY seller block: no GST status, GSTIN or verification claim (verified registered AND composition seller); seller name still shown",
    [interim.vendor, interimComp.vendor].every((h) => taxIdentity.every((t) => !h.includes(t)) && h.includes("Shop A") && h.includes("SOLD BY")));
  check("R2 interim ORDER SUMMARY items: no HSN column or value, no GST %/Taxable Value/GST columns; the amount is still shown",
    [interim.items, interimComp.items].every((h) => !h.includes("HSN") && !h.includes(lineA.hsn) && !h.includes("GST %") &&
      !h.includes("Taxable Value") && h.includes("210.00") && h.includes("Lamp")));
  const noSnap = { items: [{ id: "x", name: "X", price: 100, qty: 3, vendorId: "A", vendorName: "Shop A", hsn: "1234" }] };
  const noSnapR = render(noSnap, buildInvoiceTax(noSnap).suppliers[0]);
  check("R3 no-snapshot ORDER SUMMARY renders the same way: no tax identity, no HSN",
    taxIdentity.every((t) => !noSnapR.vendor.includes(t)) && !noSnapR.items.includes("HSN") && !noSnapR.items.includes("1234"));

  const formalTax = render(regOrder, buildInvoiceTax(regOrder, FORMAL).suppliers[0]);
  check("R4 formal TAX INVOICE rendering unchanged: GST status, GSTIN, verification, HSN and GST columns all shown",
    formalTax.vendor.includes("GST status") && formalTax.vendor.includes("Registered (Regular)") && formalTax.vendor.includes(REG) &&
    formalTax.vendor.includes("Verified by YOMICO review") && formalTax.items.includes("HSN") && formalTax.items.includes(lineA.hsn) &&
    formalTax.items.includes("GST %") && formalTax.items.includes("Taxable Value"));
  const formalBos = render(compOrder, buildInvoiceTax(compOrder, FORMAL).suppliers[0]);
  check("R5 formal BILL OF SUPPLY rendering unchanged: GST status, GSTIN and HSN shown, no GST columns",
    formalBos.vendor.includes("Composition") && formalBos.vendor.includes(COMP) && formalBos.items.includes("HSN") &&
    formalBos.items.includes(lineA.hsn) && !formalBos.items.includes("GST %"));
  const emptyOf = (kindOrder: any, opts: any) => {
    const s = { ...buildInvoiceTax(kindOrder, opts).suppliers[0], lines: [] };
    return /colSpan="?(\d+)/i.exec(renderToStaticMarkup(React.createElement(InvoiceItems, { order: kindOrder, supplier: s })))?.[1];
  };
  check("R6 empty-items row spans the visible columns: ORDER SUMMARY 4, BILL OF SUPPLY 5 (unchanged), TAX INVOICE 8 (unchanged)",
    emptyOf(regOrder, {}) === "4" && emptyOf(compOrder, FORMAL) === "5" && emptyOf(regOrder, FORMAL) === "8",
    `${emptyOf(regOrder, {})}/${emptyOf(compOrder, FORMAL)}/${emptyOf(regOrder, FORMAL)}`);
}

console.log(`\n${pass}/${pass + fail} invoice-tax checks passed`);
process.exit(fail === 0 ? 0 : 1);
