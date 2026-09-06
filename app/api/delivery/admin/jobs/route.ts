import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildAdminJobRow, type AdminJobRow } from "@/lib/deliveryEngine/adminProjections";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// GET /api/delivery/admin/jobs[?limit=N]
//
// Control Tower job list. Admin only. Recent-first (orderBy updatedAt desc),
// simple limit-based paging (default 50, max 200). Explicit allow-list rows
// (buildAdminJobRow) — raw job objects are never returned; no scanToken,
// deliveryOtp, raw geo, drop address/phone, or parcel prices.
//
// orderBy(updatedAt desc) uses Firestore's automatic single-field index; no
// composite index is added. Status filters are intentionally not offered yet
// (they would require a composite index) — see the 2B-5B design note.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-jobs", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 50;

  const snap = await getAdminDb()
    .collection("deliveryJobs")
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .get();

  const jobs: AdminJobRow[] = snap.docs.map((d) => buildAdminJobRow(d.id, d.data() as DeliveryJob));
  return Response.json({ jobs, count: jobs.length, limit });
}
