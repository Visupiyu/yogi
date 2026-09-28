// Customer notification view — the ONLY shape the customer notification
// centre and bell receive (app/api/account/notifications*). Built on the
// server from the caller's OWN customer notifications, cut to fixed fields.
//
// The stored documents also carry internal delivery fields (eventId,
// deliveryJobId, sellerOrderId — which embeds the seller's uid —
// notificationType) and sometimes userEmail; none of them is ever returned.
// Ids are opaque (a hash of the document id); links are derived here, never
// read from the document. Server-only (node:crypto).
import { createHash } from "node:crypto";

export type NotificationRow = { id: string; data: Record<string, unknown> };

export type CustomerNotification = {
  id: string;
  title: string;
  message: string;
  category: "order" | "delivery" | "refund" | "support" | "stock" | "other";
  read: boolean;
  createdAt: string | null;
  orderNumber: string | null;
  link: string | null;
};

export const CUSTOMER_NOTIFICATION_KEYS = [
  "id", "title", "message", "category", "read", "createdAt", "orderNumber", "link",
] as const;

export const NOTIFICATIONS_PAGE_SIZE = 50;
export const MAX_MARK_READ_IDS = 100;

/** A notification belongs in the customer centre only when it is addressed
 *  to this uid AND to the customer role — the same filter the existing web
 *  page and the Customer App use (a seller who also shops has a separate
 *  seller feed under the same uid). */
export function isCustomerNotificationFor(uid: string, data: Record<string, unknown>): boolean {
  return data.userId === uid && data.role === "customer";
}

/** Stable, opaque id for the browser; mark-read maps it back on the server. */
export function opaqueNotificationId(docId: string): string {
  return createHash("sha256").update(`notification:${docId}`).digest("hex").slice(0, 24);
}

export function isOpaqueNotificationId(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{24}$/.test(v);
}

function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return null;
}
function ms(v: unknown): number {
  const s = iso(v);
  return s ? Date.parse(s) : 0;
}
function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

const CATEGORY: Record<string, CustomerNotification["category"]> = {
  order: "order",
  delivery: "delivery",
  shipping: "delivery",
  refund: "refund",
  support: "support",
  // Account deletion request updates (lib/account/deletionServer).
  account: "support",
  vendor: "stock",
};

/**
 * The customer view of one notification. `ownOrders` maps the caller's OWN
 * order ids to their order numbers: an order link / number is shown only for
 * an order that is really theirs.
 */
export function buildCustomerNotification(
  row: NotificationRow,
  ownOrders: Map<string, string | null>
): CustomerNotification {
  const d = row.data;
  const category = CATEGORY[text(d.type, 40)] ?? "other";
  const orderId = typeof d.orderId === "string" ? d.orderId : "";
  const ownOrder = orderId !== "" && ownOrders.has(orderId);
  const link = ownOrder
    ? `/orders/${encodeURIComponent(orderId)}`
    : d.type === "account"
    ? "/settings"
    : category === "refund"
    ? "/profile/refunds"
    : category === "support"
    ? "/profile/tickets"
    : null;
  return {
    id: opaqueNotificationId(row.id),
    title: text(d.title, 200) || "Notification",
    message: text(d.message, 1000),
    category,
    read: d.read === true,
    createdAt: iso(d.createdAt),
    orderNumber: ownOrder ? ownOrders.get(orderId) ?? null : null,
    link,
  };
}

export function newestFirst(rows: NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => ms(b.data.createdAt) - ms(a.data.createdAt));
}

/** cursor = how many notifications the customer has already been shown. */
export function parseNotificationCursor(raw: string | null): number | null {
  if (raw === null || raw === "") return 0;
  if (!/^\d{1,6}$/.test(raw)) return null;
  return Number(raw);
}

/** { ids: [...] } (1–100 opaque ids) or { all: true }; anything else is invalid. */
export function parseMarkReadBody(body: unknown): { all: true } | { ids: string[] } | null {
  const b = body as { ids?: unknown; all?: unknown } | null;
  if (!b || typeof b !== "object") return null;
  if (b.all === true && b.ids === undefined) return { all: true };
  if (b.all === undefined && Array.isArray(b.ids)) {
    if (b.ids.length < 1 || b.ids.length > MAX_MARK_READ_IDS) return null;
    if (!b.ids.every(isOpaqueNotificationId)) return null;
    return { ids: [...new Set(b.ids as string[])] };
  }
  return null;
}
