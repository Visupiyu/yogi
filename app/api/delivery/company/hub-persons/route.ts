import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryPerson } from "@/lib/deliveryEngine/types";

// GET /api/delivery/company/hub-persons?hubId=...
//
// Eligible HUB-PERSON candidates for a NEW assignment at ONE specific hub. The
// filter is by the actual hubId (NOT city/state/name), server-authoritative:
//
//   companyId  — from the verified caller (never the client)
//   hubId      — the exact hub the caller is assigning at
//   role       — HUB_PERSON only (riders can never be hub persons)
//
// A Hub Person is a STATIONED receiver, NOT a one-shipment-at-a-time resource:
// the same person receives many shipments at their hub. So candidates are NOT
// gated by availability and NOT by how many jobs already designate them — this
// mirrors the authoritative existing hub-person semantics (assertHubPerson and
// notifications.ts's readHubPersonRecipients both IGNORE availability for hub
// persons, and hub persons are created with availability "Offline" by default).
// Gating on availability === "Available" was the bug: it hid stationed, Active
// hub persons whose availability was Offline/Busy.
//
// companyId + hubId + role are EQUALITY filters, so Cloud Firestore serves the
// query with automatic single-field indexes (no composite index) — the same
// pattern readHubPersonRecipients uses. The COMPLETE eligible set is returned
// (no limit); a per-hub HUB_PERSON set is inherently bounded.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-hub-persons", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company" || !actor.companyId)
    return Response.json({ error: "Only a delivery company can view its hub people." }, { status: 403 });

  const url = new URL(request.url);
  const hubId = (url.searchParams.get("hubId") || "").trim().slice(0, 128);
  if (!hubId) return Response.json({ error: "hubId is required." }, { status: 400 });

  // companyId + hubId + role — all equality, no composite index, complete set
  // (no limit). Availability is intentionally NOT filtered: a stationed hub
  // person receives many shipments, so it is never a one-shot "Available" slot.
  const snap = await getAdminDb()
    .collection("deliveryPersons")
    .where("companyId", "==", actor.companyId)
    .where("hubId", "==", hubId)
    .where("role", "==", "HUB_PERSON")
    .get();

  // Only surface Active accounts (a suspended account is never an eligible
  // candidate). Availability is not considered — hub persons are stationed.
  const persons = snap.docs
    .map((d) => {
      const p = d.data() as DeliveryPerson;
      const accountStatus = p.accountStatus ?? (p.status === "Inactive" ? "Suspended" : "Active");
      return { id: d.id, name: p.name, phone: p.phone, hubId: p.hubId ?? null, accountStatus };
    })
    .filter((p) => p.accountStatus === "Active")
    .map(({ id, name, phone, hubId: hid }) => ({ personId: id, name, phone, hubId: hid }));

  return Response.json({ companyId: actor.companyId, hubId, persons });
}
