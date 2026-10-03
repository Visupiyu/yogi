// The single order-tracking definition, shared by every surface that draws a
// progress tracker:
//
//   app/orders/page.tsx        (customer order list)
//   app/orders/[id]/page.tsx   (customer order detail)
//   app/track-order/page.tsx   (guest tracker)
//
// Each page previously carried its own copy of getStep() and its own labels,
// and they had already drifted: the detail page read "📦 Pending" while the
// list still read "📝 Placed" for the same stored status, and a fix applied to
// one did not reach the other. One definition removes that whole class of bug.
//
// Deliberately dependency-free — no Firebase import of any kind — so the guest
// tracker can use it without pulling the client SDK, exactly like
// lib/shippingRules.ts. Its customer wording (CUSTOMER_STATUS_LABELS) is its own;
// the seller/admin wording stays in lib/itemFulfilment.ts.

/**
 * CUSTOMER wording for each stored order/item status.
 *
 * Deliberately NOT lib/itemFulfilment's FULFILMENT_STAGE_LABELS: those are the
 * approved SELLER/OPERATIONS labels ("Accept", "Ready for Delivery", "Handed
 * Over to Courier", "Final Delivery") describing what the seller does next —
 * meaningless or misleading to a shopper ("Accept" read as if the customer had
 * to accept something). Customers get plain shopping-status words; the stored
 * values and the seller/admin labels are unchanged.
 */
export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  Pending: "Order placed",
  Confirmed: "Order confirmed",
  Packed: "Packed",
  Shipped: "Shipped",
  "Out For Delivery": "Out for delivery",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
  "Delivery Failed": "Delivery attempted",
  Returned: "Returned",
};

/** Customer-facing label for a stored status; unknown values read as "Processing". */
export function customerStatusLabel(status: string | null | undefined): string {
  if (!status) return "Processing";
  return CUSTOMER_STATUS_LABELS[status] ?? "Processing";
}

/** The six tracked steps, in order. Index + 1 is the step number. */
export const ORDER_STEPS = [
  `📦 ${CUSTOMER_STATUS_LABELS.Pending}`,
  `✅ ${CUSTOMER_STATUS_LABELS.Confirmed}`,
  `📦 ${CUSTOMER_STATUS_LABELS.Packed}`,
  `🚚 ${CUSTOMER_STATUS_LABELS.Shipped}`,
  `🚚 ${CUSTOMER_STATUS_LABELS["Out For Delivery"]}`,
  `🎉 ${CUSTOMER_STATUS_LABELS.Delivered}`,
] as const;

export const TOTAL_STEPS = ORDER_STEPS.length;

/**
 * Which step a stored order status corresponds to, 1-based.
 *
 * The switch below is on the STORED status value, which is unchanged by the
 * display relabelling — ORDER_STEPS carries the customer-facing wording, this
 * function carries the data. Step 1 is stored "Pending", never "Placed", so
 * the tracker and the status chip on the same page can never disagree.
 *
 * Unknown and terminal-but-untracked statuses ("Cancelled") fall back to 1.
 * Those surfaces render their own notice instead of the tracker, so the value
 * is never shown; returning 1 just avoids NaN maths in the progress bar.
 */
export function getStep(status: string = ""): number {
  switch (status) {
    case "Pending":
      return 1;
    case "Confirmed":
      return 2;
    case "Packed":
      return 3;
    case "Shipped":
      return 4;
    case "Out For Delivery":
      return 5;
    case "Delivered":
      return 6;
    case "Delivery Failed":
      // Same step as "Out For Delivery" — a failed attempt doesn't erase
      // progress already made, it just doesn't advance past it.
      return 5;
    default:
      return 1;
  }
}
