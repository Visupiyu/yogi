import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadSellerOrderDetail } from "@/lib/sellerOrders/sellerOrderViewServer";

// ---------------------------------------------------------------------------
// GET /api/seller/orders/[orderId] — one order as the signed-in seller may see
// it (lib/sellerOrders/sellerOrderView, allow-listed): their own lines and
// fulfilment, their own item value, the customer's name / phone / delivery
// address, payment method and status, and their own shipping details.
//
// The seller is the verified token; the path only names WHICH order. An
// unknown order, an order this seller has no items on, and a still-Pending
// order all answer the same 404, so order ids can't be probed.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 240;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request, ctx: { params: Promise<{ orderId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("seller-order-view", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const { orderId } = await ctx.params;
    const order = await loadSellerOrderDetail(getAdminDb(), requester.uid, typeof orderId === "string" ? orderId : "");
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    return Response.json({ order });
  } catch (error) {
    console.error("seller order view failed:", error);
    return Response.json({ error: "Could not load this order." }, { status: 500 });
  }
}
