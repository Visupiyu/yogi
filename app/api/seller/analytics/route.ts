import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import { loadSellerAnalytics } from "@/lib/sellerAnalytics/sellerAnalyticsServer";

// ---------------------------------------------------------------------------
// GET /api/seller/analytics — the signed-in seller's dashboard and analytics
// figures, aggregated on the server (lib/sellerAnalytics):
//   - own products as counts, inventory health and an allow-listed restock
//     list (never other sellers' products, never whole product documents);
//   - own orders as stage counts, booked sales, units, best sellers, a monthly
//     trend and the five most recent (own item value only, customer name only);
//   - settlement: lib/vendorPayable's breakdown, the one money calculation.
//
// The seller is the verified token — no seller/vendor id is read from the
// request. A seller whose account is not Approved still sees only their own
// figures (read-only), exactly as with app/api/seller/orders.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("seller-analytics", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const db = getAdminDb();
    const vendor = await findSellerVendor(db, requester.uid);
    if (vendor.kind === "none") {
      return Response.json({ error: "No seller account found for this login." }, { status: 403 });
    }
    if (vendor.kind === "duplicate") {
      return Response.json({ error: "Your seller account needs attention. Please contact support." }, { status: 409 });
    }

    return Response.json(await loadSellerAnalytics(db, requester.uid));
  } catch (error) {
    console.error("seller analytics failed:", error);
    return Response.json({ error: "Could not load your analytics." }, { status: 500 });
  }
}
