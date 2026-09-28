// SERVER-ONLY (Admin SDK). The customer notification centre. The customer is
// always the verified token's uid; only notifications addressed to that uid
// with role "customer" are ever read, returned or marked read.
import type { Firestore } from "firebase-admin/firestore";
import {
  NOTIFICATIONS_PAGE_SIZE,
  buildCustomerNotification,
  isCustomerNotificationFor,
  newestFirst,
  opaqueNotificationId,
  type CustomerNotification,
  type NotificationRow,
} from "@/lib/account/notificationViews";

async function ownCustomerNotifications(db: Firestore, uid: string): Promise<NotificationRow[]> {
  const snap = await db.collection("notifications").where("userId", "==", uid).get();
  return newestFirst(
    snap.docs
      .map((d) => ({ id: d.id, data: (d.data() || {}) as Record<string, unknown> }))
      .filter((r) => isCustomerNotificationFor(uid, r.data))
  );
}

async function ownOrderNumbers(db: Firestore, uid: string): Promise<Map<string, string | null>> {
  const snap = await db.collection("orders").where("userId", "==", uid).select("orderNumber").get();
  return new Map(
    snap.docs.map((d) => {
      const n = d.get("orderNumber");
      return [d.id, typeof n === "string" && n ? n.slice(0, 60) : null];
    })
  );
}

export type AccountNotificationsPage = {
  unreadCount: number;
  notifications: CustomerNotification[];
  nextCursor: string | null;
};
export const ACCOUNT_NOTIFICATIONS_PAGE_KEYS = ["unreadCount", "notifications", "nextCursor"] as const;

export async function loadCustomerNotificationsPage(db: Firestore, uid: string, offset: number): Promise<AccountNotificationsPage> {
  const [rows, orders] = await Promise.all([ownCustomerNotifications(db, uid), ownOrderNumbers(db, uid)]);
  const page = rows.slice(offset, offset + NOTIFICATIONS_PAGE_SIZE);
  return {
    unreadCount: rows.filter((r) => r.data.read !== true).length,
    notifications: page.map((r) => buildCustomerNotification(r, orders)),
    nextCursor: offset + NOTIFICATIONS_PAGE_SIZE < rows.length ? String(offset + NOTIFICATIONS_PAGE_SIZE) : null,
  };
}

export async function countUnreadCustomerNotifications(db: Firestore, uid: string): Promise<number> {
  const rows = await ownCustomerNotifications(db, uid);
  return rows.filter((r) => r.data.read !== true).length;
}

/**
 * Mark the caller's own customer notifications read. Opaque ids are mapped
 * back among THEIR notifications only — an id belonging to anyone else, to
 * another role, or to nothing, simply matches nothing. Only the `read` field
 * is written.
 */
export async function markCustomerNotificationsRead(
  db: Firestore,
  uid: string,
  target: { all: true } | { ids: string[] }
): Promise<number> {
  const rows = await ownCustomerNotifications(db, uid);
  const wanted = "all" in target ? null : new Set(target.ids);
  const toUpdate = rows.filter((r) => r.data.read !== true && (wanted === null || wanted.has(opaqueNotificationId(r.id))));
  for (let i = 0; i < toUpdate.length; i += 400) {
    const batch = db.batch();
    for (const r of toUpdate.slice(i, i + 400)) batch.update(db.collection("notifications").doc(r.id), { read: true });
    await batch.commit();
  }
  return toUpdate.length;
}
