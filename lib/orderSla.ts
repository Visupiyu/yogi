import {
  adminConfirmDeadlineFrom,
  deliveryDeadlineFrom,
  toDate,
} from "@/lib/orderTiming";

// Presentation layer for the admin Order Timing / SLA table.
//
// Composes the two clocks lib/orderTiming.ts already defines into the exact
// labels the table renders. Nothing here changes their semantics, and nothing
// here writes: an SLA state is a read of what the confirmation API already
// stamped. Both clocks are monitoring only — no status transition is ever
// blocked because a deadline passed.
//
//   Clock A — Admin confirmation: 24h from createdAt (order placement).
//   Clock B — Delivery completion: 72h from confirmedAt (admin confirmation).

export type ConfirmationSla =
  | "cancelled"
  | "unknown"
  | "pending"
  | "confirmation-overdue"
  | "confirmed-on-time"
  | "confirmed-late";

export type DeliverySla =
  | "cancelled"
  | "awaiting-confirmation"
  | "clock-running"
  | "delivery-overdue"
  | "delivered-on-time"
  | "delivered-late"
  | "delivered-untimed";

export const CONFIRMATION_SLA_TEXT: Record<ConfirmationSla, string> = {
  cancelled: "Cancelled",
  unknown: "No placement time",
  pending: "Pending",
  "confirmation-overdue": "Confirmation Overdue",
  "confirmed-on-time": "Confirmed On Time",
  "confirmed-late": "Confirmed Late",
};

export const DELIVERY_SLA_TEXT: Record<DeliverySla, string> = {
  cancelled: "Cancelled",
  "awaiting-confirmation": "Awaiting Confirmation",
  "clock-running": "Delivery Clock Running",
  "delivery-overdue": "Delivery Overdue",
  "delivered-on-time": "Delivered On Time",
  "delivered-late": "Delivered Late",
  "delivered-untimed": "Delivered (no timestamp)",
};

/** breach = red, ok = green, running = blue, idle = grey. */
export type SlaTone = "ok" | "breach" | "running" | "idle";

export const CONFIRMATION_SLA_TONE: Record<ConfirmationSla, SlaTone> = {
  cancelled: "idle",
  unknown: "idle",
  pending: "running",
  "confirmation-overdue": "breach",
  "confirmed-on-time": "ok",
  "confirmed-late": "breach",
};

export const DELIVERY_SLA_TONE: Record<DeliverySla, SlaTone> = {
  cancelled: "idle",
  "awaiting-confirmation": "idle",
  "clock-running": "running",
  "delivery-overdue": "breach",
  "delivered-on-time": "ok",
  "delivered-late": "breach",
  "delivered-untimed": "idle",
};

/**
 * A short, USEFUL label for an order.
 *
 * The plain `id.slice(0, 8)` the admin tables used is actively misleading:
 * pay-on-delivery ids are `${customerUid}_${idempotencyKey}`, so the first
 * eight characters are the customer's uid prefix and EVERY order by the same
 * customer renders identically. Taking the segment after the last underscore
 * uses the part that actually varies per order. Razorpay ids (`pay_...`) and
 * plain random ids fall through to their own distinctive characters.
 *
 * Display only — callers keep the full id for every lookup and link.
 */
export function shortOrderLabel(id: string): string {
  if (!id) return "—";

  const tail = id.includes("_") ? id.slice(id.lastIndexOf("_") + 1) : id;
  const usable = tail || id;

  return usable.slice(0, 10);
}

export type SlaOrder = {
  id?: string;
  status?: unknown;
  createdAt?: unknown;
  confirmedAt?: unknown;
  confirmedLate?: unknown;
  adminConfirmDeadlineAt?: unknown;
  deliveryDeadlineAt?: unknown;
  deliveredAt?: unknown;
};

export type SlaRow = {
  orderId: string;
  label: string;
  createdAt: Date | null;
  /** Clock A. Derived from createdAt when the stored field is absent. */
  confirmDeadlineAt: Date | null;
  confirmedAt: Date | null;
  confirmation: ConfirmationSla;
  /** Clock B. NULL when the order was never confirmed — never invented. */
  deliveryDeadlineAt: Date | null;
  deliveredAt: Date | null;
  delivery: DeliverySla;
  /** Positive = time left, negative = overdue by. Null when no live clock. */
  confirmationRemainingMs: number | null;
  deliveryRemainingMs: number | null;
};

export function orderSlaRow(
  order: SlaOrder | null | undefined,
  now: Date = new Date()
): SlaRow {
  const orderId = typeof order?.id === "string" ? order.id : "";
  const status = typeof order?.status === "string" ? order.status : "";
  const createdAt = toDate(order?.createdAt);
  const confirmedAt = toDate(order?.confirmedAt);
  const deliveredAt = toDate(order?.deliveredAt);

  // Clock A. Prefer what the confirmation API stamped; fall back to deriving
  // from createdAt so a legacy order still gets a correct 24h deadline.
  const confirmDeadlineAt =
    toDate(order?.adminConfirmDeadlineAt) ??
    (createdAt ? adminConfirmDeadlineFrom(createdAt) : null);

  // Clock B. Only exists once the order was confirmed — an unconfirmed order
  // has no delivery deadline, and one must not be manufactured for it.
  const deliveryDeadlineAt = confirmedAt
    ? toDate(order?.deliveryDeadlineAt) ?? deliveryDeadlineFrom(confirmedAt)
    : null;

  const cancelled = status === "Cancelled";

  // ---- Clock A state ----
  let confirmation: ConfirmationSla;

  if (cancelled) {
    confirmation = "cancelled";
  } else if (!confirmDeadlineAt) {
    confirmation = "unknown";
  } else if (confirmedAt) {
    confirmation =
      order?.confirmedLate === true || confirmedAt > confirmDeadlineAt
        ? "confirmed-late"
        : "confirmed-on-time";
  } else if (status === "Pending") {
    confirmation =
      now > confirmDeadlineAt ? "confirmation-overdue" : "pending";
  } else {
    // Past Pending with no confirmedAt: confirmed before the API existed.
    confirmation = "unknown";
  }

  // ---- Clock B state ----
  let delivery: DeliverySla;

  if (cancelled) {
    delivery = "cancelled";
  } else if (!deliveryDeadlineAt) {
    delivery = "awaiting-confirmation";
  } else if (deliveredAt) {
    delivery =
      deliveredAt > deliveryDeadlineAt ? "delivered-late" : "delivered-on-time";
  } else if (status === "Delivered") {
    delivery = "delivered-untimed";
  } else {
    delivery = now > deliveryDeadlineAt ? "delivery-overdue" : "clock-running";
  }

  // ---- live remainders ----
  const confirmationRemainingMs =
    confirmation === "pending" || confirmation === "confirmation-overdue"
      ? confirmDeadlineAt!.getTime() - now.getTime()
      : null;

  const deliveryRemainingMs =
    delivery === "clock-running" || delivery === "delivery-overdue"
      ? deliveryDeadlineAt!.getTime() - now.getTime()
      : null;

  return {
    orderId,
    label: shortOrderLabel(orderId),
    createdAt,
    confirmDeadlineAt,
    confirmedAt,
    confirmation,
    deliveryDeadlineAt,
    deliveredAt,
    delivery,
    confirmationRemainingMs,
    deliveryRemainingMs,
  };
}

/** "5h 20m left" / "2h 10m overdue" — for the live countdown cells. */
export function formatRemaining(ms: number | null): string {
  if (ms === null) return "—";

  const overdue = ms < 0;
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const body = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return overdue ? `${body} overdue` : `${body} left`;
}
