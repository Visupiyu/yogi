import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryHub, DeliveryPerson, DeliveryPersonRole } from "@/lib/deliveryEngine/types";

// Company-scoped delivery-person management. Admin does NOT manage delivery
// people — a delivery COMPANY manages its own. Every operation is gated on the
// caller resolving to an Active company, and confined to that company's own
// people: providerType ("COMPANY"), companyId and createdBy come from the
// resolved caller, never from the body.
//
// Auth-user provisioning stays client-side (getSecondaryAuth +
// createUserWithEmailAndPassword) so no firebase-admin/auth is introduced. The
// client creates the Auth user, then POSTs the uid here.

const RL = { max: 60, windowMs: 10 * 60 * 1000 };
function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// GET — list this company's own delivery persons (no other company's data).
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-persons-list", requester.uid, RL.max, RL.windowMs)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company")
    return Response.json({ error: "Only a delivery company can manage delivery people." }, { status: 403 });

  const snap = await getAdminDb()
    .collection("deliveryPersons")
    .where("companyId", "==", actor.companyId)
    .get();

  const persons = snap.docs.map((d) => {
    const p = d.data() as DeliveryPerson;
    return {
      id: d.id,
      providerType: p.providerType ?? "COMPANY",
      role: p.role === "HUB_PERSON" ? "HUB_PERSON" : "RIDER",
      hubId: p.role === "HUB_PERSON" ? p.hubId ?? null : null,
      name: p.name,
      phone: p.phone,
      email: p.email,
      vehicleType: p.vehicleType ?? "",
      vehicleNumber: p.vehicleNumber ?? "",
      serviceArea: p.serviceArea ?? "",
      accountStatus: p.accountStatus ?? (p.status === "Inactive" ? "Suspended" : "Active"),
      availability: p.availability ?? "Offline",
    };
  });
  return Response.json({ companyId: actor.companyId, persons });
}

// POST — register a person the company has ALREADY created an Auth account for.
// Body: { uid, name, phone, email, vehicleType?, vehicleNumber?, serviceArea?,
//         city?, role?, hubId? }
//
// role defaults to "RIDER" when omitted (locked backward-compat default — see
// DeliveryPersonRole). "HUB_PERSON" REQUIRES hubId: a hub-person doc is never
// created without one. The named hub must exist, be Active, and belong to
// THIS company — a company can never station a person at another company's
// hub. A RIDER is never given a hubId, even if the client sends one.
export async function POST(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-persons-create", requester.uid, RL.max, RL.windowMs)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company")
    return Response.json({ error: "Only a delivery company can add delivery people." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const uid = str(body.uid, 128);
  const name = str(body.name);
  const phone = str(body.phone, 20);
  const email = str(body.email).toLowerCase();
  if (!uid || !name || !phone || !email)
    return Response.json({ error: "uid, name, phone and email are all required." }, { status: 400 });

  const rawRole = str(body.role, 20);
  if (rawRole && rawRole !== "RIDER" && rawRole !== "HUB_PERSON")
    return Response.json({ error: "role must be RIDER or HUB_PERSON." }, { status: 400 });
  const role: DeliveryPersonRole = rawRole === "HUB_PERSON" ? "HUB_PERSON" : "RIDER";

  const db = getAdminDb();

  // A uid can belong to exactly one delivery person, in exactly one provider.
  const existing = await db.collection("deliveryPersons").where("uid", "==", uid).limit(1).get();
  if (!existing.empty)
    return Response.json({ error: "This account is already registered as a delivery person." }, { status: 409 });

  // HUB_PERSON: hubId is REQUIRED (never optional) and must be one of THIS
  // company's own Active hubs. RIDER: hubId is always forced null, regardless
  // of anything the client sends.
  let hubId: string | null = null;
  if (role === "HUB_PERSON") {
    hubId = str(body.hubId, 128);
    if (!hubId) return Response.json({ error: "hubId is required for role HUB_PERSON." }, { status: 400 });
    const hubSnap = await db.collection("deliveryHubs").doc(hubId).get();
    if (!hubSnap.exists) return Response.json({ error: "Hub not found." }, { status: 404 });
    const hub = hubSnap.data() as DeliveryHub;
    if (hub.companyId !== actor.companyId)
      return Response.json({ error: "That hub belongs to another company." }, { status: 403 });
    if (hub.status !== "Active") return Response.json({ error: "That hub is not active." }, { status: 409 });
  }

  const now = Timestamp.now();
  const ref = await db.collection("deliveryPersons").add({
    providerType: "COMPANY",             // server-owned: never from the body
    companyId: actor.companyId,          // from the caller, never the body
    role,                                // server-validated above
    hubId,                               // null unless role is HUB_PERSON
    uid,
    name,
    phone,
    email,
    vehicleType: str(body.vehicleType, 40),
    vehicleNumber: str(body.vehicleNumber, 40),
    serviceArea: str(body.serviceArea),
    city: str(body.city, 80),
    accountStatus: "Active",             // company vouches for its own person
    availability: "Offline",            // operational state; person toggles it
    createdBy: actor.uid,                // the company owner uid
    status: "Active",                    // deprecated alias (one phase)
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ success: true, personId: ref.id, role, hubId });
}
