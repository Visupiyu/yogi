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
// lib/shippingRules.ts. lib/itemFulfilment.ts is dependency-free for the same
// reason, so importing the display labels from it keeps that property.

import { FULFILMENT_STAGE_LABELS } from "@/lib/itemFulfilment";

/**
 * The six tracked steps, in order. Index + 1 is the step number.
 *
 * The wording after the emoji comes from FULFILMENT_STAGE_LABELS so the
 * customer tracker, the seller stage strip and the admin badges cannot drift
 * apart. "Pending" has no fulfilment stage behind it — nothing is being
 * fulfilled yet — so it is spelled out here.
 */
export const ORDER_STEPS = [
  "📦 Pending",
  `✅ ${FULFILMENT_STAGE_LABELS.Confirmed}`,
  `📦 ${FULFILMENT_STAGE_LABELS.Packed}`,
  `🚚 ${FULFILMENT_STAGE_LABELS.Shipped}`,
  `🚚 ${FULFILMENT_STAGE_LABELS["Out For Delivery"]}`,
  `🎉 ${FULFILMENT_STAGE_LABELS.Delivered}`,
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
