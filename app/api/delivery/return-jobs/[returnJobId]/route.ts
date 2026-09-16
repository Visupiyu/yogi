import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { buildReturnJobView } from "@/lib/deliveryEngine/returnCollection";

// GET /api/delivery/return-jobs/[returnJobId]
//
// One return-collection job's detail, for the Delivery App — the return-engine
// analogue of GET /api/delivery/jobs/[jobId]. PERSON-ONLY (unlike the forward
// job read, which also admits admin/company for visibility — a return-
// collection job is never exposed beyond the single rider actually holding
// it): authorization is job.assignedPersonId === actor.personId, plus the
// SAME company/provider cross-check executeReturnTransition itself enforces
// (a COMPANY rider's job must belong to their OWN company) — so a rider can
// never read a return job that was never (or no longer) assigned to them,
// exactly mirroring the authorization already proven correct inside the
// engine's own execution path.
//
// Uses buildReturnJobView — the SAME safe, no-financial-fields projection the
// engine ships for exactly this purpose (see returnCollection.ts's own doc
// comment: "Customer/operational-safe projection for the Delivery App").
// Nothing here re-derives or duplicates that projection.
export async function GET(request: Request, ctx: { params: Promise<{ returnJobId: string }> }) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-return-job-read", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "person")
    return Response.json({ error: "Only the delivery person assigned to this return can view it." }, { status: 403 });

  const { returnJobId } = await ctx.params;
  const db = getAdminDb();
  const snap = await db.collection("returnCollectionJobs").doc(returnJobId).get();
  if (!snap.exists) return Response.json({ error: "Return collection job not found." }, { status: 404 });
  const job = snap.data() as {
    assignedPersonId?: string | null;
    companyId?: string | null;
    providerType?: string | null;
  };

  // Same two checks executeReturnTransition performs before any transition:
  // the caller must be the assigned person, and — for a COMPANY rider — the
  // job must belong to their own company. Never re-derived differently here.
  if (job.assignedPersonId !== actor.personId)
    return Response.json({ error: "This return collection is not assigned to you." }, { status: 403 });
  if (actor.providerType === "COMPANY" && job.companyId !== actor.companyId)
    return Response.json({ error: "This return collection belongs to another company." }, { status: 403 });

  return Response.json({ returnJob: buildReturnJobView(snap.id, snap.data() as Record<string, unknown>) });
}
