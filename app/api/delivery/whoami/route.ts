import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";

// GET /api/delivery/whoami — server-mediated identity. The client never reads
// deliveryCompanies/deliveryPersons directly; it asks here and gets only this
// caller's delivery role + scoped id. No other actor's data, no customer data,
// no money.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-whoami", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);

  if (actor.role === "company") {
    return Response.json({
      role: "company",
      companyId: actor.companyId,
      company: { id: actor.company.id, name: actor.company.name, status: actor.company.status },
    });
  }
  if (actor.role === "person") {
    return Response.json({
      role: "person",
      providerType: actor.providerType,
      companyId: actor.companyId, // null for YOMICO
      personId: actor.personId,
      person: {
        id: actor.person.id,
        name: actor.person.name,
        providerType: actor.providerType,
        // Physical workforce role, derived SERVER-SIDE from the authoritative
        // deliveryPersons doc (never trusted from the client). Absent/legacy =>
        // RIDER; only a COMPANY person can be HUB_PERSON. This lets the Delivery
        // App RECOGNISE a hub person and route them to the hub workflow instead
        // of the rider job queue. It does NOT change who is admitted — that is
        // still gated on actor.role === "person" above (both roles pass).
        role: actor.person.role === "HUB_PERSON" ? "HUB_PERSON" : "RIDER",
        // The hub a HUB_PERSON is stationed at (null for a rider). Client uses it
        // only for display/routing; every hub-receipt/handover route RE-derives
        // it server-side from the caller's own doc, so it is never trusted for authz.
        hubId: actor.person.role === "HUB_PERSON" ? actor.person.hubId ?? null : null,
        accountStatus: actor.person.accountStatus ?? (actor.person.status === "Inactive" ? "Suspended" : "Active"),
        availability: actor.person.availability ?? "Offline",
        companyId: actor.companyId,
      },
    });
  }
  return Response.json({ role: "none" });
}
