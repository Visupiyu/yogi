import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadAccountReferrals } from "@/lib/account/accountServer";

// ---------------------------------------------------------------------------
// GET /api/account/referrals — the customer's referral code, the bonus rules
// and this month's cap, and their referral history. Friends are ANONYMOUS
// ("A friend", their join date, whether the bonus is paid) — never another
// customer's name, email or uid. A missing code is issued by POST
// /api/signup-rewards (server-controlled); this GET never writes.
//
// The customer is the verified token: no uid, email or customer id is read
// from the query string, headers or body. A blocked customer can still read.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-referrals", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    return Response.json(await loadAccountReferrals(getAdminDb(), requester));
  } catch (error) {
    console.error("account referrals failed:", error);
    return Response.json({ error: "Could not load your referrals." }, { status: 500 });
  }
}
