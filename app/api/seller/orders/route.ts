import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { listSellerOrders } from "@/lib/sellerOrders/sellerOrderViewServer";

// ---------------------------------------------------------------------------
// GET /api/seller/orders?limit=N — the signed-in seller's orders, newest first,
// each as the allow-listed seller summary (lib/sellerOrders/sellerOrderView):
// only this seller's own lines, fulfilment and item value; customer name only;
// never another seller's items, ids or money, whole-order totals, payment
// references or internal fields.
//
// The seller is the verified token — no seller/vendor id is read from the
// request. Backs the seller orders list, dashboard, reports, analytics and
// onboarding checklist, which no longer read orders/{id} directly.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("seller-orders-list", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const raw = new URL(request.url).searchParams.get("limit");
    let limit = DEFAULT_LIMIT;
    if (raw !== null) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
        return Response.json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` }, { status: 400 });
      }
      limit = n;
    }

    const db = getAdminDb();
    const vendorSnap = await db.collection("vendors").where("uid", "==", requester.uid).limit(1).get();
    if (vendorSnap.empty) {
      return Response.json({ error: "No seller account found for this login." }, { status: 403 });
    }

    const orders = await listSellerOrders(db, requester.uid, limit);
    return Response.json({ orders });
  } catch (error) {
    console.error("seller orders list failed:", error);
    return Response.json({ error: "Could not load your orders." }, { status: 500 });
  }
}
