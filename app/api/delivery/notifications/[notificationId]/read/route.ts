import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";

// POST /api/delivery/notifications/[notificationId]/read
//
// Marks exactly ONE of the CALLER'S OWN delivery-person notifications read.
// Ownership is re-checked against the authoritative document (userId == this
// token's uid AND role == "delivery_person") — never trusted from the URL
// alone — so a person can never mark, or even discover the existence of,
// another user's notification. Idempotent: marking an already-read
// notification read again is a safe no-op.
export async function POST(request: Request, ctx: { params: Promise<{ notificationId: string }> }) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-notifications-read", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "person")
    return Response.json({ error: "Only a delivery person has a notification feed here." }, { status: 403 });

  const { notificationId } = await ctx.params;
  const db = getAdminDb();
  const ref = db.collection("notifications").doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Notification not found." }, { status: 404 });
  const data = snap.data() as { userId?: unknown; role?: unknown };
  if (data.userId !== requester.uid || data.role !== "delivery_person") {
    // Same response for "not yours" as "not found" — never confirm another
    // user's notification exists.
    return Response.json({ error: "Notification not found." }, { status: 404 });
  }

  await ref.set({ read: true, readAt: Timestamp.now() }, { merge: true });
  return Response.json({ success: true, id: notificationId });
}
