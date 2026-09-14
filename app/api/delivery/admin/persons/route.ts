import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { buildAdminPersonRow } from "@/lib/deliveryEngine/adminProjections";
import type { DeliveryPerson } from "@/lib/deliveryEngine/types";

// Admin-provisioned YOMICO delivery persons.
//
//   GET  /api/delivery/admin/persons[?assignable=1]
//        List YOMICO persons; ?assignable=1 restricts to Active + Available
//        (the set an admin may hand a job to via assign-yomico).
//   POST /api/delivery/admin/persons  { uid, name, phone, email, ...optional }
//        Register a YOMICO person for a Firebase Auth uid the admin already
//        created. providerType/companyId/createdBy are SERVER-OWNED — the client
//        can never forge a COMPANY or a foreign companyId here.
//
// Admin only. No self-registration flow in this phase. Persons carry no secrets;
// responses are explicit allow-lists (buildAdminPersonRow).
const RL = { max: 60, windowMs: 10 * 60 * 1000 };
function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-persons-list", requester.uid, RL.max, RL.windowMs)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const url = new URL(request.url);
  const assignableOnly = url.searchParams.get("assignable") === "1";

  // Single-field query (providerType ==) — no composite index required.
  const snap = await getAdminDb()
    .collection("deliveryPersons")
    .where("providerType", "==", "YOMICO")
    .get();

  let persons = snap.docs.map((d) => buildAdminPersonRow(d.id, d.data() as DeliveryPerson));
  if (assignableOnly) {
    // Filter in memory to avoid a composite index (decision: no speculative indexes).
    persons = persons.filter((p) => p.accountStatus === "Active" && p.availability === "Available");
  }
  persons.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return Response.json({ persons });
}

export async function POST(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-persons-create", requester.uid, RL.max, RL.windowMs)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const uid = str(body.uid, 128);
  const name = str(body.name);
  const phone = str(body.phone, 20);
  const email = str(body.email).toLowerCase();
  if (!uid || !name || !phone || !email)
    return Response.json({ error: "uid, name, phone and email are all required." }, { status: 400 });

  const db = getAdminDb();

  // ---- READ (before write): one delivery person per uid, in exactly one provider ----
  const existing = await db.collection("deliveryPersons").where("uid", "==", uid).limit(1).get();
  if (!existing.empty)
    return Response.json({ error: "This account is already registered as a delivery person." }, { status: 409 });

  // ---- WRITE ----
  const now = Timestamp.now();
  const ref = await db.collection("deliveryPersons").add({
    providerType: "YOMICO", // server-owned: never from the body
    companyId: null,        // YOMICO persons carry no company (invariant)
    uid,
    name,
    phone,
    email,
    vehicleType: str(body.vehicleType, 40),
    vehicleNumber: str(body.vehicleNumber, 40),
    serviceArea: str(body.serviceArea),
    city: str(body.city, 80),
    accountStatus: "Active",   // admin vouches for a person it provisions
    availability: "Offline",   // operational state; the person toggles it
    approvedBy: requester.uid,
    approvedAt: now,
    createdBy: "yomico-admin",
    status: "Active",          // deprecated alias (one transition phase)
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ success: true, personId: ref.id });
}
