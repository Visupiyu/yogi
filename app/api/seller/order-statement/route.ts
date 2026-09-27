import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadVendorOrderStatementInputs } from "@/lib/vendorPayableServer";
import { buildSellerOrderStatement } from "@/lib/sellerOrderStatement";

// ---------------------------------------------------------------------------
// GET /api/seller/order-statement?orderId=… — the signed-in seller's
// settlement statement for ONE order.
//
// Identity is the verified token only: any vendorId / sellerId in the request
// is ignored, so a seller can only ever get their OWN figures, and only for an
// order that carries their items and is visible to them (not Pending). Every
// rupee comes from lib/vendorPayable's computeVendorEarningsBreakdown via
// lib/sellerOrderStatement — no second formula. The response carries this
// seller's figures and the order's own headline fields only: no other
// seller's items or figures, and no customer contact details.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "seller-order-statement",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    const orderId = new URL(request.url).searchParams.get("orderId")?.trim() || "";
    // Also refuse ids Firestore reserves ("." / ".." / __name__-style), which
    // would otherwise reach the database and fail as a 500.
    if (
      !orderId ||
      orderId.includes("/") ||
      orderId.length > 200 ||
      orderId === "." ||
      orderId === ".." ||
      /^__.*__$/.test(orderId)
    ) {
      return Response.json({ error: "Missing order id." }, { status: 400 });
    }

    const inputs = await loadVendorOrderStatementInputs(getAdminDb(), requester.uid, orderId);
    if (!inputs) {
      // Same answer for "no such order" and "not your order", so the route
      // cannot be used to probe other sellers' orders.
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    const statement = buildSellerOrderStatement({ vendorUid: requester.uid, ...inputs });
    return Response.json({ statement });
  } catch (error) {
    console.error("seller-order-statement failed:", error);
    return Response.json(
      { error: "Could not load the settlement statement." },
      { status: 500 }
    );
  }
}
