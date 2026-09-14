// SERVER-ONLY. Delivery Notification System V1.
//
// The Delivery Engine (execution.ts, hubIntake.ts, transit.ts, destinationHub.ts,
// destinationHandover.ts, finalMileAssign.ts, assignment.ts, codPayment.ts,
// deliveryException.ts) is the ONE authoritative source of delivery events.
// This module turns an authoritative transition already being written inside
// one of those transactions into a row in the EXISTING `notifications`
// collection (see lib/orderNotifications.ts / lib/sellerOrderNotifications.ts
// / components/NotificationBell.tsx) — never a second notification system.
//
// Architecture:
//   authoritative delivery write (same transaction)
//     -> emitDeliveryNotification() appends a `notifications` doc
//     -> the EXISTING customer/seller bell + /notifications page (Firestore
//        reads, unchanged) and the delivery app's OWN new REST feed
//        (app/api/delivery/notifications) read it.
//
// The existing collection's shape is `{ userId?, role, title, message, type,
// read, createdAt }` (role "admin" has no userId). This module writes the
// SAME shape plus small additive audit fields (notificationType, eventId,
// orderId, orderNumber, sellerOrderId, deliveryJobId) that existing readers
// simply ignore — nothing here changes what NotificationBell.tsx / the
// customer /notifications page / the seller NotificationsPanel already read.
// `role: "delivery_person"` is a NEW role value (customer/seller/admin
// already existed); it never collides with an existing query because those
// all filter on role too.
//
// IDEMPOTENCY: the doc id is DETERMINISTIC — derived from
// recipient + eventId + notificationType — and the write is a blind
// (non-merge) `tx.set`, never a `.add()`. A transaction retry (Firestore's
// own contention retry, or an idempotent replay that short-circuits BEFORE
// reaching the call site — see execution.ts's scanEventId dedup) can only
// ever recompute the exact same id with the exact same content, so it is
// never a duplicate notification, without needing an extra existence read.
//
// FAILURE ISOLATION: every function here is defensive — a failed read (order
// not found, hub query error) or a malformed input degrades to "skip this
// notification" (logged), NEVER a thrown error that could abort the
// surrounding delivery transaction. Sending a notification must never be the
// reason a pickup/handover/delivery/payment write fails.
import type { Transaction, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import type { DeliveryPerson } from "@/lib/deliveryEngine/types";

// Customer/seller/delivery-person lifecycle + operational notification types.
//
// ORDER_CONFIRMED is DELIBERATELY NOT part of this union: it is already
// emitted by the existing commerce flow (lib/orderNotifications.ts's
// "✅ Order Placed" / lib/sellerOrderNotifications.ts's "🛒 New Order" at
// confirm-order) — see the module comment above. Duplicating it here would
// create a second notification for the same event, which this system is
// explicitly built to avoid.
export type DeliveryNotificationType =
  | "SHIPMENT_PICKED_UP"
  | "ORIGIN_HUB_RECEIVED"
  | "IN_COMPANY_TRANSPORT"
  | "DESTINATION_HUB_RECEIVED"
  | "RIDER_ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "COD_PAYMENT_VERIFIED"
  | "DELIVERED"
  | "DELIVERY_ISSUE"
  | "DELIVERY_JOB_ASSIGNED"
  | "DELIVERY_JOB_REASSIGNED"
  | "HUB_TASK_ASSIGNED"
  | "DELIVERY_STATE_CHANGED"
  // Return Collection V1 (reverse logistics) — additive members for the
  // return-collection lifecycle (see lib/deliveryEngine/returnCollection.ts).
  // Existing readers ignore notificationType, so adding these changes nothing
  // for them; the title/message are always customer-safe strings passed by the
  // caller, and internal return/delivery mechanics are never exposed.
  | "RETURN_COLLECTION_ASSIGNED"
  | "RETURN_COLLECTED"
  | "RETURN_RECEIVED"
  | "RETURN_COLLECTION_ISSUE";

export type NotificationRecipientRole = "customer" | "seller" | "delivery_person";

// userId is ALWAYS the recipient's Firebase Auth uid — the same identity
// every existing notifications reader (NotificationBell.tsx, the customer
// /notifications page, the seller NotificationsPanel, and this feature's own
// new /api/delivery/notifications route) authenticates and filters by. Never
// a Firestore document id (personId, jobId, ...).
export type NotificationRecipient = { role: NotificationRecipientRole; userId: string };

export type EmitDeliveryNotificationArgs = {
  type: DeliveryNotificationType;
  recipient: NotificationRecipient;
  // The authoritative DeliveryEvent id (or an equally stable, already-
  // deterministic id such as a fixed handover-step event id) this
  // notification is DERIVED from — never invented, never client-supplied.
  eventId: string;
  title: string;
  message: string;
  orderId?: string | null;
  orderNumber?: string | null;
  sellerOrderId?: string | null;
  deliveryJobId?: string | null;
  now: Timestamp;
};

function sanitizeIdPart(v: string, max = 120): string {
  return v.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, max);
}

/** recipient + eventId + notificationType, as the spec's own conceptual key. */
function notificationDocId(recipient: NotificationRecipient, eventId: string, type: DeliveryNotificationType): string {
  return [
    "dn",
    sanitizeIdPart(recipient.role),
    sanitizeIdPart(recipient.userId),
    sanitizeIdPart(eventId),
    sanitizeIdPart(type),
  ].join("_").slice(0, 1500); // well under Firestore's 1500-byte doc-id limit
}

/**
 * Append one notification, derived from an authoritative delivery write
 * already happening in THIS transaction. Never throws — a failure here must
 * never abort the delivery mutation it is attached to (see module comment).
 */
export function emitDeliveryNotification(tx: Transaction, db: Firestore, args: EmitDeliveryNotificationArgs): void {
  try {
    if (!args.recipient.userId) return; // no known recipient — nothing safe to address
    const id = notificationDocId(args.recipient, args.eventId, args.type);
    const ref = db.collection("notifications").doc(id);
    tx.set(ref, {
      userId: args.recipient.userId,
      role: args.recipient.role,
      title: args.title,
      message: args.message,
      // Distinct from the existing "order" type value (placement/confirmation
      // notifications) so the two families remain visibly distinguishable —
      // no existing reader filters on `type`, so this changes nothing for them.
      type: "delivery",
      notificationType: args.type,
      read: false,
      createdAt: args.now,
      eventId: args.eventId,
      orderId: args.orderId ?? null,
      orderNumber: args.orderNumber ?? null,
      sellerOrderId: args.sellerOrderId ?? null,
      deliveryJobId: args.deliveryJobId ?? null,
    });
  } catch (err) {
    // Defence in depth: tx.set() itself practically never throws synchronously,
    // but this call site must NEVER be the reason a delivery transition fails.
    console.error(`delivery notification emit failed (non-fatal, type=${args.type}):`, err);
  }
}

/**
 * The customer's Firebase Auth uid for an order, for addressing a customer
 * notification. Read-only; a missing order/field degrades to null (skip the
 * customer notification) rather than throwing. MUST be called during the
 * transaction's READ phase (before any tx.set/tx.update in the same tx).
 */
export async function readCustomerUid(
  tx: Transaction,
  db: Firestore,
  orderId: string | null | undefined
): Promise<string | null> {
  if (!orderId) return null;
  try {
    const snap = await tx.get(db.collection("orders").doc(orderId));
    if (!snap.exists) return null;
    const uid = (snap.data() as { userId?: unknown }).userId;
    return typeof uid === "string" && uid ? uid : null;
  } catch (err) {
    console.error("readCustomerUid failed (non-fatal):", err);
    return null;
  }
}

export type HubPersonRecipient = { uid: string; personId: string };

/**
 * Every ACTIVE HUB_PERSON stationed at one specific hub, for HUB_TASK_ASSIGNED
 * fan-out (an origin/destination hub task is owned by "whichever hub person is
 * on duty," never a single named person — see hubIntake.ts's own comment on
 * this same rule). Equality-only filters (companyId/hubId/role) — Cloud
 * Firestore serves multi-field equality queries without a composite index.
 * Read-only; any failure degrades to an empty list (skip the fan-out) rather
 * than throwing. MUST be called during the transaction's READ phase.
 */
export async function readHubPersonRecipients(
  tx: Transaction,
  db: Firestore,
  companyId: string,
  hubId: string
): Promise<HubPersonRecipient[]> {
  try {
    const snap = await tx.get(
      db
        .collection("deliveryPersons")
        .where("companyId", "==", companyId)
        .where("hubId", "==", hubId)
        .where("role", "==", "HUB_PERSON")
    );
    const out: HubPersonRecipient[] = [];
    for (const d of snap.docs) {
      const p = d.data() as DeliveryPerson;
      const accountStatus = p.accountStatus ?? (p.status === "Inactive" ? "Suspended" : "Active");
      if (accountStatus !== "Active") continue;
      if (typeof p.uid === "string" && p.uid) out.push({ uid: p.uid, personId: d.id });
    }
    return out;
  } catch (err) {
    console.error("readHubPersonRecipients failed (non-fatal):", err);
    return [];
  }
}
