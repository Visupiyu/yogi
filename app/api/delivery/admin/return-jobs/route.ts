import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildAdminReturnJobRow, type AdminReturnJobRow } from "@/lib/deliveryEngine/adminProjections";

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
