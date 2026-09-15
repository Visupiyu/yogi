import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryJob, DeliveryPerson } from "@/lib/deliveryEngine/types";

// POST /api/delivery/company/jobs/[jobId]/hub-person   { which, personId }
//   which: "origin" | "destination"
//
// The company operator designates WHICH hub person is assigned to receive this
// shipment at the selected origin/destination hub. Stored as
// job.originHubPersonId / job.destinationHubPersonId. SERVER-AUTHORITATIVE — the
// person MUST:
//   • belong to the caller's company (companyId from the verified token),
//   • have role HUB_PERSON with an Active account,
//   • be stationed at EXACTLY the job's selected hub (originHubId /
//     destinationHubId) — a hub-A person can never be assigned to receive at
//     hub B,
//   • NOT be gated by availability — a hub person is a stationed receiver that
//     handles many shipments, so being designated on other jobs (or showing
//     Offline/Busy) never makes them ineligible (mirrors assertHubPerson, which
//     ignores availability for hub persons). An already-assigned person keeps
//     showing on the Job Card regardless.
//
// This does NOT bypass the Delivery App receipt flow: the assigned hub person
// still authenticates in the Delivery App and confirms physical receipt
// (hubIntake.ts / destinationHub.ts, unchanged). Locked once the shipment has
// actually been received at that hub.

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-hub-person", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company" || !actor.companyId)
    return Response.json({ error: "Only a delivery company can assign a hub person." }, { status: 403 });
  const companyId = actor.companyId;

  const { jobId } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const which = str(body.which, 20);
  const personId = str(body.personId, 128);
  if (which !== "origin" && which !== "destination")
    return Response.json({ error: "which must be 'origin' or 'destination'." }, { status: 400 });
  if (!personId) return Response.json({ error: "A hub person is required." }, { status: 400 });

  const db = getAdminDb();
  const jobRef = db.collection("deliveryJobs").doc(jobId);

  const outcome = await db.runTransaction<{ error?: string; code?: number; ok?: boolean }>(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    if (!jobSnap.exists) return { error: "Delivery job not found.", code: 404 };
    const job = jobSnap.data() as DeliveryJob;

    if (job.providerType !== "COMPANY" || job.companyId !== companyId) {
      return { error: "This shipment belongs to another company.", code: 403 };
    }

    const targetHubId = which === "origin"
      ? (typeof job.originHubId === "string" ? job.originHubId : "")
      : (typeof job.destinationHubId === "string" ? job.destinationHubId : "");
    if (!targetHubId) {
      return { error: `Select the ${which} hub first, then assign its hub person.`, code: 409 };
    }
    // Locked once received at that hub (the actual receiver is then recorded).
    const alreadyReceived = which === "origin" ? !!job.originHubIntakeAt : !!job.destinationHubReceivedAt;
    if (alreadyReceived) {
      return { error: `This shipment has already been received at the ${which} hub.`, code: 409 };
    }

    const personSnap = await tx.get(db.collection("deliveryPersons").doc(personId));
    if (!personSnap.exists) return { error: "Delivery person not found.", code: 404 };
    const p = personSnap.data() as DeliveryPerson;

    // Same company + HUB_PERSON + stationed at EXACTLY this hub (hub-A person can
    // never receive at hub B) + Active account — mirrors assertHubPerson.
    if (p.providerType !== "COMPANY" || p.companyId !== companyId) {
      return { error: "That delivery person belongs to another company.", code: 403 };
    }
    if (p.role !== "HUB_PERSON" || !p.hubId || p.hubId !== targetHubId) {
      return { error: "That person is not a hub person stationed at the selected hub.", code: 409 };
    }
    const accountStatus = p.accountStatus ?? (p.status === "Inactive" ? "Suspended" : "Active");
    if (accountStatus !== "Active") return { error: "That delivery person is not active.", code: 409 };
    // Availability is intentionally NOT gated for a hub person: a stationed hub
    // person receives many shipments, so being designated on other jobs (or
    // showing Offline/Busy) never makes them ineligible — mirrors assertHubPerson,
    // which ignores availability for hub persons. Company + exact hub +
    // HUB_PERSON role + Active account are the authorization; nothing is weakened.

    const field = which === "origin" ? "originHubPersonId" : "destinationHubPersonId";
    tx.update(jobRef, { [field]: personId, updatedAt: Timestamp.now() });
    return { ok: true };
  });

  if (outcome.error) return Response.json({ error: outcome.error }, { status: outcome.code ?? 400 });
  return Response.json({ success: true, which, personId });
}
