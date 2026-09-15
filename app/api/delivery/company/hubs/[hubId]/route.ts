import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import type { DeliveryHub } from "@/lib/deliveryEngine/types";

// PATCH /api/delivery/company/hubs/[hubId]   { status: "Active" | "Inactive" }
//
// A company activates/deactivates ONE of its OWN hubs. Ownership is enforced by
// comparing the target hub's companyId to the caller's SERVER-resolved company —
// a company can never touch another company's hub, and companyId is never taken
// from the client. deliveryHubs is client-unwritable by firestore.rules; this is
// the company-side path via the Admin SDK.
//
// Multiple active hubs are allowed — activating a hub never demotes another.
// Which hub a job uses is chosen per-job on the Job Card. Only the status is
// mutable here; an Inactive hub is simply not offered for NEW job selections
// (existing jobs already referencing a hub keep working).

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ hubId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!(await isWithinRateLimit("delivery-company-hubs-update", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const actor = await resolveDeliveryActor(requester.uid, requester.email);
  if (actor.role !== "company" || !actor.companyId)
    return Response.json({ error: "Only a delivery company can manage its hubs." }, { status: 403 });
  const companyId = actor.companyId;

  const { hubId } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const status = str(body.status, 12);
  if (status !== "Active" && status !== "Inactive")
    return Response.json({ error: "status must be Active or Inactive." }, { status: 400 });

  const db = getAdminDb();
  const hubRef = db.collection("deliveryHubs").doc(hubId);

  const outcome = await db.runTransaction<{ error?: string; code?: number; ok?: boolean }>(async (tx) => {
    const snap = await tx.get(hubRef);
    if (!snap.exists) return { error: "Hub not found.", code: 404 };
    const hub = snap.data() as DeliveryHub;
    // Ownership: the hub must belong to the caller's company.
    if (hub.companyId !== companyId) return { error: "That hub belongs to another company.", code: 403 };

    const now = Timestamp.now();
    // Multiple active hubs are allowed — activating one never demotes another.
    tx.update(hubRef, { status, updatedAt: now });
    return { ok: true };
  });

  if (outcome.error) return Response.json({ error: outcome.error }, { status: outcome.code ?? 400 });
  return Response.json({ success: true });
}
