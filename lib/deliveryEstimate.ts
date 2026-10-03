// Customer-facing delivery estimate — the ONE place that decides what a
// customer is told about WHEN an order arrives. Dependency-free (no Firebase),
// so checkout, the product page, order pages, the guest tracker and server
// routes all share it.
//
// It never invents a date. YOMICO has no carrier/pincode transit data, so the
// only real inputs are the business's own delivery rule (lib/orderTiming.ts:
// an order is confirmed within ADMIN_CONFIRM_HOURS of being placed and is due
// for delivery within MAX_DELIVERY_HOURS of confirmation — the delivery
// deadline confirm-order stores as deliveryDeadlineAt) and dates a person
// actually recorded (a seller/admin-entered expectedDelivery, deliveredAt).
//
// This replaces the "+5 days from today" string every order used to store as
// `deliveryDate` and every page displayed as an "estimated delivery": the same
// fixed number for every customer, destination and product, regardless of the
// real rule. That field is no longer written; legacy values are ignored here.
import { ADMIN_CONFIRM_HOURS, MAX_DELIVERY_HOURS, deliveryDeadlineFrom, toDate } from "@/lib/orderTiming";

const CONFIRM_HOURS_TEXT = `${ADMIN_CONFIRM_HOURS} hours`;
const DELIVERY_DAYS = Math.round(MAX_DELIVERY_HOURS / 24);
const DELIVERY_WINDOW_TEXT = `${DELIVERY_DAYS} days`;

/** Shown before an order exists (checkout, product page). */
export const PRE_ORDER_DELIVERY_TEXT =
  `Your delivery date is confirmed after you place the order. Orders are usually confirmed within ${CONFIRM_HOURS_TEXT} ` +
  `and we aim to deliver within ${DELIVERY_WINDOW_TEXT} of confirmation.`;

/** Short form for compact summaries. */
export const PRE_ORDER_DELIVERY_SHORT = `Confirmed after ordering (target: ${DELIVERY_WINDOW_TEXT} from confirmation)`;

export type DeliveryEstimateOrder = {
  status?: unknown;
  confirmedAt?: unknown;
  deliveryDeadlineAt?: unknown;
  expectedDelivery?: unknown;
  deliveredAt?: unknown;
};

export type DeliveryEstimate =
  | { kind: "delivered"; label: string; date: Date | null; note: null }
  | { kind: "expected"; label: string; date: Date; note: string }
  | { kind: "target"; label: string; date: Date; note: string }
  | { kind: "awaiting-confirmation"; label: string; date: null; note: string }
  | { kind: "none"; label: null; date: null; note: null };

function validDate(value: unknown): Date | null {
  const d = toDate(value);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * What to tell the customer about this order's delivery, in priority order:
 *   1. Delivered                → when it was delivered.
 *   2. expectedDelivery set     → that date (entered by the seller/admin from
 *                                 the actual shipment).
 *   3. Confirmed                → "expected by" the stored delivery deadline
 *                                 (confirmedAt + MAX_DELIVERY_HOURS) — the
 *                                 business's own target, labelled as a target.
 *   4. Not confirmed yet        → no date; say when one will exist.
 * Cancelled / failed orders get nothing.
 */
export function customerDeliveryEstimate(order: DeliveryEstimateOrder | null | undefined): DeliveryEstimate {
  const status = typeof order?.status === "string" ? order.status : "";
  if (!order || status === "Cancelled" || status === "Delivery Failed" || status === "Returned") {
    return { kind: "none", label: null, date: null, note: null };
  }
  if (status === "Delivered") {
    return { kind: "delivered", label: "Delivered", date: validDate(order.deliveredAt), note: null };
  }
  const expected = validDate(order.expectedDelivery);
  if (expected) {
    return { kind: "expected", label: "Expected delivery", date: expected, note: "Date provided by the seller for your shipment." };
  }
  const confirmedAt = validDate(order.confirmedAt);
  const deadline = validDate(order.deliveryDeadlineAt) ?? (confirmedAt ? deliveryDeadlineFrom(confirmedAt) : null);
  if (deadline) {
    return {
      kind: "target",
      label: "Expected by",
      date: deadline,
      note: `We aim to deliver within ${DELIVERY_WINDOW_TEXT} of confirming your order.`,
    };
  }
  return {
    kind: "awaiting-confirmation",
    label: "Delivery date",
    date: null,
    note: `Shown once your order is confirmed — usually within ${CONFIRM_HOURS_TEXT}.`,
  };
}

/** en-IN short date, in IST (where the business operates). */
export function formatEstimateDate(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
