import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryPerson } from "@/lib/deliveryEngine/types";

// PATCH /api/delivery/company/persons/[personId]
// A company edits/activates/suspends ONE of its OWN delivery persons. Ownership
// is enforced by comparing the target doc's companyId to the caller's resolved
// company — a company can never touch another company's (or a YOMICO) person.
// providerType, companyId, uid, createdBy are immutable here.
function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ personId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-persons-update", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company")
    return Response.json({ error: "Only a delivery company can manage delivery people." }, { status: 403 });

  const { personId } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const db = getAdminDb();
  const ref = db.collection("deliveryPersons").doc(personId);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Delivery person not found." }, { status: 404 });

  const person = snap.data() as DeliveryPerson;
  if (person.companyId !== actor.companyId)
    return Response.json({ error: "That delivery person belongs to another company." }, { status: 403 });

  // Allow-listed update. providerType/companyId/uid/createdBy never writable.
  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (body.name !== undefined) update.name = str(body.name);
  if (body.phone !== undefined) update.phone = str(body.phone, 20);
  if (body.vehicleType !== undefined) update.vehicleType = str(body.vehicleType, 40);
  if (body.vehicleNumber !== undefined) update.vehicleNumber = str(body.vehicleNumber, 40);
  if (body.serviceArea !== undefined) update.serviceArea = str(body.serviceArea);
  if (body.city !== undefined) update.city = str(body.city, 80);

  // accountStatus is the current field; `status` is accepted as the deprecated
  // alias input and both are written in lockstep for one transition phase.
  const rawStatus = body.accountStatus !== undefined ? body.accountStatus : body.status;
  if (rawStatus !== undefined) {
    const s = str(rawStatus, 12);
    if (s === "Active") { update.accountStatus = "Active"; update.status = "Active"; }
    else if (s === "Suspended" || s === "Inactive") { update.accountStatus = "Suspended"; update.status = "Inactive"; }
    else return Response.json({ error: "accountStatus must be Active or Suspended." }, { status: 400 });
  }

  await ref.update(update);
  return Response.json({ success: true });
}
