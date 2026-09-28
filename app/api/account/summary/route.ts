import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadAccountSummary } from "@/lib/account/accountServer";

// ---------------------------------------------------------------------------
// GET /api/account/summary — the account dashboard in one call: profile,
// actions waiting on the customer, order counts and the three newest order
// cards (by order number), open returns, reward balance and pending points,
// referral code, unread notifications and saved addresses.
//
// The customer is the verified token: no uid, email or customer id is read
// from the query string, headers or body. Only the customer's own documents
// are read (lib/account/accountServer) and only the fixed fields of
// lib/account/accountViews are returned — never a whole document. A blocked
// customer can still READ their own account (every write path keeps its own
// blocked-customer check).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-summary", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    return Response.json(await loadAccountSummary(getAdminDb(), requester));
  } catch (error) {
    console.error("account summary failed:", error);
    return Response.json({ error: "Could not load your account." }, { status: 500 });
  }
}
