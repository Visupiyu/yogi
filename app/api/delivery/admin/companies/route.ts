import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildAdminCompanyRow, type AdminCompanyRow } from "@/lib/deliveryEngine/adminProjections";
import type { DeliveryCompany } from "@/lib/deliveryEngine/types";

// GET /api/delivery/admin/companies[?all=1]
//
// Delivery companies for admin handoff pickers. Admin only. Default returns
// Active companies (the set an admin may hand a job to); ?all=1 returns every
// company. Explicit allow-list rows (buildAdminCompanyRow) — ownerUid is
// reduced to a boolean, no contact secrets exposed.
//
// where(status ==) is a single-field query (automatic index); no composite.
export async function GET(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-admin-companies", requester.uid, 120, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";

  const col = getAdminDb().collection("deliveryCompanies");
  const snap = all ? await col.get() : await col.where("status", "==", "Active").get();

  const companies: AdminCompanyRow[] = snap.docs
    .map((d) => buildAdminCompanyRow(d.id, d.data() as DeliveryCompany))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return Response.json({ companies });
}
