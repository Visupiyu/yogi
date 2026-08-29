// YOMICO order timing. Two independent clocks, different anchors, different
// accountable parties:
//
//   Clock A — Admin confirmation.  createdAt + 24h
//     Starts when the CUSTOMER PLACES the order. An order still Pending past
//     that point is confirmation-overdue.
//
//   Clock B — Maximum delivery.  confirmedAt + 72h
//     Starts when the ADMIN CONFIRMS. The order should reach Delivered by
//     then; past it without delivery, the order is delivery-overdue.
//
// Both are OBSERVATIONAL. Neither blocks anything: an admin may still confirm
// at hour 30, and an order past 72h stays fully deliverable — the breach is
// recorded, not enforced. Nothing here cancels or refuses an order.
//
// This replaces the earlier "seller packing response" reading of the same two
// numbers, where 24h was a seller response window and 72h bounded a packing
// time the seller chose. Those semantics, their fields
// (packingResponseDeadlineAt, packingMaxDeadlineAt, packingDeadlines) and the
// rule that enforced them are gone — see lib/packingDeadline.ts, deleted.

export const ADMIN_CONFIRM_HOURS = 24;
export const MAX_DELIVERY_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Order documents carry Firestore Timestamps, but the same field arrives as a
 * plain object from a cached read and as a Date from optimistic local state.
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const candidate = value as { toDate?: () => Date; seconds?: number };

  if (typeof candidate.toDate === "function") {
    const d = candidate.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof candidate.seconds === "number") {
    return new Date(candidate.seconds * 1000);
  }

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export function adminConfirmDeadlineFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ADMIN_CONFIRM_HOURS * HOUR_MS);
}

export function deliveryDeadlineFrom(confirmedAt: Date): Date {
  return new Date(confirmedAt.getTime() + MAX_DELIVERY_HOURS * HOUR_MS);
}

/** IST, because that is the timezone the business actually operates in. */
export function formatIst(value: unknown): string {
  const date = toDate(value);
  if (!date) return "—";

  return (
    date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " IST"
  );
}

/** "in 5h 20m" / "2h 10m ago". */
export function relativeToNow(target: Date, now: Date = new Date()): string {
  const diff = target.getTime() - now.getTime();
  const past = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const body = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return past ? `${body} ago` : `in ${body}`;
}

// --- Clock A: admin confirmation --------------------------------------------

export type ConfirmationState =
  /** Still Pending, inside the 24h window. */
  | "awaiting"
  /** Still Pending and past the 24h window — admin may STILL confirm. */
  | "overdue"
  /** Confirmed within 24h of placement. */
  | "on-time"
  /** Confirmed, but after the 24h window had passed. */
  | "late"
  /** Cancelled, or no createdAt to measure from. */
  | "not-applicable";

export type ConfirmationTiming = {
  deadlineAt: Date | null;
  state: ConfirmationState;
  /** True whenever the 24h target was missed, whether or not it is confirmed yet. */
  breached: boolean;
};

export function confirmationTiming(
  order:
    | { status?: unknown; createdAt?: unknown; confirmedAt?: unknown }
    | null
    | undefined,
  now: Date = new Date()
): ConfirmationTiming {
  const status = typeof order?.status === "string" ? order.status : "";
  const createdAt = toDate(order?.createdAt);

  // Legacy orders without createdAt cannot be measured. Fail quiet rather
  // than inventing a deadline.
  if (!createdAt || status === "Cancelled") {
    return { deadlineAt: null, state: "not-applicable", breached: false };
  }

  const deadlineAt = adminConfirmDeadlineFrom(createdAt);
  const confirmedAt = toDate(order?.confirmedAt);

  if (!confirmedAt) {
    // Not yet confirmed. Anything past Pending without a confirmedAt is a
    // legacy order confirmed before this feature — not measurable.
    if (status !== "Pending") {
      return { deadlineAt, state: "not-applicable", breached: false };
    }

    const overdue = now > deadlineAt;
    return {
      deadlineAt,
      state: overdue ? "overdue" : "awaiting",
      breached: overdue,
    };
  }

  const late = confirmedAt > deadlineAt;
  return { deadlineAt, state: late ? "late" : "on-time", breached: late };
}

// --- Clock B: maximum delivery ----------------------------------------------

export type DeliveryState =
  /** Not confirmed yet, so the delivery clock has not started. */
  | "not-started"
  /** Confirmed, not delivered, still inside 72h. */
  | "on-track"
  /** Confirmed, not delivered, past 72h — still fully deliverable. */
  | "overdue"
  /** Delivered inside 72h. */
  | "met"
  /** Delivered, but after 72h had passed. */
  | "late"
  /** Cancelled, or delivered with no usable timestamp to judge. */
  | "not-applicable";

export type DeliveryTiming = {
  deadlineAt: Date | null;
  deliveredAt: Date | null;
  state: DeliveryState;
  /** True when the 72h target was missed, delivered or not. */
  breached: boolean;
};

export function deliveryTiming(
  order:
    | {
        status?: unknown;
        confirmedAt?: unknown;
        deliveryDeadlineAt?: unknown;
        deliveredAt?: unknown;
      }
    | null
    | undefined,
  now: Date = new Date()
): DeliveryTiming {
  const status = typeof order?.status === "string" ? order.status : "";

  if (status === "Cancelled") {
    return {
      deadlineAt: null, deliveredAt: null,
      state: "not-applicable", breached: false,
    };
  }

  const confirmedAt = toDate(order?.confirmedAt);

  // Prefer the stored deadline — it is what app/api/confirm-order committed —
  // and fall back to deriving it from confirmedAt for orders confirmed before
  // the field existed.
  const deadlineAt =
    toDate(order?.deliveryDeadlineAt) ??
    (confirmedAt ? deliveryDeadlineFrom(confirmedAt) : null);

  if (!deadlineAt) {
    return {
      deadlineAt: null, deliveredAt: null,
      state: "not-started", breached: false,
    };
  }

  const deliveredAt = toDate(order?.deliveredAt);

  if (deliveredAt) {
    const late = deliveredAt > deadlineAt;
    return {
      deadlineAt, deliveredAt,
      state: late ? "late" : "met", breached: late,
    };
  }

  // Marked Delivered but with no timestamp — a legacy order, or one completed
  // before deliveredAt was stamped on every path. Not judgeable either way.
  if (status === "Delivered") {
    return {
      deadlineAt, deliveredAt: null,
      state: "not-applicable", breached: false,
    };
  }

  const overdue = now > deadlineAt;
  return {
    deadlineAt, deliveredAt: null,
    state: overdue ? "overdue" : "on-track", breached: overdue,
  };
}
