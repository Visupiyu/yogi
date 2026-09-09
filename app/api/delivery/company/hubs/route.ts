import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryHub } from "@/lib/deliveryEngine/types";

// GET /api/delivery/company/hubs
//
// The calling company's OWN hubs (read-only). Company-only; scoped strictly to
// the caller's companyId, resolved SERVER-SIDE from the verified token — a
// company can never read another company's hubs. deliveryHubs is client-
// unreadable by firestore.rules; this is the company-side read path (mirrors the
// admin hubs list, scoped by companyId). Used by the Console to let a dispatcher
// pick a destination hub for a company-managed receipt. No writes here — hub
// creation stays an admin action.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-hubs", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company" || !actor.companyId)
    return Response.json({ error: "Only a delivery company can view its hubs." }, { status: 403 });

  const snap = await getAdminDb()
    .collection("deliveryHubs")
    .where("companyId", "==", actor.companyId)
    .get();

  const hubs = snap.docs.map((d) => {
    const h = d.data() as DeliveryHub;
    return { id: d.id, name: h.name, city: h.city ?? "", region: h.region ?? "", status: h.status };
  });
  return Response.json({ companyId: actor.companyId, hubs });
}
