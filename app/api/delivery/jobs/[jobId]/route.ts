import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { deriveRiderTask, deriveNavigationDestination } from "@/lib/deliveryEngine/taskLocation";
import { readCodPaymentInfo } from "@/lib/deliveryEngine/codPayment";
import { readDeliveryExceptionInfo } from "@/lib/deliveryEngine/deliveryException";
import type { DeliveryJob, DeliveryLeg, DeliveryEvent, DeliveryPerson } from "@/lib/deliveryEngine/types";

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
  let actorPersonId = ""; // "" for admin/company — never matches a custody.personId
  if (requester.isAdmin) {
    authorized = true;
  } else {
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role === "company") {
      authorized = job.providerType === "COMPANY" && job.companyId === actor.companyId;
    } else if (actor.role === "person") {
      authorized = job.assignedPersonId === actor.personId;
      actorPersonId = actor.personId;
    }
  }
  if (!authorized) return Response.json({ error: "Not authorized." }, { status: 403 });

  // The rider's actual physical task (pickup -> drop) for whichever leg is
  // current — see taskLocation.ts. Read-only; job.pickup/job.drop below are
  // unchanged (always the seller/customer snapshot).
  const task = await deriveRiderTask(db, snap.id, job);
  // V1 navigation (open the phone's map app) — see taskLocation.ts. Read-only,
  // derived from this same authoritative task; never a client-chosen
  // destination. A HUB_PERSON never reaches this route (their assignedPersonId
  // is always null while a job is at a hub — see the authorization check
  // above), so a rider navigation destination is never exposed to one.
  const navigationDestination = deriveNavigationDestination(job, task);
  // COD Payment Scan V1 — read-only projection of the authoritative orders/
  // {orderId} payment record (see codPayment.ts). canVerify is always false
  // for admin/company (actorPersonId "") and for anyone not currently holding
  // physical custody of this exact shipment.
  const codPayment = await readCodPaymentInfo(db, snap.id, job, actorPersonId);
  // Delivery Failure/Exception Handling V1 — read-only projection (see
  // deliveryException.ts). canReport is always false for admin/company
  // (actorPersonId "") and for anyone not currently holding final-mile
  // custody while OutForDelivery.
  const deliveryException = await readDeliveryExceptionInfo(db, snap.id, job, actorPersonId);

  // Resolve the stored origin/destination hubs (by their authoritative ids) for
  // the permanent Job-Card route view. Read BY ID so an in-flight job keeps
  // resolving even if a hub is later deactivated; a missing hub → null. No
  // client-supplied address is ever used.
  async function resolveHub(id: unknown) {
    if (typeof id !== "string" || !id) return null;
    const hs = await db.collection("deliveryHubs").doc(id).get();
    if (!hs.exists) return null;
    const h = hs.data() as { name?: string; address?: string; city?: string; region?: string; pincode?: string };
    return {
      id,
      name: typeof h.name === "string" ? h.name : "",
      address: typeof h.address === "string" ? h.address : "",
      city: typeof h.city === "string" ? h.city : "",
      region: typeof h.region === "string" ? h.region : "",
      pincode: typeof h.pincode === "string" ? h.pincode : "",
    };
  }
  const originHub = await resolveHub(job.originHubId);
  const destinationHub = await resolveHub(job.destinationHubId);

  // Four-actor projection (COMPANY hub jobs) — surface the FOUR operational
  // actors, each from its authoritative existing leg/event field. Read-only:
  // assignment/receipt happen through the engine + Delivery App, not here.
  const STAGE_INDEX: Record<string, number> = {
    Created: 0, AwaitingHandoff: 0, PickupComplete: 1, PickedUp: 1,
    AtOriginHub: 2, InTransit: 3, AtDestinationHub: 4, FinalMileAssigned: 5,
    OutForDelivery: 6, Delivered: 7,
  };
  const sIdx = STAGE_INDEX[job.currentStage] ?? 0;
  let deliveryActors: unknown = null;
  if (job.providerType === "COMPANY") {
    const legsSnap = await db.collection("deliveryJobs").doc(snap.id).collection("legs").get();
    const legsArr = legsSnap.docs.map((d) => d.data() as DeliveryLeg);
    const pickupLeg = legsArr.find((l) => l.type === "Pickup") || null;
    const finalMileLeg = legsArr.find((l) => l.type === "FinalMile") || null;
    const rider1Id = (pickupLeg?.assignedPersonId as string | null | undefined) ?? null;
    // Hub persons: show the ACTUAL confirmer once receipt happened; otherwise the
    // operator's designation (job.originHubPersonId / destinationHubPersonId).
    const originConfirmerId = pickupLeg?.originHubHandover?.confirmedByPersonId ?? null;
    const originHubPersonId = originConfirmerId ?? (typeof job.originHubPersonId === "string" && job.originHubPersonId ? job.originHubPersonId : null);
    const rider2Id = (finalMileLeg?.assignedPersonId as string | null | undefined) ?? null;
    let destConfirmerId: string | null = null;
    try {
      const de = await db.collection("deliveryEvents").doc(`${snap.id}__destination_hub_receipt`).get();
      if (de.exists) {
        const p = (de.data() as DeliveryEvent).personId;
        destConfirmerId = typeof p === "string" && p ? p : null;
      }
    } catch { /* non-fatal */ }
    const destHubPersonId = destConfirmerId ?? (typeof job.destinationHubPersonId === "string" && job.destinationHubPersonId ? job.destinationHubPersonId : null);

    const ids = [rider1Id, originHubPersonId, destHubPersonId, rider2Id].filter(
      (x): x is string => typeof x === "string" && !!x
    );
    const personMap = new Map<string, { name: string; phone: string }>();
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        const ps = await db.collection("deliveryPersons").doc(id).get();
        if (ps.exists) {
          const p = ps.data() as DeliveryPerson;
          personMap.set(id, {
            name: typeof p.name === "string" ? p.name : "",
            phone: typeof p.phone === "string" ? p.phone : "",
          });
        }
      })
    );
    const view = (id: string | null, status: string, hubName?: string) => ({
      personId: id,
      name: id ? personMap.get(id)?.name ?? "" : "",
      phone: id ? personMap.get(id)?.phone ?? "" : "",
      status,
      ...(hubName ? { hubName } : {}),
    });

    const rider1Status = !rider1Id
      ? "Not assigned"
      : sIdx >= 2 ? "Handed to origin hub"
      : sIdx === 1 ? "Picked up"
      : "Assigned";
    const originStatus = originConfirmerId
      ? "Received at origin hub"
      : job.originHubPersonId ? "Assigned"
      : pickupLeg?.originHubHandover?.state === "Initiated" ? "Awaiting receipt"
      : "Pending — assign a hub person";
    const destStatus = destConfirmerId
      ? "Received at destination hub"
      : job.destinationHubPersonId ? "Assigned"
      : sIdx >= 3 ? "Awaiting receipt"
      : "Pending — assign a hub person";
    const rider2Status = !rider2Id
      ? "Not assigned yet"
      : sIdx >= 7 ? "Delivered"
      : sIdx >= 6 ? "Out for delivery"
      : "Assigned";

    deliveryActors = {
      rider1: view(rider1Id, rider1Status),
      originHubPerson: view(originHubPersonId, originStatus, originHub?.name || undefined),
      destinationHubPerson: view(destHubPersonId, destStatus, destinationHub?.name || undefined),
      rider2: view(rider2Id, rider2Status),
    };
  }

  // Rider Assignment Response projection — expose the current pickup leg status
  // so a person/company client can tell "assigned, awaiting rider acceptance"
  // from "rider accepted". Reads the current leg once (by id).
  let pickupLegStatus: string | null = null;
  let awaitingRiderAcceptance = false;
  if (job.currentLegId) {
    const clSnap = await db.collection("deliveryJobs").doc(snap.id).collection("legs").doc(job.currentLegId).get();
    const cl = clSnap.exists ? (clSnap.data() as DeliveryLeg) : null;
    if (cl && cl.type === "Pickup") {
      pickupLegStatus = typeof cl.status === "string" ? cl.status : null;
      awaitingRiderAcceptance = job.providerType === "COMPANY" && job.status === "AssignedToCompany" && cl.status === "Assigned";
    }
  }

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
      originHubId: job.originHubId ?? null,
      destinationHubId: job.destinationHubId ?? null,
      originHubPersonId: job.originHubPersonId ?? null,
      destinationHubPersonId: job.destinationHubPersonId ?? null,
      originHub,
      destinationHub,
      deliveryActors,
      responsibleParty: job.responsibleParty ?? null,
      assignedPersonId: job.assignedPersonId ?? null,
      assignedPersonName: job.assignedPersonName ?? null,
      assignedPersonPhone: job.assignedPersonPhone ?? null,
      assignedCompanyName: job.assignedCompanyName ?? null,
      pickup: job.pickup,
      drop: job.drop,
      parcel: job.parcel,
      task,
      pickupLegStatus,
      awaitingRiderAcceptance,
      navigationDestination,
      codPayment,
      deliveryException,
    },
  });
}
