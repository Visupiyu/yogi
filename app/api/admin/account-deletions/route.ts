import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { listDeletionRequests } from "@/lib/account/deletionServer";

// ---------------------------------------------------------------------------
// GET /api/admin/account-deletions?status=open|all — customer account
// deletion requests for an admin to process, each with a snapshot of the
// account (orders, open orders, open returns, refunds due, reward balance) to
// decide on. Admin only (verified admin token).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("admin-account-deletions", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const raw = new URL(request.url).searchParams.get("status");
    const filter = raw === "all" ? "all" : raw === null || raw === "open" ? "open" : null;
    if (!filter) return Response.json({ error: "status must be open or all." }, { status: 400 });
    return Response.json({ requests: await listDeletionRequests(getAdminDb(), filter) });
  } catch (error) {
    console.error("admin account deletions list failed:", error);
    return Response.json({ error: "Could not load deletion requests." }, { status: 500 });
  }
}
