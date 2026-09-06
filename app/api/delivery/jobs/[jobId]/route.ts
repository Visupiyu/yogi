import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// GET /api/delivery/jobs/[jobId]
//
// Server-mediated read model of one delivery job. Authorization:
//   - YOMICO Admin: any job (full read -- this is how Admin sees WHICH company
//     person currently holds a handed-off job: read-only, no control).
//   - Company: only a job handed to that company (job.companyId === caller's).
//   - Delivery person: only a job whose current assignee is them.
// No money/inventory data is exposed (none exists on a job); the customer's
// address/phone are returned only to the parties above (all delivery actors),
// matching what the delivery workflow already needs.
export async function GET(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-job-read", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const { jobId } = await ctx.params;
  const db = getAdminDb();
  const snap = await db.collection("deliveryJobs").doc(jobId).get();
  if (!snap.exists) return Response.json({ error: "Delivery job not found." }, { status: 404 });
  const job = snap.data() as DeliveryJob;

  // Authorize by role.
  let authorized = false;
  if (requester.isAdmin) {
    authorized = true;
  } else {
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role === "company") {
      authorized = job.providerType === "COMPANY" && job.companyId === actor.companyId;
    } else if (actor.role === "person") {
      authorized = job.assignedPersonId === actor.personId;
    }
  }
  if (!authorized) return Response.json({ error: "Not authorized." }, { status: 403 });

  return Response.json({
    job: {
      id: snap.id,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      vendorId: job.vendorId,
      vendorName: job.vendorName,
      shipmentNumber: job.shipmentNumber,
      orderShipmentNumber: job.orderShipmentNumber,
      providerType: job.providerType ?? null,
      companyId: job.companyId ?? null,
      status: job.status,
      currentLegId: job.currentLegId ?? null,
      currentStage: job.currentStage,
      responsibleParty: job.responsibleParty ?? null,
      assignedPersonId: job.assignedPersonId ?? null,
      assignedPersonName: job.assignedPersonName ?? null,
      assignedPersonPhone: job.assignedPersonPhone ?? null,
      assignedCompanyName: job.assignedCompanyName ?? null,
      pickup: job.pickup,
      drop: job.drop,
      parcel: job.parcel,
    },
  });
}
