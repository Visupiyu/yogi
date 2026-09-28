import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { decideDeletionRequest } from "@/lib/account/deletionServer";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";
import { MAX_CUSTOMER_MESSAGE, MAX_INTERNAL_NOTE, optionalText } from "@/lib/account/deletionRequests";

// ---------------------------------------------------------------------------
// POST /api/admin/account-deletions/[uid]
//   { status: "in_review" | "completed" | "rejected", customerMessage?, internalNote? }
//
// An admin records a decision on a customer's deletion request. "completed"
// means the admin has FINISHED the manual steps outside this app — this route
// deletes nothing and blocks nothing. Every decision writes audit_logs and
// tells the customer. Admin only (verified admin token).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("admin-account-deletions", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const { uid } = await params;
    if (!isValidDocId(uid)) return Response.json({ error: "Request not found." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { status?: unknown; customerMessage?: unknown; internalNote?: unknown } | null;
    const status = body?.status;
    if (status !== "in_review" && status !== "completed" && status !== "rejected") {
      return Response.json({ error: "status must be in_review, completed or rejected." }, { status: 400 });
    }
    const customerMessage = optionalText(body?.customerMessage, MAX_CUSTOMER_MESSAGE);
    const internalNote = optionalText(body?.internalNote, MAX_INTERNAL_NOTE);
    if (!customerMessage.ok || !internalNote.ok) {
      return Response.json({ error: `Message up to ${MAX_CUSTOMER_MESSAGE} and note up to ${MAX_INTERNAL_NOTE} characters.` }, { status: 400 });
    }
    if (status === "rejected" && !customerMessage.value) {
      return Response.json({ error: "Tell the customer why the request was not approved." }, { status: 400 });
    }

    const outcome = await decideDeletionRequest(getAdminDb(), requester, uid, status, customerMessage.value, internalNote.value);
    if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
    return Response.json({ success: true, status: outcome.status });
  } catch (error) {
    console.error("admin account deletion decision failed:", error);
    return Response.json({ error: "Could not update the request." }, { status: 500 });
  }
}
