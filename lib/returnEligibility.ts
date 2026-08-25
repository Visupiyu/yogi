// The single return-eligibility rule, shared by the customer order pages, the
// return form and the server route that actually enforces it.
//
// Deliberately dependency-free — no Firebase import of any kind — so the same
// function runs in the browser (to show or hide the Request Return button) and
// on the server (where it is actually enforced), exactly like
// lib/shippingRules.ts and lib/orderTracking.ts. The client copy is a
// convenience; app/api/request-return is the control.

/** Approved policy: returns may be requested for 7 days after delivery. */
export const RETURN_WINDOW_DAYS = 7;

/**
 * Anything that carries the two fields the window is derived from. Loose on
 * purpose: order documents reach this from Firestore (Timestamp), from an API
 * projection (ISO string) and from component state (already a Date).
 */
export type ReturnWindowOrder = {
  status?: unknown;
  deliveredAt?: unknown;
  updatedAt?: unknown;
};

/** Firestore Timestamp | ISO string | Date | epoch millis -> Date | null. */
function toDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Firestore Timestamp (client SDK and Admin SDK both expose toDate()).
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  // Firestore Timestamp serialised over JSON.
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * The date the return window is measured from, and which field supplied it.
 *
 * Priority, per the approved decision:
 *   1. deliveredAt — authoritative, written by the delivery-partner flow
 *      (app/delivery/[id]/page.tsx).
 *   2. updatedAt when status is "Delivered" — the write that set it. Orders
 *      marked Delivered by a seller or an admin never get deliveredAt, so
 *      without this fallback a large share of genuinely delivered orders
 *      would have no basis date at all.
 *   3. Neither resolves -> null, and the caller must fail OPEN. Rejecting a
 *      real customer's valid return because we failed to record a date is a
 *      worse outcome than an admin reviewing an undated one.
 */
export function returnWindowBasis(order: ReturnWindowOrder): {
  date: Date | null;
  source: "deliveredAt" | "updatedAt" | "unknown";
} {
  const delivered = toDate(order?.deliveredAt);
  if (delivered) return { date: delivered, source: "deliveredAt" };

  if (order?.status === "Delivered") {
    const updated = toDate(order?.updatedAt);
    if (updated) return { date: updated, source: "updatedAt" };
  }

  return { date: null, source: "unknown" };
}

/** When the window closes, or null when no basis date could be established. */
export function returnWindowEndsAt(order: ReturnWindowOrder): Date | null {
  const { date } = returnWindowBasis(order);
  if (!date) return null;

  const end = new Date(date.getTime());
  end.setDate(end.getDate() + RETURN_WINDOW_DAYS);
  return end;
}

/**
 * Whether a return may still be requested.
 *
 * Returns true when no basis date exists — see returnWindowBasis note 3. The
 * caller is expected to flag such a request for admin review rather than
 * silently treating it as a normal in-window return.
 */
export function isWithinReturnWindow(
  order: ReturnWindowOrder,
  now: Date = new Date()
): boolean {
  const end = returnWindowEndsAt(order);
  if (!end) return true;
  return now.getTime() <= end.getTime();
}

/** Whole days left, or null when there is no basis date. Never negative. */
export function returnDaysRemaining(
  order: ReturnWindowOrder,
  now: Date = new Date()
): number | null {
  const end = returnWindowEndsAt(order);
  if (!end) return null;

  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * The one place that decides whether the Request Return action is offered.
 * Delivered-only is preserved exactly as both order pages already had it.
 */
export function canRequestReturn(
  order: ReturnWindowOrder,
  now: Date = new Date()
): boolean {
  return order?.status === "Delivered" && isWithinReturnWindow(order, now);
}
