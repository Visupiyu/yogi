import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  recordOversightException,
  resolveException,
  ExecutionError,
  type OversightActor,
} from "@/lib/deliveryEngine/execution";
import type { DeliveryExceptionCode } from "@/lib/deliveryEngine/types";

// POST /api/delivery/jobs/[jobId]/legs/[legId]/exception
//   { action: "record" | "resolve", code?, notes?, resolution? }
//
// Oversight exception recording/resolution. Authorized for YOMICO Admin (any
// job), a company (its own jobs), or the holding/assigned person (their leg).
// The scan endpoint handles a person's in-flight execution exceptions; this
// covers oversight and resolution. No status/custody change; no business
// remediation policy is invented (decision M6).
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string; legId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-exception", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Resolve the caller into an oversight actor (admin | company | person).
    let actor: OversightActor;
    if (requester.isAdmin) {
      actor = { uid: requester.uid, role: "admin" };
    } else {
      const da = await resolveDeliveryActor(requester.uid, requester.email);
      if (da.role === "company") actor = { uid: requester.uid, role: "company", companyId: da.companyId };
      else if (da.role === "person") actor = { uid: requester.uid, role: "person", personId: da.personId, companyId: da.companyId };
      else return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { jobId, legId } = await ctx.params;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const action = typeof body.action === "string" ? body.action : "record";

    const db = getAdminDb();
    if (action === "resolve") {
      const resolution = typeof body.resolution === "string" ? body.resolution : null;
      const result = await db.runTransaction((tx) =>
        resolveException(tx, db, { jobId, legId, actor, resolution })
      );
      return Response.json({ success: true, ...result });
    }

    const code = typeof body.code === "string" ? body.code : "";
    if (!code) return Response.json({ error: "Missing exception code." }, { status: 400 });
    const notes = typeof body.notes === "string" ? body.notes : null;
    const result = await db.runTransaction((tx) =>
      recordOversightException(tx, db, { jobId, legId, actor, code: code as DeliveryExceptionCode, notes })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("delivery exception failed:", error);
    return Response.json({ error: "Could not record this exception." }, { status: 500 });
  }
}
