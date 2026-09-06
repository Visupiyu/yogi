import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  assignYomicoPerson,
  AssignmentError,
} from "@/lib/deliveryEngine/assignment";

// POST /api/delivery/jobs/[jobId]/assign-yomico   { personId }
//
// YOMICO Admin assigns (or reassigns) a YOMICO delivery person to a job's
// current leg. Admin-only. The target person must be a YOMICO person that is
// Active and Available (validated inside the transaction). Also used to switch
// a job away from a company back to YOMICO -- any previously-assigned person is
// freed (removal, never selecting a company person). Idempotent.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("delivery-assign-yomico", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const { jobId } = await ctx.params;
    let body: { personId?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) return Response.json({ error: "Missing personId." }, { status: 400 });

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      assignYomicoPerson(tx, db, { jobId, personId, adminUid: requester.uid })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("assign-yomico failed:", error);
    return Response.json({ error: "Could not assign this delivery person." }, { status: 500 });
  }
}
