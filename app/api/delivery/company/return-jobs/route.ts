import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import {
  createOrAssignReturnJob,
  resolveReturnJobSnapshot,
  ReturnCollectionError,
} from "@/lib/deliveryEngine/returnCollection";

// POST /api/delivery/company/return-jobs   { returnRequestId, personId }
//
// A delivery company creates (or reassigns) a return-collection job, assigning
// ONE OF ITS OWN people — the company-actor path of the existing
// createOrAssignReturnJob (see returnCollection.ts), mirroring
// company/jobs/[jobId]/assign/route.ts's own convention for the forward-job
// equivalent. Company-only: resolveDeliveryActor must resolve role "company"
// (a company PERSON, e.g. a rider or hub person, resolves to role "person"
// and is rejected here — same distinction assign/route.ts already relies on).
//
// companyId is taken ONLY from the resolved actor, never from the request
// body — createOrAssignReturnJob's assertCompanyPerson then confirms the
// target personId actually belongs to that SAME company (403 otherwise), and
// assertRiderPerson refuses a HUB_PERSON as a return rider, exactly as it
// already does for a forward job's assignCompanyPerson. This route adds no
// authorization of its own beyond routing to the correct actorKind; the
// engine remains the sole source of truth for who may be assigned.
export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-company-return-assign", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "company")
      return Response.json({ error: "Only a delivery company can assign a return collection." }, { status: 403 });

    let body: { returnRequestId?: unknown; personId?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const returnRequestId = typeof body.returnRequestId === "string" ? body.returnRequestId.trim() : "";
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!returnRequestId) return Response.json({ error: "Missing returnRequestId." }, { status: 400 });
    if (!personId) return Response.json({ error: "Missing personId." }, { status: 400 });

    const db = getAdminDb();
    // Read OUTSIDE the transaction, per createOrAssignReturnJob's own contract.
    const snapshot = await resolveReturnJobSnapshot(db, returnRequestId);

    const result = await db.runTransaction((tx) =>
      createOrAssignReturnJob(tx, db, {
        returnRequestId,
        actorUid: actor.uid,
        actorKind: "company",
        actorCompanyId: actor.companyId,
        personId,
        snapshot,
      })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ReturnCollectionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("company return-job assign failed:", error);
    return Response.json({ error: "Could not assign this return collection." }, { status: 500 });
  }
}
