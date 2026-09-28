// Account deletion REQUESTS — the customer asks, an admin processes by hand.
// Nothing here (or anywhere in this flow) deletes or blocks an account: no
// Firebase Auth user, order, invoice/GST, payment, refund or reward record is
// ever removed automatically. "completed" only records that an admin has
// finished the manual steps.
//
// Stored server-only at accountDeletionRequests/{uid} (one document per
// customer; firestore.rules' catch-all denies every browser read and write).
// Pure: the routes, the admin page's server and the tests share it.

export type DeletionStatus = "pending" | "in_review" | "completed" | "rejected" | "cancelled";

export const DELETION_STATUS_LABELS: Record<DeletionStatus, string> = {
  pending: "Requested — waiting for review",
  in_review: "Being reviewed by YOMICO",
  completed: "Completed",
  rejected: "Not approved",
  cancelled: "Cancelled by you",
};

export const OPEN_DELETION_STATUSES: readonly DeletionStatus[] = ["pending", "in_review"];

export const MAX_DELETION_REASON = 500;
export const MAX_CUSTOMER_MESSAGE = 500;
export const MAX_INTERNAL_NOTE = 1000;

export function isDeletionStatus(v: unknown): v is DeletionStatus {
  return typeof v === "string" && v in DELETION_STATUS_LABELS;
}

export function isOpenDeletion(status: unknown): boolean {
  return status === "pending" || status === "in_review";
}

/** A customer may (re-)request when they have no request, or the last one was
 *  cancelled or rejected. A completed request is final. */
export function canRequestDeletion(existingStatus: unknown): boolean {
  return existingStatus === undefined || existingStatus === null || existingStatus === "cancelled" || existingStatus === "rejected";
}

/** The admin's allowed moves. */
export function isAllowedAdminTransition(from: unknown, to: unknown): boolean {
  if (to === "in_review") return from === "pending";
  if (to === "completed" || to === "rejected") return from === "pending" || from === "in_review";
  return false;
}

export type DeletionRequestView = {
  status: DeletionStatus;
  statusLabel: string;
  reason: string;
  requestedAt: string | null;
  updatedAt: string | null;
  messageFromYomico: string | null;
  canCancel: boolean;
};
export const DELETION_REQUEST_VIEW_KEYS = [
  "status", "statusLabel", "reason", "requestedAt", "updatedAt", "messageFromYomico", "canCancel",
] as const;

function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

/** What the CUSTOMER sees — never the admin's internal note or identity. */
export function buildDeletionRequestView(data: Record<string, unknown>): DeletionRequestView | null {
  if (!isDeletionStatus(data.status)) return null;
  const msg = typeof data.customerMessage === "string" && data.customerMessage.trim() ? data.customerMessage.slice(0, MAX_CUSTOMER_MESSAGE) : null;
  return {
    status: data.status,
    statusLabel: DELETION_STATUS_LABELS[data.status],
    reason: typeof data.reason === "string" ? data.reason.slice(0, MAX_DELETION_REASON) : "",
    requestedAt: iso(data.requestedAt),
    updatedAt: iso(data.updatedAt),
    messageFromYomico: msg,
    canCancel: isOpenDeletion(data.status),
  };
}

export type AdminDeletionRequestView = {
  uid: string;
  email: string;
  name: string;
  status: DeletionStatus;
  reason: string;
  requestedAt: string | null;
  updatedAt: string | null;
  customerMessage: string | null;
  internalNote: string | null;
  account: { orders: number; openOrders: number; openReturns: number; refundsDue: number; rewardBalance: number };
};
export const ADMIN_DELETION_REQUEST_KEYS = [
  "uid", "email", "name", "status", "reason", "requestedAt", "updatedAt", "customerMessage", "internalNote", "account",
] as const;

/** Optional free text: trimmed, bounded; "" -> null; wrong type or too long -> error. */
export function optionalText(v: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const s = v.trim();
  if (s.length > max) return { ok: false };
  return { ok: true, value: s || null };
}
