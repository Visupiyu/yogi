import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";

// GET /api/delivery/notifications
//
// Delivery Notification System V1 — the Delivery App's OWN authenticated read
// feed. The customer/seller web apps already have one (direct Firestore reads
// against the SAME `notifications` collection, scoped by firestore.rules —
// see components/NotificationBell.tsx / app/notifications/page.tsx); the
// mobile Delivery App has no Firestore client, so this route is its
// equivalent, scoped server-side instead of by security rules.
//
// Restricted to the CALLER'S OWN notifications: userId == this token's uid AND
// role == "delivery_person" — a delivery person can never read another
// person's, or a customer's/seller's, notification feed. No orderBy in the
// Firestore query (mirrors NotificationBell.tsx's own documented reason: it
// avoids requiring a composite index); results are sorted newest-first and
// capped in memory instead.
const MAX_RESULTS = 50;

export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-notifications-list", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "person")
    return Response.json({ error: "Only a delivery person has a notification feed here." }, { status: 403 });

  const db = getAdminDb();
  const snap = await db
    .collection("notifications")
    .where("userId", "==", requester.uid)
    .where("role", "==", "delivery_person")
    .get();

  const all = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      notificationType: typeof data.notificationType === "string" ? data.notificationType : null,
      title: typeof data.title === "string" ? data.title : "",
      message: typeof data.message === "string" ? data.message : "",
      read: data.read === true,
      createdAt: data.createdAt ?? null,
      orderId: typeof data.orderId === "string" ? data.orderId : null,
      orderNumber: typeof data.orderNumber === "string" ? data.orderNumber : null,
      sellerOrderId: typeof data.sellerOrderId === "string" ? data.sellerOrderId : null,
      deliveryJobId: typeof data.deliveryJobId === "string" ? data.deliveryJobId : null,
    };
  });

  const createdAtMillis = (v: unknown): number => {
    if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function") {
      try {
        return (v as { toMillis: () => number }).toMillis();
      } catch {
        return 0;
      }
    }
    return 0;
  };

  all.sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt));
  const notifications = all.slice(0, MAX_RESULTS);
  const unreadCount = all.filter((n) => !n.read).length;

  return Response.json({ notifications, unreadCount });
}
