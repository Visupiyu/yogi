import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadCustomerNotificationsPage } from "@/lib/account/notificationServer";
import { parseNotificationCursor } from "@/lib/account/notificationViews";

// ---------------------------------------------------------------------------
// GET /api/account/notifications?cursor=N — the signed-in customer's
// notification centre, 50 a page, newest first, plus their unread count.
//
// The customer is the verified token: no uid or email is read from the query,
// headers or body. Only notifications addressed to that uid with role
// "customer" are returned, as fixed fields (lib/account/notificationViews):
// opaque ids, server-derived links, no internal delivery/seller fields.
// A blocked customer can still read their notifications.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-notifications", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const offset = parseNotificationCursor(new URL(request.url).searchParams.get("cursor"));
    if (offset === null) return Response.json({ error: "Invalid cursor." }, { status: 400 });
    return Response.json(await loadCustomerNotificationsPage(getAdminDb(), requester.uid, offset));
  } catch (error) {
    console.error("account notifications failed:", error);
    return Response.json({ error: "Could not load your notifications." }, { status: 500 });
  }
}
