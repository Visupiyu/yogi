"use client";

import type { SupplierInvoice } from "@/lib/invoiceTax";

interface InvoiceSummaryProps {
  /** This document's recorded totals (lib/invoiceTax). */
  supplier: SupplierInvoice;
  /**
   * Order-level amounts (shipping, discount, amount paid) — shown only where the
   * whole order is on screen; they are not part of any one seller's supply and
   * are not taxed here.
   */
  orderTotals?: { shipping: number; discount: number; grandTotal: number } | null;
}

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InvoiceSummary({ supplier, orderTotals }: InvoiceSummaryProps) {
  const showTax = supplier.kind === "TAX_INVOICE";
  return (
    <div className="border-2 border-black rounded-lg overflow-hidden h-full">
      <div>
        <h2 className="bg-gray-100 border-b-2 border-black p-1 text-lg font-bold">
          {showTax ? "Tax Summary" : "Summary"}
        </h2>
        <table className="w-full border-collapse">
          <tbody>
            {showTax && (
              <tr>
                <td className="border border-black p-1">Taxable value</td>
                <td className="border border-black p-1 text-right">₹{money(supplier.totals.taxable ?? 0)}</td>
              </tr>
            )}
            {showTax && (
              <tr>
                <td className="border border-black p-1">GST (at recorded line rates)</td>
                <td className="border border-black p-1 text-right">₹{money(supplier.totals.gst ?? 0)}</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="border border-black p-1">{showTax ? "Items total (incl. GST)" : "Items total"}</td>
              <td className="border border-black p-1 text-right">₹{money(supplier.totals.gross)}</td>
            </tr>
            {orderTotals && (
              <>
                <tr>
                  <td className="border border-black p-1">Shipping (order)</td>
                  <td className="border border-black p-1 text-right">₹{money(orderTotals.shipping)}</td>
                </tr>
                <tr>
                  <td className="border border-black p-1">Discount (order)</td>
                  <td className="border border-black p-1 text-right">- ₹{money(orderTotals.discount)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="border border-black p-1">Order total paid</td>
                  <td className="border border-black p-1 text-right">₹{money(orderTotals.grandTotal)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {supplier.notes.length > 0 && (
        <ul className="p-1 text-xs text-gray-700 list-disc list-inside">
          {supplier.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}