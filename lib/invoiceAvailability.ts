// When an order's invoice is offered to the customer (client-safe, pure).
//
// One rule for the orders list and the order detail page, which had drifted: the
// list offered the invoice only for Confirmed/Shipped/Delivered (skipping Packed
// and Out For Delivery) while the detail page offered it for every status,
// including Pending, Cancelled and Delivery Failed. An invoice is for an order
// that has been confirmed and is on its way or delivered; a pending, cancelled or
// failed-delivery order has nothing to invoice yet / anymore.
//
// This only decides whether the LINK is shown. The invoice page and its ownership
// check are unchanged and still apply.
export const INVOICE_ELIGIBLE_STATUSES = [
  "Confirmed",
  "Packed",
  "Shipped",
  "Out For Delivery",
  "Delivered",
] as const;

export function isInvoiceAvailable(status: unknown): boolean {
  return (
    typeof status === "string" &&
    (INVOICE_ELIGIBLE_STATUSES as readonly string[]).includes(status)
  );
}

/** Same wording on the list and the detail page. */
export const INVOICE_LINK_LABEL = "📄 View Invoice";
