import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { vendorsOnOrder } from "@/lib/sellerOrderRecord";
import { fulfilmentStageLabel } from "@/lib/itemFulfilment";
import { isValidOrderId } from "@/lib/sellerOrders/sellerOrderViewServer";

// ---------------------------------------------------------------------------
// POST /api/seller/orders/[orderId]/shipping
//   { trackingNumber?, courierPartner?, dispatchDate?, expectedDelivery?, sellerNotes? }
//
// The seller's shipping details for THEIR shipment, saved on the server.
// Sellers no longer read or write orders/{id} from the browser
// (firestore.rules), and no longer hold the customer's uid, so the details —
// and the customer's "order updated" notification — are written here:
//
//   - always on the seller's own sellerOrders record;
//   - on the shared order document only when this seller is its ONLY seller
//     and it is not yet Delivered (what a single-seller customer's order shows);
//     on a multi-seller order one seller never overwrites another's tracking.
//
// Only these five text fields are accepted — never status, payment, money,
// delivery or identity. The seller is the verified token and must be on the
// order and admin-Approved; a Pending or Cancelled order refuses.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const FIELDS: Record<string, number> = {
  trackingNumber: 100,
  courierPartner: 100,
  dispatchDate: 40,
  expectedDelivery: 40,
  sellerNotes: 1000,
};

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request, ctx: { params: Promise<{ orderId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return bad("Please sign in.", 401);
    if (!(await isWithinRateLimit("seller-order-shipping", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return bad("Too many requests. Please try again shortly.", 429);
    }

    const { orderId } = await ctx.params;
    if (!isValidOrderId(orderId)) return bad("Order not found.", 404);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid request body.");
    const input = body as Record<string, unknown>;
    const unknown = Object.keys(input).filter((k) => !(k in FIELDS));
    if (unknown.length) return bad(`These fields can't be changed here: ${unknown.join(", ")}`);
    const changes: Record<string, string> = {};
    for (const [field, max] of Object.entries(FIELDS)) {
      if (!(field in input)) continue;
      const v = input[field];
      if (typeof v !== "string") return bad(`${field} must be text.`);
      const clean = v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
      if (clean.length > max) return bad(`${field} must be at most ${max} characters.`);
      changes[field] = clean;
    }
    if (Object.keys(changes).length === 0) return bad("Nothing to update.");

    const db = getAdminDb();
    const uid = requester.uid;
    const vendorSnap = await db.collection("vendors").where("uid", "==", uid).limit(1).get();
    if (vendorSnap.empty || vendorSnap.docs[0].data()?.status !== "Approved") {
      return bad("Your seller account is not approved to update orders.", 403);
    }

    const orderRef = db.collection("orders").doc(orderId);
    const recordRef = db.collection("sellerOrders").doc(`${orderId}_${uid}`);

    type Outcome =
      | { kind: "error"; status: number; error: string }
      | { kind: "unchanged" }
      | { kind: "saved"; mirroredToOrder: boolean };

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      const [orderSnap, recordSnap] = await Promise.all([tx.get(orderRef), tx.get(recordRef)]);
      const order = (orderSnap.data() || {}) as Record<string, unknown>;
      // Not found, not this seller's, or still Pending: the same 404.
      if (
        !orderSnap.exists ||
        !recordSnap.exists ||
        !vendorsOnOrder(order as never).includes(uid) ||
        order.status === "Pending"
      ) {
        return { kind: "error", status: 404, error: "Order not found." };
      }
      if (order.status === "Cancelled") {
        return { kind: "error", status: 409, error: "This order was cancelled." };
      }
      const record = recordSnap.data() || {};
      const actual = Object.fromEntries(
        Object.entries(changes).filter(([k, v]) => (typeof record[k] === "string" ? record[k] : "") !== v)
      );
      if (Object.keys(actual).length === 0) return { kind: "unchanged" };

      const now = Timestamp.now();
      tx.update(recordRef, { ...actual, updatedAt: now });
      const soleSeller = vendorsOnOrder(order as never).length === 1;
      const mirroredToOrder = soleSeller && order.status !== "Delivered";
      if (mirroredToOrder) tx.update(orderRef, { ...actual, updatedAt: now });

      if (typeof order.userId === "string" && order.userId) {
        const number = typeof order.orderNumber === "string" && order.orderNumber ? order.orderNumber : orderId.slice(0, 8);
        tx.set(db.collection("notifications").doc(), {
          title: "Order Status Updated",
          message: `Your order ${number} is now ${fulfilmentStageLabel(String(order.status || ""))}`,
          userId: order.userId,
          ...(typeof order.userEmail === "string" ? { userEmail: order.userEmail } : {}),
          role: "customer",
          type: "shipping",
          read: false,
          createdAt: now,
        });
      }
      return { kind: "saved", mirroredToOrder };
    });

    if (outcome.kind === "error") return bad(outcome.error, outcome.status);
    if (outcome.kind === "unchanged") return Response.json({ success: true, unchanged: true });
    return Response.json({ success: true, mirroredToOrder: outcome.mirroredToOrder });
  } catch (error) {
    console.error("seller order shipping update failed:", error);
    return bad("Could not save the shipping details.", 500);
  }
}
