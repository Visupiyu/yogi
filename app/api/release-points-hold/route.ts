import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { releasePointsHold } from "@/lib/rewards/pointsHold";

// ---------------------------------------------------------------------------
// POST /api/release-points-hold — checkout calls this when the customer closes
// the payment window without paying, so their reserved points are usable again
// straight away instead of at the hold's expiry. Only the verified customer's
// own hold, and only the one bound to the Razorpay order named in the body, is
// released. A hold only reserves points — it never moves the balance — so the
// worst a forged call does is let a customer retry sooner. If that payment was
// in fact captured, finalisation still deducts what the balance can cover
// (lib/onlineOrder records any gap as rewardShortfall + needsReview).
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("release-points-hold", requester.uid, 30, 10 * 60 * 1000))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const body = (await request.json().catch(() => ({}))) as { razorpayOrderId?: unknown };
    const id = typeof body.razorpayOrderId === "string" ? body.razorpayOrderId.trim().slice(0, 100) : "";
    if (!id) return Response.json({ error: "Missing payment id." }, { status: 400 });
    const released = await releasePointsHold(getAdminDb(), requester.uid, id);
    return Response.json({ released });
  } catch (error) {
    console.error("release-points-hold failed:", error);
    return Response.json({ error: "Could not release your reward points." }, { status: 500 });
  }
}
