import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryHub, DeliveryJob } from "@/lib/deliveryEngine/types";

// POST /api/delivery/company/jobs/[jobId]/origin-hub   { hubId }
//
// The company operator chooses WHICH of its hubs is the origin hub for THIS
// specific job (Seller → Rider 1 → selected Origin Hub). The choice is stored
// as job.originHubId and is later consumed by the origin-hub handover
// (lib/deliveryEngine/hubIntake.ts) and by rider navigation/task derivation
// (lib/deliveryEngine/taskLocation.ts) — the operator never re-types an address.
//
// Server-authoritative: companyId is resolved from the verified caller (never
// from the client), the job must belong to that company, and the hub must
// belong to the company and be Active (only active hubs are selectable for new
// jobs). A company may run MANY active hubs — this picks one per job; it never
// demotes any other hub. Locked once the shipment has actually been received at
// an origin hub (originHubIntakeAt set), so an in-flight job keeps its hub.

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Stages at/after which the origin hub is already established and must not change.
const LOCKED_STAGES = new Set([
  "AtOriginHub", "InTransit", "AtDestinationHub", "FinalMileAssigned", "OutForDelivery", "Delivered",
]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-origin-hub", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company" || !actor.companyId)
    return Response.json({ error: "Only a delivery company can set a job's origin hub." }, { status: 403 });
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

    // Ownership — never from the client.
    if (job.providerType !== "COMPANY" || job.companyId !== companyId) {
      return { error: "This shipment belongs to another company.", code: 403 };
    }
    // Locked once received at an origin hub (in-flight jobs keep their hub).
    if (job.originHubIntakeAt || LOCKED_STAGES.has(job.currentStage)) {
      return { error: "The origin hub can no longer be changed for this shipment.", code: 409 };
    }

    // The hub must belong to this company and be Active (only active hubs are
    // selectable for new jobs).
    const hubSnap = await tx.get(db.collection("deliveryHubs").doc(hubId));
    if (!hubSnap.exists) return { error: "Hub not found.", code: 404 };
    const hub = hubSnap.data() as DeliveryHub;
    if (hub.companyId !== companyId) return { error: "That hub belongs to another company.", code: 403 };
    if (hub.status !== "Active") return { error: "That hub is not active.", code: 409 };

    // Revalidate the hub-person designation: if the origin hub changed, the
    // previously selected origin hub person no longer belongs to it — clear it.
    const update: Record<string, unknown> = { originHubId: hubId, updatedAt: Timestamp.now() };
    if (typeof job.originHubId === "string" && job.originHubId && job.originHubId !== hubId) {
      update.originHubPersonId = null;
    }
    tx.update(jobRef, update);
    return { ok: true };
  });

  if (outcome.error) return Response.json({ error: outcome.error }, { status: outcome.code ?? 400 });
  return Response.json({ success: true, originHubId: hubId });
}
