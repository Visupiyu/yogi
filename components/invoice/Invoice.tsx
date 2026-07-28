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

interface InvoiceProps {
  order: any;
  type: "customer" | "seller" | "admin";
}

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

  const taxableAmount =
    grandTotal / 1.18;

  const gst =
    grandTotal - taxableAmount;

  const subtotal =
    taxableAmount;

  return (

    <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg p-5
print:max-w-full
print:shadow-none
print:p-1
print:rounded-none
print:text-[11px]">

      <InvoiceHeader />

      <div className="mt-1">
        <InvoiceInfo order={order} />
      </div>

      <div className="grid grid-cols-2 gap-1 mt-1">
        <InvoiceCustomer order={order} />
        <InvoiceVendor order={order} />
      </div>

      <div className="mt-1">
        <InvoiceItems order={order} />
      </div>

     <div className="grid grid-cols-2 gap-2 mt-1">

  <div className="w-full">
    <InvoicePayment order={order} />
  </div>

  <div className="w-full">
    <InvoiceSummary
      subtotal={subtotal}
      gst={gst}
      shipping={shipping}
      discount={discount}
      grandTotal={grandTotal}
    />
  </div>

</div>

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
/>
      </div>

    </div>

  );

}