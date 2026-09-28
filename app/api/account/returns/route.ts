import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadAccountReturns } from "@/lib/account/accountServer";

// ---------------------------------------------------------------------------
// GET /api/account/returns — the customer's return & replacement requests
// (with the pickup slot YOMICO proposed, and whether they may confirm it or
// ask for another time), legacy whole-order returns, and every refund from all
// three sources — item returns, cancelled online orders and legacy returns —
// as one timeline.
//
// The customer is the verified token: no uid, email or customer id is read
// from the query string, headers or body. Only the customer's own documents
// are read and only the fixed fields of lib/account/accountViews are returned.
// Read-only: accepting or countering a pickup slot stays with
// app/api/item-request/respond. A blocked customer can still read.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-returns", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    return Response.json(await loadAccountReturns(getAdminDb(), requester));
  } catch (error) {
    console.error("account returns failed:", error);
    return Response.json({ error: "Could not load your returns and refunds." }, { status: 500 });
  }
}
