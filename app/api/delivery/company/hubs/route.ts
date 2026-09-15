import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryHub } from "@/lib/deliveryEngine/types";

// GET  /api/delivery/company/hubs   → the caller's OWN hubs (read-only)
// POST /api/delivery/company/hubs   → create a hub for the caller's company
//
// Company-only. The companyId is ALWAYS resolved SERVER-SIDE from the verified
// token (resolveDeliveryActor) and is the sole ownership scope — a company can
// never read or create another company's hubs, and a client-supplied companyId
// is never trusted. deliveryHubs is client-unreadable/unwritable by
// firestore.rules; this is the company-side path via the Admin SDK (the same
// established pattern as the admin hubs route and company persons route).
//
// The stored `address` is the physical hub address the Delivery Engine's
// navigation/task derivation already uses (lib/deliveryEngine/taskLocation.ts).
// State is stored in the existing `region` field; `pincode` is an additive
// record-only field. Reuses the EXISTING deliveryHubs collection/model — no
// second hub collection is introduced.
//
// Multiple active hubs: a company may operate many hubs simultaneously (jobs
// flow through different hubs). New hubs are Active by default; hubs are toggled
// Active/Inactive independently with NO automatic demotion. The specific hub a
// job uses is chosen per-job on the Job Card and stored on the delivery job;
// only Active hubs are offered for new selections.

const HUB_STATUSES = new Set(["Active", "Inactive"]);

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

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
    return {
      id: d.id,
      name: h.name,
      address: h.address ?? "",
      city: h.city ?? "",
      region: h.region ?? "", // the hub's state/region
      pincode: h.pincode ?? "",
      status: h.status,
    };
  });
  return Response.json({ companyId: actor.companyId, hubs });
}

export async function POST(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-hubs-create", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company" || !actor.companyId)
    return Response.json({ error: "Only a delivery company can add a hub." }, { status: 403 });
  const companyId = actor.companyId; // server-owned ownership scope; never from the client

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const name = str(body.name, 120);
  const address = str(body.address, 300);
  const city = str(body.city, 80);
  const region = str(body.state, 80); // form "State" → existing region field
  const pincode = str(body.pincode, 12);
  const statusIn = str(body.status, 12) || "Active";

  if (!name) return Response.json({ error: "Hub name is required." }, { status: 400 });
  if (!address) return Response.json({ error: "A complete hub address is required." }, { status: 400 });
  if (!city) return Response.json({ error: "City is required." }, { status: 400 });
  if (!region) return Response.json({ error: "State is required." }, { status: 400 });
  if (!/^\d{6}$/.test(pincode)) return Response.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  if (!HUB_STATUSES.has(statusIn)) return Response.json({ error: "Invalid status." }, { status: 400 });
  const status = statusIn as DeliveryHub["status"];

  const db = getAdminDb();
  const outcome = await db.runTransaction<{ error?: string; code?: number; hubId?: string }>(async (tx) => {
    // READS FIRST: the company's existing hubs (dedupe by name + single-active).
    const existing = await tx.get(db.collection("deliveryHubs").where("companyId", "==", companyId));
    const dupe = existing.docs.some(
      (d) => str((d.data() as DeliveryHub).name, 120).toLowerCase() === name.toLowerCase()
    );
    if (dupe) return { error: "A hub with this name already exists.", code: 409 };

    const now = Timestamp.now();
    // Multiple active hubs are allowed — new hubs are Active by default and there
    // is NO automatic demotion of any other hub. Which hub a job uses is chosen
    // per-job on the Job Card.
    const ref = db.collection("deliveryHubs").doc();
    tx.set(ref, {
      companyId,
      name,
      address,
      city,
      region,
      ...(pincode ? { pincode } : {}),
      status,
      createdBy: requester.uid,
      createdAt: now,
      updatedAt: now,
    });
    return { hubId: ref.id };
  });

  if (outcome.error) return Response.json({ error: outcome.error }, { status: outcome.code ?? 400 });
  return Response.json({ success: true, hubId: outcome.hubId });
}
