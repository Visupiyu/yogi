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

export async function emitOrderPlacedNotifications(
  db: Firestore,
  params: {
    customerName: string;
    customerUid: string;
    orderTotal: number;
  }
): Promise<void> {
  const { customerName, customerUid, orderTotal } = params;

  // Admin. No userId by design — the admin feed queries on role alone.
  await db.collection("notifications").add({
    title: "🛒 New Order",
    message: `${customerName} placed an order worth ₹${orderTotal}`,
    type: "order",
    role: "admin",
    read: false,
    createdAt: Timestamp.now(),
  });

  // The seller notification that stood here has moved to
  // app/api/confirm-order (see lib/sellerOrderNotifications.ts).
  //
  // A new order is Pending until an admin confirms it, and firestore.rules
  // hides Pending orders from every seller read and query. Announcing one
  // here therefore told the seller about an order they are forbidden to open
  // — the notification bell was a side channel straight around that rule.
  //
  // Admin and customer notifications are unchanged: both are entitled to
  // know the moment the order exists.

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
