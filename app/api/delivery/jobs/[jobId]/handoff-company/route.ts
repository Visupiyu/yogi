import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  handoffToCompany,
  AssignmentError,
} from "@/lib/deliveryEngine/assignment";

// POST /api/delivery/jobs/[jobId]/handoff-company   { companyId }
//
// YOMICO Admin hands a job off to an Active delivery company. Admin-only. Admin
// picks ONLY the company -- never a company person; the company assigns its own
// person afterwards. Any previously-assigned person (a YOMICO person, or a
// company person on a company switch) is freed (removal, not selection).
// Idempotent when the job is already offered to the same company with no person.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("delivery-handoff-company", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const { jobId } = await ctx.params;
    let body: { companyId?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (!companyId) return Response.json({ error: "Missing companyId." }, { status: 400 });

    const db = getAdminDb();
    const result = await db.runTransaction((tx) =>
      handoffToCompany(tx, db, { jobId, companyId, adminUid: requester.uid })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("handoff-company failed:", error);
    return Response.json({ error: "Could not hand this job to the company." }, { status: 500 });
  }
}
