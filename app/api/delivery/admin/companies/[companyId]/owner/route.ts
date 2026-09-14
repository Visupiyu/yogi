import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { decideOwnerAssignment } from "@/lib/deliveryEngine/companyOwner";
import { buildAdminCompanyRow } from "@/lib/deliveryEngine/adminProjections";
import type { DeliveryCompany } from "@/lib/deliveryEngine/types";

// POST /api/delivery/admin/companies/[companyId]/owner   { ownerUid }
//
// Admin-only: associate an existing Firebase Auth uid with a delivery company as
// its owner (the login identity resolveDeliveryActor recognises). This does NOT
// create a Firebase Auth account and does NOT touch money/status/execution. The
// company is selected by path companyId; the uid is supplied explicitly. It
// refuses to silently overwrite a different existing owner, refuses a uid that
// already owns another company, and refuses a uid that is a delivery person.
//
// All reads (company + cross-company owner + person existence) happen before the
// single write, inside one transaction. Idempotent when the same owner is
// re-assigned. Response is an allow-list (ownerUid never echoed raw).
function str(v: unknown, max = 128): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ companyId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("delivery-admin-company-owner", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const { companyId } = await ctx.params;
    let body: { ownerUid?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const ownerUid = str(body.ownerUid, 128);
    if (!ownerUid) return Response.json({ error: "ownerUid is required." }, { status: 400 });

    const db = getAdminDb();
    const companyRef = db.collection("deliveryCompanies").doc(companyId);

    const outcome = await db.runTransaction(async (tx) => {
      // ---- READS (before any write) ----
      const companySnap = await tx.get(companyRef);
      const otherOwnerSnap = await tx.get(
        db.collection("deliveryCompanies").where("ownerUid", "==", ownerUid).limit(2)
      );
      const personSnap = await tx.get(
        db.collection("deliveryPersons").where("uid", "==", ownerUid).limit(1)
      );

      const company = companySnap.exists ? (companySnap.data() as DeliveryCompany) : null;
      const ownerUidOwnsOtherCompany = otherOwnerSnap.docs.some((d) => d.id !== companyId);

      const decision = decideOwnerAssignment({
        companyExists: companySnap.exists,
        currentOwnerUid: (company?.ownerUid as string | undefined) ?? null,
        ownerUid,
        ownerUidOwnsOtherCompany,
        ownerUidIsDeliveryPerson: !personSnap.empty,
      });

      if (!decision.ok) return { kind: "error" as const, status: decision.status, error: decision.error };

      // ---- WRITE ----
      const now = Timestamp.now();
      if (decision.action === "set") {
        tx.update(companyRef, { ownerUid, ownerAssignedBy: requester.uid, updatedAt: now });
      }
      return {
        kind: "ok" as const,
        action: decision.action,
        company: { ...(company as DeliveryCompany), ownerUid },
      };
    });

    if (outcome.kind === "error") return Response.json({ error: outcome.error }, { status: outcome.status });

    return Response.json({
      success: true,
      action: outcome.action, // "set" | "noop"
      company: buildAdminCompanyRow(companyId, outcome.company), // allow-list: hasOwner, no raw ownerUid
    });
  } catch (error) {
    console.error("delivery admin company owner assignment failed:", error);
    return Response.json({ error: "Could not assign the company owner." }, { status: 500 });
  }
}
