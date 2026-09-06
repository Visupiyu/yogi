import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// GET /api/delivery/my-jobs
//
// The authenticated delivery person's own work queue (jobs whose current leg is
// assigned to them). Person-only, scoped strictly to the caller's personId.
// Single-field query (assignedPersonId ==) so no composite index is required;
// filtered/sorted client-side here.
//
// The person needs the customer's address/phone to deliver, so drop is
// returned; the scanToken is NEVER returned (only the dedicated QR endpoint
// exposes it).
const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  "AssignedToYomico", "AssignedToCompany", "InProgress",
]);

export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-my-jobs", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "person")
    return Response.json({ error: "Only a delivery person has a job queue." }, { status: 403 });

  const snap = await getAdminDb()
    .collection("deliveryJobs")
    .where("assignedPersonId", "==", actor.personId)
    .get();

  const jobs = snap.docs
    .map((d) => {
      const job = d.data() as DeliveryJob;
      return {
        id: d.id,
        orderNumber: job.orderNumber,
        vendorName: job.vendorName,
        shipmentNumber: job.shipmentNumber, // display only; NOT the scanToken
        status: job.status,
        currentStage: job.currentStage,
        currentLegId: job.currentLegId ?? null,
        custody: job.custody ?? null,
        pickup: job.pickup,
        drop: job.drop, // needed to perform the delivery
        parcel: job.parcel,
        updatedAt: job.updatedAt ?? null,
      };
    })
    .filter((j) => ACTIVE_STATUSES.has(j.status))
    .sort((a, b) => {
      const at = (a.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      const bt = (b.updatedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      return bt - at;
    });

  return Response.json({ personId: actor.personId, jobs });
}
