import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";

// POST /api/delivery/notifications/read-all
//
// Marks every CURRENTLY UNREAD notification belonging to the caller (userId
// == this token's uid AND role == "delivery_person") as read — mirrors the
// existing web bell's "Mark All Read" convenience (see
// components/NotificationBell.tsx), scoped server-side the same way GET
// /api/delivery/notifications is. Safe to call repeatedly (a no-op once
// nothing is unread).
export async function POST(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-notifications-read-all", requester.uid, 30, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "person")
    return Response.json({ error: "Only a delivery person has a notification feed here." }, { status: 403 });

  const db = getAdminDb();
  const snap = await db
    .collection("notifications")
    .where("userId", "==", requester.uid)
    .where("role", "==", "delivery_person")
    .where("read", "==", false)
    .get();

  if (snap.empty) return Response.json({ success: true, updated: 0 });

  const now = Timestamp.now();
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.set(doc.ref, { read: true, readAt: now }, { merge: true });
  }
  await batch.commit();

  return Response.json({ success: true, updated: snap.size });
}
