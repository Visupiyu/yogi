import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryJob, DeliveryLeg } from "@/lib/deliveryEngine/types";

// GET /api/delivery/my-hub-tasks
//
// The authenticated Hub Person's own queue at their one assigned hub, in two
// parts. Each task item carries a `type` discriminator:
//
//   receiveTasks:
//     "ORIGIN_RECEIVE"      — a COMPANY job whose current (Pickup) leg has an
//                             origin-hub handover INITIATED by a rider,
//                             targeting THIS hub. Acting on one is
//                             `POST .../hub-intake/confirm`.
//     "DESTINATION_RECEIVE" — (Phase 5) a COMPANY job in company transit
//                             (currentStage "InTransit") whose AUTHORITATIVE
//                             job.destinationHubId — set by the dispatcher at
//                             transit-departure (transit.ts), never guessed —
//                             equals THIS hub. Acting on one is
//                             `POST .../destination-receipt`. Before Phase 5,
//                             this could not be discovered at all: company
//                             transit carried no persisted destination-hub
//                             target, so nothing here could safely tell which
//                             hub an in-transit job belonged to without either
//                             guessing or showing it to every hub in the
//                             company. That gap is closed now that
//                             destinationHubId exists and is authoritative.
//
//   releaseTasks:
//     "DESTINATION_HANDOVER" — a COMPANY job at THIS Hub Person's own
//                              destination hub, with a final-mile rider
//                              already selected. Carries `handoverState`:
//                                "ready"                         — leg.status
//                                  is still "Assigned"; acting on it is
//                                  `POST .../destination-handover`.
//                                "awaiting_rider_confirmation"    — leg.status
//                                  is already "HandoverInitiated" (this Hub
//                                  Person already started it); nothing left
//                                  for THIS person to do but wait for Rider 2.
//                              This is read from the PERSISTED leg document,
//                              never inferred client-side — it survives
//                              refresh/re-fetch/app-restart exactly because it
//                              is the server's own durable state.
//
// Deliberately a SEPARATE query from /my-jobs (which filters on
// assignedPersonId) — a hub person's task is never an assignedPersonId
// assignment, so it must never leak into, or be confused with, a rider's job
// queue.
//
// hubId/companyId are resolved SERVER-SIDE from the caller's OWN deliveryPersons
// doc via resolveDeliveryActor — never from a query param or body. The server
// alone decides which job is "ready" for either action; nothing here is
// client-selectable.
//
// Single-field query (companyId ==), mirrors company/jobs — no composite index
// required; matches are filtered in memory over ONE Firestore snapshot. The
// (few) release candidates each need one extra read of their own current leg
// to determine handoverState — that leg document is the authoritative source,
// never guessed from job-level fields alone.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-my-hub-tasks", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (
    actor.role !== "person" ||
    actor.providerType !== "COMPANY" ||
    !actor.companyId ||
    actor.person.role !== "HUB_PERSON" ||
    !actor.person.hubId
  ) {
    return Response.json({ error: "Only a Hub Person has a hub task queue." }, { status: 403 });
  }
  const hubId = actor.person.hubId;
  const personId = actor.personId;
  const companyId = actor.companyId;

  const db = getAdminDb();
  const snap = await db.collection("deliveryJobs").where("companyId", "==", companyId).get();

  type OriginReceiveTask = {
    type: "ORIGIN_RECEIVE";
    jobId: string;
    orderNumber?: string;
    vendorName?: string;
    shipmentNumber?: string;
    sellerName: string;
    fromPersonId: string;
    fromPersonName: string;
    initiatedAt: unknown;
  };
  type DestinationReceiveTask = {
    type: "DESTINATION_RECEIVE";
    jobId: string;
    orderNumber?: string;
    vendorName?: string;
    shipmentNumber?: string;
    // Still a true, always-present snapshot field — not fabricated for this
    // task type. There is no "fromPerson" here: company transit is not
    // carried by a person, so none is shown (unlike ORIGIN_RECEIVE).
    sellerName: string;
    // The true "waiting since" for this task type — when the shipment left
    // the origin hub into company transport (mirrors initiatedAt's role for
    // ORIGIN_RECEIVE, but this is a job-level field, not a handover marker).
    transitStartedAt: unknown;
  };
  type ReceiveTask = OriginReceiveTask | DestinationReceiveTask;
  type ReleaseTask = {
    type: "DESTINATION_HANDOVER";
    handoverState: "ready" | "awaiting_rider_confirmation";
    jobId: string;
    orderNumber?: string;
    vendorName?: string;
    shipmentNumber?: string;
    toPersonId: string;
    toPersonName: string;
    finalMileAssignedAt: unknown;
    handoverInitiatedAt?: unknown;
  };

  const receiveTasks: ReceiveTask[] = [];
  // Coarse release candidates (job-level fields only); handoverState is
  // resolved per-candidate below from each one's own current leg.
  const releaseCandidates: { jobId: string; currentLegId: string; job: DeliveryJob }[] = [];

  for (const d of snap.docs) {
    const job = d.data() as DeliveryJob;

    // ---- ORIGIN_RECEIVE: job.pendingOriginHubHandover is the authoritative,
    // server-written marker (set only by applyOriginHubHandoverInitiate) — the
    // exact same field the transactional confirm step itself gates on. ----
    const pending = job.pendingOriginHubHandover;
    if (pending && pending.state === "Initiated" && pending.hubId === hubId) {
      receiveTasks.push({
        type: "ORIGIN_RECEIVE",
        jobId: d.id,
        orderNumber: job.orderNumber,
        vendorName: job.vendorName,
        shipmentNumber: job.shipmentNumber, // display only; NOT the scanToken
        sellerName: job.pickup?.sellerName ?? "",
        fromPersonId: pending.fromPersonId,
        fromPersonName: pending.fromPersonName,
        initiatedAt: pending.initiatedAt ?? null,
      });
      continue; // a job is never both a receive and a release task at once
    }

    // ---- DESTINATION_RECEIVE: job.destinationHubId is the authoritative,
    // dispatcher-set field (transit.ts, Phase 5) — equality here is the ONLY
    // check needed; no address/city text, no hub count, no geocoding. Gating
    // on currentStage "InTransit" also structurally guarantees the shipment
    // has not already been received at that hub (receipt advances the stage
    // to "AtDestinationHub"), not already handed to Rider 2 (requires
    // "FinalMileAssigned", further downstream), and is not Delivered — every
    // later stage fails this equality check. ----
    if (job.currentStage === "InTransit" && job.destinationHubId === hubId) {
      receiveTasks.push({
        type: "DESTINATION_RECEIVE",
        jobId: d.id,
        orderNumber: job.orderNumber,
        vendorName: job.vendorName,
        shipmentNumber: job.shipmentNumber,
        sellerName: job.pickup?.sellerName ?? "",
        transitStartedAt: job.transitStartedAt ?? null,
      });
      continue; // a job is never both a receive and a release task at once
    }

    // ---- DESTINATION_HANDOVER release candidate (coarse, job-level only) ----
    if (
      job.currentStage === "FinalMileAssigned" &&
      job.responsibleParty?.kind === "COMPANY" &&
      job.responsibleParty.personId === personId &&
      job.currentHubId === hubId &&
      job.assignedPersonId &&
      job.currentLegId
    ) {
      releaseCandidates.push({ jobId: d.id, currentLegId: job.currentLegId, job });
    }
  }

  // Resolve handoverState from each candidate's OWN current leg — the
  // persisted, authoritative FSM state (leg.status), never inferred from job-
  // level fields (which applyDestinationHandoverInitiate deliberately leaves
  // untouched) and never from client/mobile-local state.
  const releaseTasks: ReleaseTask[] = (
    await Promise.all(
      releaseCandidates.map(async ({ jobId, currentLegId, job }) => {
        const legSnap = await db.collection("deliveryJobs").doc(jobId).collection("legs").doc(currentLegId).get();
        if (!legSnap.exists) return null;
        const leg = legSnap.data() as DeliveryLeg;
        if (leg.type !== "FinalMile") return null;

        let handoverState: ReleaseTask["handoverState"];
        if (leg.status === "Assigned") {
          handoverState = "ready";
        } else if (leg.status === "HandoverInitiated" && leg.destinationHandover?.state === "Initiated") {
          handoverState = "awaiting_rider_confirmation";
        } else {
          // Already confirmed / moved on (e.g. OutForDelivery) — no longer a
          // hub task for this person at all.
          return null;
        }

        const task: ReleaseTask = {
          type: "DESTINATION_HANDOVER",
          handoverState,
          jobId,
          orderNumber: job.orderNumber,
          vendorName: job.vendorName,
          shipmentNumber: job.shipmentNumber,
          toPersonId: job.assignedPersonId as string,
          toPersonName: job.assignedPersonName ?? "",
          finalMileAssignedAt: job.finalMileAssignedAt ?? null,
        };
        if (handoverState === "awaiting_rider_confirmation") {
          task.handoverInitiatedAt = leg.destinationHandover?.initiatedAt ?? null;
        }
        return task;
      })
    )
  ).filter((t): t is ReleaseTask => t !== null);

  function millisOf(v: unknown): number {
    return (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
  }
  // "Waiting since" differs by receive-task type (a handover marker for
  // origin, a job-level timestamp for destination) — both are real, never
  // fabricated for the other type.
  function receiveSince(t: ReceiveTask): unknown {
    return t.type === "ORIGIN_RECEIVE" ? t.initiatedAt : t.transitStartedAt;
  }
  receiveTasks.sort((a, b) => millisOf(receiveSince(a)) - millisOf(receiveSince(b)));
  releaseTasks.sort((a, b) => millisOf(a.finalMileAssignedAt) - millisOf(b.finalMileAssignedAt));

  return Response.json({ hubId, receiveTasks, releaseTasks });
}
