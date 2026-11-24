"use client";

import InvoiceHeader from "./InvoiceHeader";
import InvoiceInfo from "./InvoiceInfo";
import InvoiceCustomer from "./InvoiceCustomer";
import InvoiceVendor from "./InvoiceVendor";
import InvoiceItems from "./InvoiceItems";
import InvoiceSummary from "./InvoiceSummary";
import InvoicePayment from "./InvoicePayment";
import InvoiceFinance from "./InvoiceFinance";
import InvoiceFooter from "./InvoiceFooter";
import { invoiceDocumentsFor, supplierDisplayName } from "@/lib/invoiceTax";

interface InvoiceProps {
  order: any;
  type: "customer" | "seller" | "admin";
}

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Every tax figure comes from the order's recorded taxSnapshot via
// lib/invoiceTax — one supply document per seller (each seller is the supplier
// of their own goods), titled by that seller's recorded GST status. Nothing is
// back-calculated at an assumed rate. A seller's own invoice (type "seller")
// shows only that seller's document; order-level charges are not theirs.
export default function Invoice({
  order,
  type,
}: InvoiceProps) {

  const grandTotal =
    Number(order.finalTotal || order.total || 0);

  const shipping =
    Number(order.shippingCharge || 0);

  const discount =
    Number(order.discount || 0);

  // Seller view: only that seller's document, failing closed with no seller id.
  const { suppliers } = invoiceDocumentsFor(order, type);
  const showOrderTotals = type !== "seller";
  const singleDocument = suppliers.length === 1;

  if (suppliers.length === 0) {
    return (
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg p-5 text-center text-gray-600">
        No invoice is available for this order.
      </div>
    );
  }

  return (

    <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg p-5
print:max-w-full
print:shadow-none
print:p-1
print:rounded-none
print:text-[11px]">

      {suppliers.map((supplier, index) => (
        <div
          key={supplier.vendorId || index}
          className={index > 0 ? "mt-4 pt-4 border-t-4 border-dashed border-gray-400 print:break-before-page" : ""}
        >
          <InvoiceHeader title={supplier.title} subtitle={supplier.subtitle} />

          <div className="mt-1">
            <InvoiceInfo order={order} supplier={supplier} />
          </div>

          <div className="grid grid-cols-2 gap-1 mt-1">
            <InvoiceCustomer order={order} />
            <InvoiceVendor order={order} supplier={supplier} />
          </div>

          <div className="mt-1">
            <InvoiceItems order={order} supplier={supplier} />
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="w-full">
              {index === 0 && <InvoicePayment order={order} />}
            </div>
            <div className="w-full">
              <InvoiceSummary
                supplier={supplier}
                orderTotals={showOrderTotals && singleDocument ? { shipping, discount, grandTotal } : null}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Several sellers on one order: the order-level payment, once. */}
      {showOrderTotals && !singleDocument && (
        <table className="w-full border-collapse mt-2 text-sm">
          <tbody>
            <tr>
              <td className="border border-black p-1">Shipping (order)</td>
              <td className="border border-black p-1 text-right">₹{money(shipping)}</td>
            </tr>
            <tr>
              <td className="border border-black p-1">Discount (order)</td>
              <td className="border border-black p-1 text-right">- ₹{money(discount)}</td>
            </tr>
            <tr className="font-bold">
              <td className="border border-black p-1">Order total paid</td>
              <td className="border border-black p-1 text-right">₹{money(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {type !== "customer" && (
        <div className="mt-1">
          <InvoiceFinance
            order={order}
            type={type}
          />
        </div>
      )}

      <div className="mt-1">
        <InvoiceFooter
  grandTotal={grandTotal}
  type={type}
  signatories={suppliers
    .filter((supplier) => supplier.kind !== "ORDER_SUMMARY")
    .map((supplier) => supplierDisplayName(order, supplier.vendorId))}
/>
      </div>

    </div>

  );

}