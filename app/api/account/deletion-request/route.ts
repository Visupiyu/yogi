import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { createDeletionRequest, loadOwnDeletionRequest } from "@/lib/account/deletionServer";
import { MAX_DELETION_REASON, optionalText } from "@/lib/account/deletionRequests";

// ---------------------------------------------------------------------------
// /api/account/deletion-request — the signed-in customer's OWN account
// deletion request.
//
// GET   { request, canRequest }
// POST  { confirm: true, reason? } -> 201 { request }; 409 when a request is
//       already open (or was completed).
//
// A REQUEST for an admin to process by hand. Nothing is deleted or blocked
// automatically — not the sign-in account, orders, invoices/GST, payments,
// refunds or reward records. The customer is the verified token; a blocked
// customer may still request (like a support ticket).
// ---------------------------------------------------------------------------

const READ_LIMIT_MAX = 60;
const WRITE_LIMIT_MAX = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-deletion-read", requester.uid, READ_LIMIT_MAX, WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    return Response.json(await loadOwnDeletionRequest(getAdminDb(), requester.uid));
  } catch (error) {
    console.error("account deletion read failed:", error);
    return Response.json({ error: "Could not load your request." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("account-deletion-write", requester.uid, WRITE_LIMIT_MAX, WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const body = (await request.json().catch(() => null)) as { confirm?: unknown; reason?: unknown } | null;
    if (!body || body.confirm !== true) {
      return Response.json({ error: "Please confirm that you want to request account deletion." }, { status: 400 });
    }
    const reason = optionalText(body.reason, MAX_DELETION_REASON);
    if (!reason.ok) return Response.json({ error: `The reason can be up to ${MAX_DELETION_REASON} characters.` }, { status: 400 });

    const outcome = await createDeletionRequest(getAdminDb(), requester, reason.value || "");
    if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
    return Response.json({ request: outcome.request }, { status: 201 });
  } catch (error) {
    console.error("account deletion request failed:", error);
    return Response.json({ error: "Could not submit your request." }, { status: 500 });
  }
}
