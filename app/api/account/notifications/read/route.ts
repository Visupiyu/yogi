import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { markCustomerNotificationsRead } from "@/lib/account/notificationServer";
import { parseMarkReadBody } from "@/lib/account/notificationViews";

// ---------------------------------------------------------------------------
// POST /api/account/notifications/read  { ids: [...opaque ids] } | { all: true }
//
// Marks the signed-in customer's OWN customer notifications read — one batch,
// only the `read` field. Ids are mapped back among the caller's own
// notifications, so an id belonging to someone else (or to nothing) changes
// nothing. A blocked customer may still mark their notifications read.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-notifications-read", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const body = await request.json().catch(() => null);
    const target = parseMarkReadBody(body);
    if (!target) {
      return Response.json({ error: "Send { ids: [...] } (1–100 notification ids) or { all: true }." }, { status: 400 });
    }
    const updated = await markCustomerNotificationsRead(getAdminDb(), requester.uid, target);
    return Response.json({ updated });
  } catch (error) {
    console.error("account mark-read failed:", error);
    return Response.json({ error: "Could not update your notifications." }, { status: 500 });
  }
}
