import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import type { DeliveryPerson } from "@/lib/deliveryEngine/types";

// PATCH /api/delivery/admin/persons/[personId]
//   { name?, phone?, vehicleType?, vehicleNumber?, serviceArea?, city?,
//     accountStatus?: "Active"|"Suspended", availability?: "Available"|"Offline" }
//
// Admin manages a YOMICO delivery person it provisioned. Scoped to YOMICO
// persons only — an admin cannot mutate a COMPANY person here (that stays with
// the owning company). providerType/companyId/uid/createdBy are immutable.
// accountStatus is the current field; the deprecated `status` alias is written
// in lockstep for one transition phase.
function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ personId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-persons-update", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const { personId } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const db = getAdminDb();
  const ref = db.collection("deliveryPersons").doc(personId);

  // ---- READ (before write) ----
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Delivery person not found." }, { status: 404 });
  const person = snap.data() as DeliveryPerson;
  if (person.providerType !== "YOMICO") {
    return Response.json({ error: "This person is not a YOMICO delivery person." }, { status: 403 });
  }

  // ---- Allow-listed update (immutables never writable) ----
  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (body.name !== undefined) update.name = str(body.name);
  if (body.phone !== undefined) update.phone = str(body.phone, 20);
  if (body.vehicleType !== undefined) update.vehicleType = str(body.vehicleType, 40);
  if (body.vehicleNumber !== undefined) update.vehicleNumber = str(body.vehicleNumber, 40);
  if (body.serviceArea !== undefined) update.serviceArea = str(body.serviceArea);
  if (body.city !== undefined) update.city = str(body.city, 80);

  if (body.accountStatus !== undefined) {
    const v = str(body.accountStatus, 12);
    if (v === "Active") { update.accountStatus = "Active"; update.status = "Active"; }
    else if (v === "Suspended") { update.accountStatus = "Suspended"; update.status = "Inactive"; }
    else return Response.json({ error: "accountStatus must be Active or Suspended." }, { status: 400 });
  }

  if (body.availability !== undefined) {
    const v = str(body.availability, 12);
    if (v === "Available" || v === "Offline") update.availability = v;
    else return Response.json({ error: "availability must be Available or Offline." }, { status: 400 });
  }

  // ---- WRITE ----
  await ref.update(update);
  return Response.json({ success: true });
}
