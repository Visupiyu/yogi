import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

// Server-side emission of the "order placed" notification set.
//
// These were written by the BROWSER (app/checkout/page.tsx). That forced
// firestore.rules to let any signed-in client create role:"admin"
// notifications, which meant a customer could put arbitrary text into the
// admin's feed — the admin bell is the one audience not scoped by userId.
//
// Payloads are byte-identical to what the browser and lib/onlineOrder.ts
// already produced, so every existing reader query
// (userId + role == 'customer' / 'seller', role == 'admin') keeps matching.
// Nothing here is read from a request body: the caller passes values it has
// already derived from the order document it just wrote.

export type OrderNotificationItem = {
  vendorId?: string | null;
  name?: string | null;
};

export async function emitOrderPlacedNotifications(
  db: Firestore,
  params: {
    customerName: string;
    customerUid: string;
    orderTotal: number;
    items: OrderNotificationItem[];
  }
): Promise<void> {
  const { customerName, customerUid, orderTotal, items } = params;

  // Admin. No userId by design — the admin feed queries on role alone.
  await db.collection("notifications").add({
    title: "🛒 New Order",
    message: `${customerName} placed an order worth ₹${orderTotal}`,
    type: "order",
    role: "admin",
    read: false,
    createdAt: Timestamp.now(),
  });

  // One per vendor line, addressed to that vendor. Cross-user by design: the
  // customer's order is what the seller needs to be told about.
  for (const item of items || []) {
    if (!item?.vendorId) continue;

    await db.collection("notifications").add({
      userId: item.vendorId,
      role: "seller",
      title: "🛒 New Order",
      message: `${customerName} ordered ${item.name || "an item"}`,
      type: "order",
      read: false,
      createdAt: Timestamp.now(),
    });
  }

  // Customer's own confirmation.
  await db.collection("notifications").add({
    userId: customerUid,
    role: "customer",
    title: "✅ Order Placed",
    message: `Your order worth ₹${orderTotal} has been placed successfully.`,
    type: "order",
    read: false,
    createdAt: Timestamp.now(),
  });
}
