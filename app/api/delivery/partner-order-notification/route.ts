import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";

// ---------------------------------------------------------------------------
// POST /api/delivery/partner-order-notification { orderId } — the legacy
// delivery-partner page (app/delivery/[id]) tells the customer their order's
// new status.
//
// That page used to write the customer's notification itself. firestore.rules
// now only let a browser notify its OWN feed (anyone could otherwise drop any
// text into any customer's feed), so it is written here instead:
//   - the caller must be the delivery partner ASSIGNED to the order (the same
//     test as firestore.rules' isAssignedDeliveryPartner);
//   - the message is built from the order's CURRENT stored status — nothing
//     the browser sends ends up in the customer's feed;
//   - one notification per (order, status): repeating the call is harmless.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("partner-order-notification", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    let body: { orderId?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!isValidDocId(orderId)) return Response.json({ error: "Order not found." }, { status: 404 });

    const db = getAdminDb();
    const orderSnap = await db.collection("orders").doc(orderId).get();
    const order = orderSnap.exists ? (orderSnap.data() as Record<string, unknown>) : null;
    const partnerId = typeof order?.deliveryPartnerId === "string" ? order.deliveryPartnerId : "";
    const partnerSnap = isValidDocId(partnerId) ? await db.collection("deliveryPartners").doc(partnerId).get() : null;
    if (!order || !partnerSnap?.exists || partnerSnap.get("uid") !== requester.uid) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    const status = typeof order.status === "string" ? order.status : "";
    const customerUid = typeof order.userId === "string" ? order.userId : "";
    if (!status || !customerUid) return Response.json({ success: true, notified: false });

    const ref = order.orderNumber;
    const label = typeof ref === "string" && ref ? ref : orderId.slice(0, 8);
    const statusKey = status.replace(/[^A-Za-z]/g, "") || "status";
    await db.collection("notifications").doc(`delivery_${orderId}_${statusKey}`).set({
      title: "Delivery Update",
      message: `Your order ${label} is now ${fulfilmentStageLabel(status)}.`,
      userId: customerUid,
      userEmail: typeof order.userEmail === "string" ? order.userEmail : "",
      role: "customer",
      type: "delivery",
      read: false,
      createdAt: Timestamp.now(),
    });
    return Response.json({ success: true, notified: true });
  } catch (error) {
    console.error("partner order notification failed:", error);
    return Response.json({ error: "Couldn't notify the customer." }, { status: 500 });
  }
}
