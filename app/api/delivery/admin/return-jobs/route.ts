import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildAdminReturnJobRow, type AdminReturnJobRow } from "@/lib/deliveryEngine/adminProjections";
import {
  createOrAssignReturnJob,
  resolveReturnJobSnapshot,
  ReturnCollectionError,
} from "@/lib/deliveryEngine/returnCollection";

// GET /api/delivery/admin/return-jobs[?limit=N]
//
// Admin Operations V1 — Control Tower's return-collection list. Admin only.
// Reads the SEPARATE `returnCollectionJobs` collection (see
// lib/deliveryEngine/returnCollection.ts) — never the forward `deliveryJobs`
// collection — so a return-collection job is never mixed into, or mistaken
// for, a forward-delivery row. Recent-first, simple limit-based paging
// (default 50, max 200), matching /api/delivery/admin/jobs's own convention.
// Explicit allow-list row (buildAdminReturnJobRow) — the raw document is
// never returned.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-return-jobs", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 50;

  const snap = await getAdminDb()
    .collection("returnCollectionJobs")
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .get();

  const jobs: AdminReturnJobRow[] = snap.docs.map((d) => buildAdminReturnJobRow(d.id, d.data()));
  return Response.json({ jobs, count: jobs.length, limit });
}

// POST /api/delivery/admin/return-jobs   { returnRequestId, personId }
//
// YOMICO Admin creates (or reassigns) a return-collection job, assigning ONE
// of ITS OWN YOMICO delivery persons — the admin-actor path of the existing
// createOrAssignReturnJob (see returnCollection.ts). Admin-only, same
// requester.isAdmin gate every other admin-only assignment route in this API
// uses (e.g. assign-yomico/route.ts) — never resolveDeliveryActor, which has
// no "admin" role of its own.
//
// createOrAssignReturnJob ALREADY enforces everything this route must not
// bypass: the return must be at itemRequests status PICKUP_ASSIGNED, the
// target person must be assertYomicoPerson + assertPersonAssignable (Active,
// not Offline) + assertRiderPerson (never a HUB_PERSON — the four-actor
// invariant this engine reuses verbatim), and the whole thing is idempotent
// by the deterministic return-job id. This route adds NOTHING to that
// authorization; it only resolves the ReturnJobSnapshot the function's own
// contract says the CALLER must supply (read outside the transaction — see
// resolveReturnJobSnapshot) and passes the admin's own uid through.
export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("delivery-admin-return-assign", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

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
        actorUid: requester.uid,
        actorKind: "admin",
        actorCompanyId: null,
        personId,
        snapshot,
      })
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ReturnCollectionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("admin return-job assign failed:", error);
    return Response.json({ error: "Could not assign this return collection." }, { status: 500 });
  }
}
