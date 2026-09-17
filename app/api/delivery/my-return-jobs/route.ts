import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { RETURN_ACTIVE_JOB_STATUSES } from "@/lib/deliveryEngine/assignment";
import { buildReturnJobView } from "@/lib/deliveryEngine/returnCollection";

// GET /api/delivery/my-return-jobs
//
// The authenticated delivery person's own return-collection queue — the
// return-engine analogue of /api/delivery/my-jobs, reading the SEPARATE
// `returnCollectionJobs` collection (see lib/deliveryEngine/returnCollection.ts)
// instead of `deliveryJobs`. PERSON-ONLY, scoped strictly to the caller's own
// personId (never trusted from the client — resolved server-side via
// resolveDeliveryActor). A HUB_PERSON is never assigned a return job
// (assertRiderPerson in the engine), so this queue is empty for one, exactly
// like a rider's own /my-jobs is never reachable by a hub person's role.
//
// Single-field query (assignedPersonId ==) — no composite index required.
// Filtered to the SAME "still active" status set the engine's own multi-parcel
// availability logic uses (RETURN_ACTIVE_JOB_STATUSES, exported from
// assignment.ts) so this queue and the availability model never disagree
// about what counts as an active job — a job that reached the terminal
// Received/Cancelled status simply drops off, exactly like a delivered
// forward job drops off /my-jobs.
//
// Company isolation is implicit: a COMPANY rider's assignedPersonId can only
// ever be set by their OWN company (createOrAssignReturnJob's actorKind
// "company" path enforces assertCompanyPerson before assignment), so no
// cross-company query/filter is needed here — mirrors how /my-jobs needs none.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-my-return-jobs", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "person")
    return Response.json({ error: "Only a delivery person has a return-collection queue." }, { status: 403 });

  const db = getAdminDb();
  const snap = await db
    .collection("returnCollectionJobs")
    .where("assignedPersonId", "==", actor.personId)
    .get();

  const returnJobs = snap.docs
    .filter((d) => RETURN_ACTIVE_JOB_STATUSES.has((d.data() as { status?: string }).status || ""))
    .map((d) => buildReturnJobView(d.id, d.data()));

  return Response.json({ returnJobs });
}
