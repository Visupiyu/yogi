import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { decideOwnerAssignment } from "@/lib/deliveryEngine/companyOwner";
import type { DeliveryCompany } from "@/lib/deliveryEngine/types";

// ---------------------------------------------------------------------------
// POST /api/delivery/admin/company-applications/[appId]/approve
//
// Admin-only. Approves a Pending deliveryCompanyApplications record by:
//   1. creating the operational deliveryCompanies record (status "Active"),
//   2. tying ownerUid to the applicant's EXISTING Auth uid via the same
//      guardrails as the owner-provisioning route (decideOwnerAssignment:
//      refuses a uid that already owns another company or is a delivery person),
//   3. marking the application Approved with reviewer + createdCompanyId.
//
// deliveryCompanies is server-only (firestore.rules write:false), which is why
// this lives in a server route. No Auth account is created here — the applicant
// uid is reused. Bank details, GST, the cheque path, the business address and
// the authorised-person block are NOT copied into deliveryCompanies; they remain
// in the application for audit only. Idempotent: a re-approval of an already
// approved application returns its existing company without creating a second.
// ---------------------------------------------------------------------------

function s(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(request: Request, ctx: { params: Promise<{ appId: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("delivery-company-approve", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const { appId } = await ctx.params;
    const db = getAdminDb();
    const appRef = db.collection("deliveryCompanyApplications").doc(appId);

    // Read the application up front for validation + the (stable) new company id.
    const preSnap = await appRef.get();
    if (!preSnap.exists) return Response.json({ error: "Application not found." }, { status: 404 });
    const pre = preSnap.data() as Record<string, unknown>;

    if (pre.status === "Rejected") {
      return Response.json({ error: "This application was rejected and cannot be approved." }, { status: 409 });
    }
    const ownerUid = s(pre.uid, 128);
    if (!ownerUid) return Response.json({ error: "Application has no applicant identity." }, { status: 409 });

    // Already approved → return the existing company (idempotent no-op).
    if (pre.status === "Approved" && typeof pre.createdCompanyId === "string" && pre.createdCompanyId) {
      return Response.json({ success: true, alreadyApproved: true, companyId: pre.createdCompanyId });
    }

    // Stable company id, generated once and reused across transaction retries.
    const companyRef = db.collection("deliveryCompanies").doc();
    const companyId = companyRef.id;

    const contact = (pre.contact as { email?: unknown; phone?: unknown } | undefined) ?? undefined;
    const companyName = s(pre.companyName);
    const legalName = s(pre.legalName);
    const contactEmail = s(pre.contactEmail, 200) || (contact ? s(contact.email, 200) : "");
    const contactPhone = s(pre.contactPhone, 40) || (contact ? s(contact.phone, 40) : "");
    const serviceAreas = Array.isArray(pre.serviceAreas)
      ? (pre.serviceAreas as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 120)).slice(0, 50)
      : [];

    const outcome = await db.runTransaction(async (tx) => {
      // ---- READS (before any write) ----
      const appSnap = await tx.get(appRef);
      if (!appSnap.exists) return { kind: "error" as const, status: 404, error: "Application not found." };
      const app = appSnap.data() as Record<string, unknown>;

      // Re-check under contention: another concurrent approval already ran.
      if (app.status === "Approved" && typeof app.createdCompanyId === "string" && app.createdCompanyId) {
        return { kind: "ok" as const, companyId: app.createdCompanyId, created: false };
      }
      if (app.status === "Rejected") {
        return { kind: "error" as const, status: 409, error: "This application was rejected and cannot be approved." };
      }

      const otherOwnerSnap = await tx.get(
        db.collection("deliveryCompanies").where("ownerUid", "==", ownerUid).limit(2)
      );
      const personSnap = await tx.get(
        db.collection("deliveryPersons").where("uid", "==", ownerUid).limit(1)
      );

      // Same guardrails as the owner-provisioning route.
      const decision = decideOwnerAssignment({
        companyExists: true, // we are creating it in this same transaction
        currentOwnerUid: null,
        ownerUid,
        ownerUidOwnsOtherCompany: otherOwnerSnap.docs.some((d) => d.id !== companyId),
        ownerUidIsDeliveryPerson: !personSnap.empty,
      });
      if (!decision.ok) return { kind: "error" as const, status: decision.status, error: decision.error };

      // ---- WRITES ----
      const now = Timestamp.now();
      const company: DeliveryCompany = {
        name: companyName || "Delivery Company",
        legalName: legalName || undefined,
        status: "Active", // approved companies are operational
        ownerUid,
        contact: { email: contactEmail, phone: contactPhone },
        serviceAreas,
        approvedBy: requester.uid,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      // NOTE: no bank / GST / cheque path / business address / authorised-person
      // fields are written here — those stay in the application only.
      tx.set(companyRef, { ...company, ownerAssignedBy: requester.uid });
      tx.update(appRef, {
        status: "Approved",
        reviewedBy: requester.uid,
        reviewedAt: now,
        createdCompanyId: companyId,
        updatedAt: now,
      });
      return { kind: "ok" as const, companyId, created: true };
    });

    if (outcome.kind === "error") return Response.json({ error: outcome.error }, { status: outcome.status });
    return Response.json({ success: true, companyId: outcome.companyId, created: outcome.created });
  } catch (error) {
    console.error("delivery company application approval failed:", error);
    return Response.json({ error: "Could not approve this application." }, { status: 500 });
  }
}
