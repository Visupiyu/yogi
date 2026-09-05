import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryPerson } from "@/lib/deliveryEngine/types";

// Company-scoped delivery-person management. Admin does NOT manage delivery
// people — a delivery COMPANY manages its own. Every operation is gated on the
// caller resolving to an Active company, and is confined to that company's own
// people (companyId is taken from the resolved caller, never from the body).
//
// Auth-user provisioning stays client-side (getSecondaryAuth +
// createUserWithEmailAndPassword, the same mechanism admin uses today) so no
// firebase-admin/auth is introduced. The client creates the Auth user, then
// POSTs the resulting uid here; the server writes the deliveryPersons doc.

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
      name: p.name,
      phone: p.phone,
      email: p.email,
      vehicleType: p.vehicleType ?? "",
      vehicleNumber: p.vehicleNumber ?? "",
      serviceArea: p.serviceArea ?? "",
      status: p.status,
    };
  });
  return Response.json({ companyId: actor.companyId, persons });
}

// POST — register a person the company has ALREADY created an Auth account for.
// Body: { uid, name, phone, email, vehicleType?, vehicleNumber?, serviceArea? }
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

  const db = getAdminDb();

  // A uid can belong to exactly one delivery person, in exactly one company.
  const existing = await db.collection("deliveryPersons").where("uid", "==", uid).limit(1).get();
  if (!existing.empty)
    return Response.json({ error: "This account is already registered as a delivery person." }, { status: 409 });

  const now = Timestamp.now();
  const ref = await db.collection("deliveryPersons").add({
    companyId: actor.companyId,          // from the caller, never the body
    uid,
    name,
    phone,
    email,
    vehicleType: str(body.vehicleType, 40),
    vehicleNumber: str(body.vehicleNumber, 40),
    serviceArea: str(body.serviceArea),
    status: "Active",
    createdBy: actor.uid,                // the company owner uid
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ success: true, personId: ref.id });
}
