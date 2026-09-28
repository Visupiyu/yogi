import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { countUnreadCustomerNotifications } from "@/lib/account/notificationServer";

// ---------------------------------------------------------------------------
// GET /api/account/notifications/unread-count — the header bell's badge. The
// bell polls this every 60 seconds (and when the window regains focus), well
// inside the 60-per-10-minutes limit. The customer is the verified token.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-notifications-unread", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    return Response.json({ unreadCount: await countUnreadCustomerNotifications(getAdminDb(), requester.uid) });
  } catch (error) {
    console.error("account unread count failed:", error);
    return Response.json({ error: "Could not load your notifications." }, { status: 500 });
  }
}
