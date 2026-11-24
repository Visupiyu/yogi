"use client";

import type { InvoiceOrderItem, InvoiceOrderLike, SupplierInvoice } from "@/lib/invoiceTax";

interface InvoiceItemsProps {
  order: InvoiceOrderLike;
  /** This document's lines and tax facts (lib/invoiceTax) — never re-derived here. */
  supplier: SupplierInvoice;
}

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Lines come from the order's recorded tax snapshot (or, with no snapshot, from
// the order lines with no tax at all). GST columns appear only on a TAX INVOICE;
// nothing here assumes a rate.
export default function InvoiceItems({
  order,
  supplier,
}: InvoiceItemsProps) {
  const showTax = supplier.kind === "TAX_INVOICE";
  const orderItems: InvoiceOrderItem[] = Array.isArray(order.items) ? order.items : [];
  // Which variant was bought, from the order line for the same product.
  const variantOf = (productId: string) => {
    const item = orderItems.find((it) => (it?.productId || it?.id) === productId);
    if (!item) return "";
    if (item.attributes && Object.keys(item.attributes).length > 0) {
      return Object.entries(item.attributes)
        .map(([dimension, value]) => dimension + ": " + String(value))
        .join("  |  ");
    }
    return [item.color ? "Color: " + item.color : "", item.size ? "Size: " + item.size : ""]
      .filter(Boolean)
      .join("  |  ");
  };
  // Interim (CX-01): HSN is a tax classification code, so it is not shown on an
  // ORDER SUMMARY. Formal documents (TAX INVOICE / BILL OF SUPPLY) keep it.
  const showHsn = supplier.kind !== "ORDER_SUMMARY";
  // Sl, Product Name, Qty, Amount + HSN (formal) + GST %, Taxable Value, GST (tax invoice).
  const columnCount = 4 + (showHsn ? 1 : 0) + (showTax ? 3 : 0);

  return (
    <div className="border-2 border-black rounded-lg overflow-hidden">
      <h2 className="bg-gray-100 border-b-2 border-black p-1 text-lg font-bold">
        Items
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-black p-1 text-left">Sl</th>
              <th className="border border-black p-1 text-left">Product Name</th>
              {showHsn && <th className="border border-black p-1 text-left">HSN</th>}
              <th className="border border-black p-1 text-right">Qty</th>
              {showTax && <th className="border border-black p-1 text-right">GST %</th>}
              {showTax && <th className="border border-black p-1 text-right">Taxable Value</th>}
              {showTax && <th className="border border-black p-1 text-right">GST</th>}
              <th className="border border-black p-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {supplier.lines.length ? (
              supplier.lines.map((line, index) => {
                const variant = variantOf(line.productId);
                return (
                  <tr key={index}>
                    <td className="border border-black p-1">{index + 1}</td>
                    <td className="border border-black p-1">
                      <div className="font-medium">{line.name}</div>
                      {variant && <div className="text-xs text-gray-600">{variant}</div>}
                    </td>
                    {showHsn && <td className="border border-black p-1">{line.hsn || "-"}</td>}
                    <td className="border border-black p-1 text-right">{line.qty}</td>
                    {showTax && <td className="border border-black p-1 text-right">{line.gstRate ?? 0}%</td>}
                    {showTax && <td className="border border-black p-1 text-right">₹{money(line.taxableValue ?? 0)}</td>}
                    {showTax && <td className="border border-black p-1 text-right">₹{money(line.gstAmount ?? 0)}</td>}
                    <td className="border border-black p-1 text-right">₹{money(line.grossValue)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columnCount} className="border border-black p-2 text-center text-gray-500">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}