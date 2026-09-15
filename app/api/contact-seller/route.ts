import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { FieldValue } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Customer → Seller chat opener. SERVER-AUTHORITATIVE.
//
// The client previously created/queried the `chats` collection directly, but a
// customer query filtered only by orderId + sellerId cannot satisfy the chats
// read rule (which requires the caller be a participant), so Firestore rejected
// the whole query with "Missing or insufficient permissions." This route moves
// that logic server-side: it verifies (from the ID token) that the caller OWNS
// the order, then finds an existing chat or creates one with the Admin SDK
// (which is not subject to the client rules). The resulting chat carries
// customerId = the order's own userId, so the customer can then read it and its
// messages under the EXISTING chats/messages rules — no rule is weakened.
//
// Idempotent: an existing chat (legacy auto-id or the deterministic id below)
// is reused, so a double-tap / retry never creates a duplicate conversation.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "contact-seller",
        requester.uid,
        30,
        10 * 60 * 1000
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { orderId?: unknown; vendorId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const vendorIdIn =
      typeof body.vendorId === "string" ? body.vendorId.trim() : "";
    if (!orderId) {
      return Response.json({ error: "Missing order id." }, { status: 400 });
    }

    const db = getAdminDb();
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }
    const order = orderSnap.data() as Record<string, unknown>;

    // Ownership: the caller must own this order. Same wording as not-found so a
    // probe can't distinguish "someone else's order" from "no such order".
    if (order.userId !== requester.uid) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    const items = Array.isArray(order.items)
      ? (order.items as Record<string, unknown>[])
      : [];

    // Resolve which seller on this order to contact. If the client names a
    // vendor it MUST actually be on the order (never trusted blindly); otherwise
    // default to the first seller on the order — the existing single-button UX.
    let vendor: Record<string, unknown> | null = null;
    if (vendorIdIn) {
      vendor = items.find((it) => it?.vendorId === vendorIdIn) || null;
      if (!vendor) {
        return Response.json(
          { error: "That seller is not on this order." },
          { status: 400 }
        );
      }
    } else {
      vendor =
        items.find(
          (it) => typeof it?.vendorId === "string" && it.vendorId
        ) || null;
      if (!vendor) {
        return Response.json(
          { error: "No seller is associated with this order." },
          { status: 409 }
        );
      }
    }
    const vendorId = String(vendor.vendorId);

    // Reuse an existing conversation (legacy auto-id docs included).
    const existing = await db
      .collection("chats")
      .where("orderId", "==", orderId)
      .where("sellerId", "==", vendorId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return Response.json({ chatId: existing.docs[0].id });
    }

    // Otherwise create one with a deterministic id, so a retry is idempotent.
    const chatId = `${orderId}_${vendorId}`;
    const chatRef = db.collection("chats").doc(chatId);
    const pre = await chatRef.get();
    if (pre.exists) {
      return Response.json({ chatId });
    }

    const now = FieldValue.serverTimestamp();
    await chatRef.set({
      orderId,
      sellerId: vendorId,
      sellerName: typeof vendor.vendorName === "string" ? vendor.vendorName : "",
      customerId: order.userId,
      customerName:
        typeof order.customerName === "string" ? order.customerName : "",
      customerEmail: typeof order.userEmail === "string" ? order.userEmail : "",
      productId:
        vendor.id === undefined || vendor.id === null ? "" : String(vendor.id),
      productName: typeof vendor.name === "string" ? vendor.name : "",
      productImage: typeof vendor.image === "string" ? vendor.image : "",
      lastMessage: "Conversation started",
      lastSender: "system",
      sellerUnread: 0,
      customerUnread: 0,
      createdAt: now,
      lastMessageAt: now,
    });

    return Response.json({ chatId });
  } catch (error) {
    console.error("contact-seller: unexpected failure:", error);
    return Response.json(
      { error: "Could not open the chat. Please try again." },
      { status: 500 }
    );
  }
}
