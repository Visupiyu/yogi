import { Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

// Telling sellers about a new order — at CONFIRMATION, not at placement.
//
// This notification used to be written the moment the customer checked out,
// by lib/orderNotifications.ts. It fires while the order is still Pending and
// names the customer and the item, so a seller learned about an order that
// firestore.rules deliberately hides from every one of their queries. The
// notification bell was a side channel around the read rule — and it is
// realtime (components/NotificationBell.tsx uses onSnapshot), so it landed
// the instant the order was placed.
//
// The payload shape is unchanged — one notification per line item, same title
// and wording — so nothing downstream sees a different message. Only the
// moment it is sent has moved.

export type NotifiableItem = {
  vendorId?: unknown;
  name?: unknown;
};

export type SellerNotification = {
  userId: string;
  role: "seller";
  title: string;
  message: string;
  type: "order";
  read: false;
};

/**
 * One notification per line item, addressed to that item's own vendor.
 *
 * Per-item rather than per-vendor purely to match what the placement path
 * already sent. Scoping falls out of the data: an item carries exactly one
 * vendorId, so a seller is only ever told about their own items and never
 * learns that another seller is on the same order.
 */
export function sellerNotificationsForOrder(
  order: { customerName?: unknown; items?: unknown } | null | undefined
): SellerNotification[] {
  const customerName =
    typeof order?.customerName === "string" && order.customerName.trim()
      ? order.customerName.trim()
      : "A customer";

  const items = Array.isArray(order?.items)
    ? (order!.items as NotifiableItem[])
    : [];

  const notifications: SellerNotification[] = [];

  for (const item of items) {
    if (typeof item?.vendorId !== "string" || !item.vendorId) continue;

    const name = typeof item?.name === "string" ? item.name : "an item";

    notifications.push({
      userId: item.vendorId,
      role: "seller",
      title: "🛒 New Order",
      message: `${customerName} ordered ${name}`,
      type: "order",
      read: false,
    });
  }

  return notifications;
}

/**
 * Best-effort. The order is already confirmed and its delivery clock already
 * started by the time this runs, so a failed notification must not undo any
 * of it — the caller logs and carries on, exactly as the placement path did.
 */
export async function emitSellerOrderNotifications(
  db: Firestore,
  order: { customerName?: unknown; items?: unknown } | null | undefined
): Promise<number> {
  const notifications = sellerNotificationsForOrder(order);

  for (const notification of notifications) {
    await db.collection("notifications").add({
      ...notification,
      createdAt: Timestamp.now(),
    });
  }

  return notifications.length;
}
