import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import {
  CHANGE_REQUEST_STATUSES,
  CHANGE_SECTIONS,
  PUBLIC_MIRROR_FIELDS,
  isChangeSection,
  storedValue,
  validateSectionValues,
} from "@/lib/sellerBusiness";
import {
  CHANGE_REQUESTS,
  adminRequestView,
  newestFirst,
} from "@/lib/sellerBusinessServer";

// ---------------------------------------------------------------------------
// ADMIN review of seller business-change requests.
//
//   GET  /api/admin/business-change-requests?status=PENDING|APPROVED|REJECTED|CANCELLED|ALL
//   POST /api/admin/business-change-requests  { requestId, action: "APPROVE"|"REJECT", reason? }
//
// Admin only, from the verified token. APPROVE applies the recorded change to
// the seller's vendors document (and the storefront mirror, vendors_public,
// for the display fields it carries) in ONE transaction with the request's
// status and an audit_logs entry — and only if every field still holds the
// value it had when the seller asked, so an approval can never overwrite a
// change made in between. REJECT requires a reason, which the seller sees.
//
// No money field is read or written: payouts, settlement, commission and GST
// calculations are untouched.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

async function authorize(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return { error: bad("Please sign in.", 401) } as const;
  if (requester.isAdmin !== true) return { error: bad("Not authorized.", 403) } as const;
  if (
    !(await isWithinRateLimit("admin-business-change", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))
  ) {
    return { error: bad("Too many requests. Please try again shortly.", 429) } as const;
  }
  return { requester } as const;
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const status = (new URL(request.url).searchParams.get("status") || "PENDING").trim().toUpperCase();
    if (status !== "ALL" && !(CHANGE_REQUEST_STATUSES as readonly string[]).includes(status)) {
      return bad("Invalid status.");
    }
    const db = getAdminDb();
    const col = db.collection(CHANGE_REQUESTS);
    const snap = status === "ALL" ? await col.get() : await col.where("status", "==", status).get();
    const requests = [...snap.docs].sort(newestFirst).slice(0, 200).map(adminRequestView);
    return Response.json({ requests });
  } catch (error) {
    console.error("admin business-change list failed:", error);
    return bad("Could not load change requests.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;
    const { requester } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid request body.");
    const input = body as Record<string, unknown>;

    const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
    if (!requestId || requestId.length > 200 || requestId.includes("/")) return bad("Missing request id.");
    const action = typeof input.action === "string" ? input.action.trim().toUpperCase() : "";
    if (action !== "APPROVE" && action !== "REJECT") return bad("Invalid action.");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (action === "REJECT" && (reason.length < 3 || reason.length > 500)) {
      return bad("A rejection reason (3–500 characters) is required.");
    }

    const db = getAdminDb();
    const ref = db.collection(CHANGE_REQUESTS).doc(requestId);

    type Outcome =
      | { kind: "not-found" }
      | { kind: "decided"; status: string }
      | { kind: "vendor-missing" }
      | { kind: "invalid" }
      | { kind: "stale"; fields: string[] }
      | { kind: "done"; status: "APPROVED" | "REJECTED" };

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      // ---- ALL READS FIRST ----
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: "not-found" };
      const req = snap.data() || {};
      if (req.status !== "PENDING") return { kind: "decided", status: String(req.status) };

      const now = Timestamp.now();
      const decision = {
        decidedAt: now,
        decidedBy: requester.uid,
        decidedByEmail: requester.email || "",
        updatedAt: now,
      };

      if (action === "REJECT") {
        tx.update(ref, { ...decision, status: "REJECTED", decisionReason: reason });
        tx.set(db.collection("audit_logs").doc(), {
          actorUid: requester.uid,
          actorEmail: requester.email || "",
          action: "vendor_business_change_rejected",
          targetId: String(req.vendorDocId || ""),
          details: { requestId, section: req.section, reason },
          createdAt: now,
        });
        return { kind: "done", status: "REJECTED" };
      }

      const section = req.section;
      const vendorDocId = typeof req.vendorDocId === "string" ? req.vendorDocId : "";
      const vendorUid = typeof req.vendorUid === "string" ? req.vendorUid : "";
      if (!isChangeSection(section) || !vendorDocId || !vendorUid) return { kind: "invalid" };
      const vendorRef = db.collection("vendors").doc(vendorDocId);
      const publicRef = db.collection("vendors_public").doc(vendorUid);
      const [vendorSnap, publicSnap] = await Promise.all([tx.get(vendorRef), tx.get(publicRef)]);
      const vendor = vendorSnap.data() || {};
      if (!vendorSnap.exists || vendor.uid !== vendorUid) return { kind: "vendor-missing" };

      const changes = (req.changes || {}) as Record<string, unknown>;
      const previous = (req.previous || {}) as Record<string, unknown>;
      const fields = Object.keys(changes).filter((f) =>
        (CHANGE_SECTIONS[section] as readonly string[]).includes(f)
      );
      if (fields.length === 0 || fields.length !== Object.keys(changes).length) return { kind: "invalid" };

      // Re-validate the section as it will be stored (defence in depth).
      const merged: Record<string, string> = {};
      for (const f of CHANGE_SECTIONS[section]) {
        merged[f] = f in changes ? String(changes[f]) : storedValue(vendor, f);
      }
      if (!validateSectionValues(section, merged).ok) return { kind: "invalid" };

      // Never overwrite a value that moved since the seller asked.
      const stale = fields.filter((f) => storedValue(vendor, f) !== String(previous[f] ?? ""));
      if (stale.length) return { kind: "stale", fields: stale };

      // ---- WRITES ----
      const applied: Record<string, string> = {};
      for (const f of fields) applied[f] = String(changes[f]);
      tx.update(vendorRef, {
        ...applied,
        businessDetailsUpdatedAt: now,
        ...(section === "bank"
          ? {
              bankDetailsUpdatedAt: now,
              ...(typeof req.documentPath === "string" ? { bankProofPath: req.documentPath } : {}),
            }
          : {}),
      });
      const mirror: Record<string, string> = {};
      for (const f of fields) if ((PUBLIC_MIRROR_FIELDS as readonly string[]).includes(f)) mirror[f] = applied[f];
      if (publicSnap.exists && Object.keys(mirror).length) {
        tx.update(publicRef, { ...mirror, updatedAt: now });
      }
      tx.update(ref, { ...decision, status: "APPROVED" });
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: "vendor_business_change_approved",
        targetId: vendorDocId,
        details: { requestId, section, fields },
        createdAt: now,
      });
      return { kind: "done", status: "APPROVED" };
    });

    switch (outcome.kind) {
      case "not-found":
        return bad("Request not found.", 404);
      case "decided":
        return bad(`This request is already ${outcome.status.toLowerCase()}.`, 409, { status: outcome.status });
      case "vendor-missing":
        return bad("The seller record for this request no longer matches.", 409);
      case "invalid":
        return bad("This request is not valid and cannot be approved. Reject it instead.", 409);
      case "stale":
        return bad(
          "The seller's details changed after this request was made. Reject it and ask the seller to resubmit.",
          409,
          { fields: outcome.fields }
        );
      default:
        return Response.json({ success: true, status: outcome.status });
    }
  } catch (error) {
    console.error("admin business-change decision failed:", error);
    return bad("Could not save this decision.", 500);
  }
}
