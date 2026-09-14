import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// GET /api/delivery/company/jobs
//
// The calling company's own delivery jobs (offered to it or assigned to its
// people). Company-only; scoped to the caller's companyId, never any other
// company's jobs. Single-field query (companyId ==) so no composite index is
// needed; ordered client-side. No money data (none exists on a job).
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-jobs", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company")
    return Response.json({ error: "Only a delivery company can view its jobs." }, { status: 403 });

  const snap = await getAdminDb()
    .collection("deliveryJobs")
    .where("companyId", "==", actor.companyId)
    .get();

  const jobs = snap.docs
    .map((d) => {
      const job = d.data() as DeliveryJob;
      return {
        id: d.id,
        orderNumber: job.orderNumber,
        vendorName: job.vendorName,
        shipmentNumber: job.shipmentNumber,
        status: job.status,
        currentStage: job.currentStage,
        assignedPersonId: job.assignedPersonId ?? null,
        assignedPersonName: job.assignedPersonName ?? null,
        drop: { area: "", slot: job.drop?.slot ?? null }, // minimal until a person is assigned
        parcel: job.parcel,
        updatedAt: job.updatedAt ?? null,
      };
    })
    .sort((a, b) => {
      const at = (a.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      const bt = (b.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      return bt - at;
    });

  return Response.json({ companyId: actor.companyId, jobs });
}
