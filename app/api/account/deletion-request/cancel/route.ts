import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { cancelDeletionRequest } from "@/lib/account/deletionServer";

// ---------------------------------------------------------------------------
// POST /api/account/deletion-request/cancel — withdraw the signed-in
// customer's OWN deletion request while it is still pending or in review.
// The customer is the verified token; there is no request id to supply, so
// nobody can cancel someone else's request.
// ---------------------------------------------------------------------------

const WRITE_LIMIT_MAX = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-deletion-write", requester.uid, WRITE_LIMIT_MAX, WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const outcome = await cancelDeletionRequest(getAdminDb(), requester.uid);
    if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
    return Response.json({ request: outcome.request });
  } catch (error) {
    console.error("account deletion cancel failed:", error);
    return Response.json({ error: "Could not cancel your request." }, { status: 500 });
  }
}
