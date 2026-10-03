import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isRewardsEligible } from "@/lib/rewards/eligibility";
import { activeHeldPoints, spendablePoints } from "@/lib/rewards/redemption";

// ---------------------------------------------------------------------------
// GET /api/account/reward-redemption — what checkout may show for points:
// whether the customer is Rewards-eligible, their balance, and how many points
// are spendable right now (balance less points reserved by an unpaid online
// payment). DISPLAY ONLY: /api/place-order and /api/create-order re-derive all
// of it and never read a balance or amount from the browser.
//
// The customer is the verified token; nothing is read from the query or body.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("reward-redemption", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const db = getAdminDb();
    const [userSnap, holdSnap] = await Promise.all([
      db.collection("users").doc(requester.uid).get(),
      db.collection("pointsHolds").doc(requester.uid).get(),
    ]);
    const user = userSnap.exists ? userSnap.data() : null;
    const held = activeHeldPoints(holdSnap.exists ? holdSnap.data() : null, Date.now());
    return Response.json({
      eligible: isRewardsEligible(user),
      balance: spendablePoints(user?.rewardPoints, 0),
      held,
      spendable: spendablePoints(user?.rewardPoints, held),
    });
  } catch (error) {
    console.error("reward-redemption failed:", error);
    return Response.json({ error: "Could not load your reward points." }, { status: 500 });
  }
}
