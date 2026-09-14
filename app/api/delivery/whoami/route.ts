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
        accountStatus: actor.person.accountStatus ?? (actor.person.status === "Inactive" ? "Suspended" : "Active"),
        availability: actor.person.availability ?? "Offline",
        companyId: actor.companyId,
      },
    });
  }
  return Response.json({ role: "none" });
}
