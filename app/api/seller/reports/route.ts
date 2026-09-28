import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import { parseReportRange } from "@/lib/sellerAnalytics/sellerAnalytics";
import { loadSellerReport } from "@/lib/sellerAnalytics/sellerAnalyticsServer";

// ---------------------------------------------------------------------------
// GET /api/seller/reports?from=YYYY-MM-DD&to=YYYY-MM-DD — the signed-in
// seller's order report (both dates optional, IST calendar days, inclusive).
//
// Each row is the allow-listed report row (lib/sellerAnalytics): order number,
// customer name, this seller's own line/unit count and item value, their own
// stage, payment method and date — never the customer's contact details, uid
// or email, another seller's items, or whole-order totals. Totals are computed
// here over EVERY order in range (cancelled orders listed, not counted), so the
// figures cannot drift from what the seller downloads.
//
// The seller is the verified token — no seller/vendor id is read from the
// request.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("seller-reports", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const params = new URL(request.url).searchParams;
    const range = parseReportRange(params.get("from"), params.get("to"));
    if ("error" in range) return Response.json({ error: range.error }, { status: 400 });

    const db = getAdminDb();
    const vendor = await findSellerVendor(db, requester.uid);
    if (vendor.kind === "none") {
      return Response.json({ error: "No seller account found for this login." }, { status: 403 });
    }
    if (vendor.kind === "duplicate") {
      return Response.json({ error: "Your seller account needs attention. Please contact support." }, { status: 409 });
    }

    return Response.json(await loadSellerReport(db, requester.uid, range));
  } catch (error) {
    console.error("seller report failed:", error);
    return Response.json({ error: "Could not load your report." }, { status: 500 });
  }
}
