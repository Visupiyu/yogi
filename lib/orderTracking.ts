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
// lib/shippingRules.ts.

/** The six tracked statuses, in order. Index + 1 is the step number. */
export const ORDER_STEPS = [
  "📦 Pending",
  "✅ Confirmed",
  "📦 Packed",
  "🚚 Shipped",
  "🚚 Out For Delivery",
  "🎉 Delivered",
] as const;

export const TOTAL_STEPS = ORDER_STEPS.length;

/**
 * Which step a stored order status corresponds to, 1-based.
 *
 * Labels in ORDER_STEPS match the stored status values exactly — step 1 is
 * "Pending", not "Placed" — so the tracker and the status chip on the same
 * page can never disagree.
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
