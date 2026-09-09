import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";

// POST /api/delivery/person/availability   { availability: "Available" | "Offline" }
//
// Self-service operational-availability toggle for a delivery person (YOMICO or
// COMPANY). This is PROVIDER/PERSON availability only — it has nothing to do
// with physical shipment custody or routing.
//
// SECURITY:
//   * The actor is resolved SERVER-SIDE from the verified Firebase token via
//     resolveDeliveryActor — uid/companyId/providerType/personId are NEVER taken
//     from the request body. A person can therefore only ever update THEIR OWN
//     deliveryPersons document (actor.personId), never another person's.
//   * resolveDeliveryActor returns role "person" ONLY for an Active person (and,
//     for a COMPANY person, an Active owning company). Pending/Suspended resolve
//     to role "none" and are rejected below; an explicit Active re-check is kept
//     as defense in depth.
//   * ONLY the `availability` field (+ updatedAt) is written. accountStatus,
//     providerType, companyId, uid, createdBy, email and every other identity /
//     ownership field are untouched and not writable here.
//   * deliveryPersons client writes stay blocked by firestore.rules; this writes
//     via the Admin SDK, exactly like the existing admin/company person routes.
//
// Only "Available" and "Offline" are accepted. "Busy" is engine-managed
// (assignment/execution) and is intentionally NOT a value a person can self-set.
function str(v: unknown, max = 20): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-person-availability", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  // Server-resolved identity — never trusted from the body.
  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "person")
    return Response.json({ error: "Only a delivery person can set their availability." }, { status: 403 });

  // Defense-in-depth Active re-check (resolveDeliveryActor already enforces it).
  const active = actor.person.accountStatus
    ? actor.person.accountStatus === "Active"
    : actor.person.status === "Active";
  if (!active)
    return Response.json({ error: "Your delivery account is not active." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const availability = str(body.availability, 12);
  if (availability !== "Available" && availability !== "Offline")
    return Response.json({ error: "availability must be Available or Offline." }, { status: 400 });

  // Write ONLY availability to the caller's own person doc (id from the actor).
  await getAdminDb()
    .collection("deliveryPersons")
    .doc(actor.personId)
    .update({ availability, updatedAt: Timestamp.now() });

  return Response.json({ ok: true, availability });
}
