import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import type { DeliveryCompany, DeliveryHub } from "@/lib/deliveryEngine/types";

// Admin-managed company hubs (server-only collection deliveryHubs).
//
//   GET  /api/delivery/admin/hubs?companyId=...   list a company's hubs (admin)
//   POST /api/delivery/admin/hubs  { companyId, name, city?, region?, address? }  create
//
// `address` is optional (V1 navigation feature — see
// lib/deliveryEngine/taskLocation.ts's deriveNavigationDestination): a real
// street address a rider's map app can navigate to. Omitted/blank means this
// hub has none on file yet — NEVER invented or geocoded here or anywhere else;
// navigation to a hub with no address is reported to the mobile app as
// honestly unavailable instead.
//
// Admin only. A hub always belongs to exactly one company (companyId is stored
// server-side and is the authorization scope for every hub operation elsewhere).
// Clients never read/write deliveryHubs directly (firestore.rules deny it);
// company-side access happens through server APIs that scope by companyId.
function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-hubs-list", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const url = new URL(request.url);
  const companyId = str(url.searchParams.get("companyId"), 128);
  const col = getAdminDb().collection("deliveryHubs");
  // Single-field query (companyId ==) when scoped — no composite index needed.
  const snap = companyId ? await col.where("companyId", "==", companyId).get() : await col.get();

  const hubs = snap.docs.map((d) => {
    const h = d.data() as DeliveryHub;
    return {
      id: d.id,
      companyId: h.companyId,
      name: h.name,
      city: h.city ?? "",
      region: h.region ?? "",
      address: h.address ?? "",
      status: h.status,
    };
  });
  return Response.json({ hubs });
}

export async function POST(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-hubs-create", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const companyId = str(body.companyId, 128);
  const name = str(body.name);
  if (!companyId || !name) return Response.json({ error: "companyId and name are required." }, { status: 400 });

  const db = getAdminDb();
  // The company must exist (avoid orphan hubs for a non-existent company).
  const companySnap = await db.collection("deliveryCompanies").doc(companyId).get();
  if (!companySnap.exists) return Response.json({ error: "Delivery company not found." }, { status: 404 });
  void (companySnap.data() as DeliveryCompany);

  const now = Timestamp.now();
  const address = str(body.address, 200);
  const ref = await db.collection("deliveryHubs").add({
    companyId, // server-owned ownership scope
    name,
    city: str(body.city, 80),
    region: str(body.region, 80),
    // Optional; omitted entirely (not stored as "") when blank, so a hub with
    // no address on file stays indistinguishable from one created before this
    // field existed — both honestly report navigation as unavailable.
    ...(address ? { address } : {}),
    status: "Active",
    createdBy: requester.uid,
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ success: true, hubId: ref.id });
}
