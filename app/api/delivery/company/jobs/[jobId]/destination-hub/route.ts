import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryHub, DeliveryJob } from "@/lib/deliveryEngine/types";

// POST /api/delivery/company/jobs/[jobId]/destination-hub   { hubId }
//
// The company operator chooses WHICH of its hubs is the destination hub for THIS
// job, up front — so the whole route is visible on the Job Card before the
// shipment reaches transit (not only at dispatch). Stored as job.destinationHubId
// and consumed by the existing transit-departure (as its destination), the
// destination-hub receipt, final-mile assignment, and rider navigation
// (taskLocation.resolveHubById(job.destinationHubId)).
//
// Server-authoritative: companyId from the verified caller (never the client);
// the job must belong to that company; the hub must belong to the company and be
// Active (only active hubs are selectable for new jobs); it must NOT be the same
// as the origin hub. A company may run MANY active hubs — this picks one per job
// and never demotes another. Locked once the shipment has departed into transit
// (destinationHubId is then committed by the departure), so in-flight jobs keep
// their destination.

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Stages at/after which the destination is already committed by transit departure.
const LOCKED_STAGES = new Set([
  "InTransit", "AtDestinationHub", "FinalMileAssigned", "OutForDelivery", "Delivered",
]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-destination-hub", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company" || !actor.companyId)
    return Response.json({ error: "Only a delivery company can set a job's destination hub." }, { status: 403 });
  const companyId = actor.companyId;

  const { jobId } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const hubId = str(body.hubId, 128);
  if (!hubId) return Response.json({ error: "A hub is required." }, { status: 400 });

  const db = getAdminDb();
  const jobRef = db.collection("deliveryJobs").doc(jobId);

  const outcome = await db.runTransaction<{ error?: string; code?: number; ok?: boolean }>(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) return { error: "Delivery job not found.", code: 404 };
    const job = jobSnap.data() as DeliveryJob;

    if (job.providerType !== "COMPANY" || job.companyId !== companyId) {
      return { error: "This shipment belongs to another company.", code: 403 };
    }
    if (job.transitStartedAt || LOCKED_STAGES.has(job.currentStage)) {
      return { error: "The destination hub can no longer be changed for this shipment.", code: 409 };
    }
    // Destination cannot be the same as the chosen origin hub.
    if (typeof job.originHubId === "string" && job.originHubId && job.originHubId === hubId) {
      return { error: "The destination hub cannot be the same as the origin hub.", code: 409 };
    }

    const hubSnap = await tx.get(db.collection("deliveryHubs").doc(hubId));
    if (!hubSnap.exists) return { error: "Hub not found.", code: 404 };
    const hub = hubSnap.data() as DeliveryHub;
    if (hub.companyId !== companyId) return { error: "That hub belongs to another company.", code: 403 };
    if (hub.status !== "Active") return { error: "That hub is not active.", code: 409 };

    // Revalidate the hub-person designation: if the destination hub changed, the
    // previously selected destination hub person no longer belongs to it — clear.
    const update: Record<string, unknown> = { destinationHubId: hubId, updatedAt: Timestamp.now() };
    if (typeof job.destinationHubId === "string" && job.destinationHubId && job.destinationHubId !== hubId) {
      update.destinationHubPersonId = null;
    }
    tx.update(jobRef, update);
    return { ok: true };
  });

  if (outcome.error) return Response.json({ error: outcome.error }, { status: outcome.code ?? 400 });
  return Response.json({ success: true, destinationHubId: hubId });
}
