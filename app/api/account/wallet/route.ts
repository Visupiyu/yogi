import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadAccountWallet, parseWalletCursor } from "@/lib/account/accountServer";

// ---------------------------------------------------------------------------
// GET /api/account/wallet?cursor=N — the reward wallet: the authoritative
// balance (users.rewardPoints — what checkout actually spends), points not yet
// credited and why (lib/rewardCredit's own rule), and the signed history, 50
// entries a page. No lifetime totals: a sum over history could disagree with
// the real balance.
//
// The customer is the verified token: no uid, email or customer id is read
// from the query string, headers or body. Ledger ids are opaque (some embed
// another customer's uid). A blocked customer can still read.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-wallet", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const offset = parseWalletCursor(new URL(request.url).searchParams.get("cursor"));
    if (offset === null) return Response.json({ error: "Invalid cursor." }, { status: 400 });
    return Response.json(await loadAccountWallet(getAdminDb(), requester, offset));
  } catch (error) {
    console.error("account wallet failed:", error);
    return Response.json({ error: "Could not load your wallet." }, { status: 500 });
  }
}
