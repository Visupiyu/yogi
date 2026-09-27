import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import {
  CHANGE_SECTION_LABELS,
  diffSection,
  isChangeSection,
  isOwnKycDocumentPath,
  sectionRequiresDocument,
  validateSectionValues,
} from "@/lib/sellerBusiness";
import { CHANGE_REQUESTS, findSellerVendor } from "@/lib/sellerBusinessServer";

// ---------------------------------------------------------------------------
// POST /api/seller/business/change-request — a seller asks to change their
// business identity, contact, address or bank/payout details.
//
//   { action: "submit", section, values, idempotencyKey, documentPath? }
//   { action: "cancel", requestId }
//
// The change is NOT applied here. It is validated (lib/sellerBusiness), the
// fields that actually change are recorded with their current values, and a
// PENDING vendorChangeRequests document is created for an admin to approve or
// reject (app/api/admin/business-change-requests). firestore.rules keep these
// fields frozen for the seller once KYC is approved, so this is the only way
// they move.
//
//   - identity is the verified token; the vendor record is looked up by it;
//   - a bank change must carry proof uploaded to the seller's OWN KYC folder;
//   - one open request per section; the request id is deterministic per
//     (seller, idempotency key), so a double submit creates one request;
//   - an audit_logs entry records WHICH fields were asked for — never values.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return bad("Please sign in.", 401);
    if (
      !(await isWithinRateLimit("seller-business-change", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))
    ) {
      return bad("Too many requests. Please try again shortly.", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid request body.");
    const input = body as Record<string, unknown>;
    const db = getAdminDb();
    const uid = requester.uid;

    // ------------------------------------------------------------ cancel ----
    if (input.action === "cancel") {
      const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
      if (!requestId || requestId.length > 200 || requestId.includes("/")) {
        return bad("Missing request id.");
      }
      const ref = db.collection(CHANGE_REQUESTS).doc(requestId);
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // Another seller's request looks exactly like a missing one.
        if (!snap.exists || snap.data()?.vendorUid !== uid) return "not-found" as const;
        if (snap.data()?.status !== "PENDING") return "not-pending" as const;
        const now = Timestamp.now();
        tx.update(ref, { status: "CANCELLED", cancelledAt: now, updatedAt: now });
        return "cancelled" as const;
      });
      if (outcome === "not-found") return bad("Request not found.", 404);
      if (outcome === "not-pending") return bad("Only a pending request can be cancelled.", 409);
      return Response.json({ success: true, status: "CANCELLED" });
    }

    // ------------------------------------------------------------ submit ----
    if (input.action !== "submit") return bad("Unknown action.");

    const section = input.section;
    if (!isChangeSection(section)) return bad("Choose what you want to change.");

    const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!KEY_PATTERN.test(idempotencyKey)) return bad("Missing request key.");

    const validation = validateSectionValues(section, input.values);
    if (!validation.ok) return bad(validation.errors[0], 400, { errors: validation.errors });

    let documentPath: string | null = null;
    if (sectionRequiresDocument(section)) {
      if (!isOwnKycDocumentPath(uid, input.documentPath)) {
        return bad("Upload a cancelled cheque or bank statement for the new account.");
      }
      documentPath = input.documentPath;
    } else if (input.documentPath !== undefined) {
      return bad("A document is only needed for a bank change.");
    }

    const ref = db.collection(CHANGE_REQUESTS).doc(`${uid}_${idempotencyKey}`);

    type Outcome =
      | { kind: "already"; status: string }
      | { kind: "key-conflict" }
      | { kind: "no-vendor" }
      | { kind: "duplicate" }
      | { kind: "blocked" }
      | { kind: "no-change" }
      | { kind: "pending-exists" }
      | { kind: "created"; fields: string[] };

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      // ---- ALL READS FIRST ----
      const existing = await tx.get(ref);
      if (existing.exists) {
        const d = existing.data() || {};
        return d.vendorUid === uid && d.section === section
          ? { kind: "already", status: String(d.status || "PENDING") }
          : { kind: "key-conflict" };
      }

      const vendor = await findSellerVendor(db, uid, tx);
      if (vendor.kind === "none") return { kind: "no-vendor" };
      if (vendor.kind === "duplicate") return { kind: "duplicate" };
      if (vendor.data.status === "Blocked") return { kind: "blocked" };

      const pending = await tx.get(
        db.collection(CHANGE_REQUESTS).where("vendorUid", "==", uid).where("status", "==", "PENDING")
      );
      if (pending.docs.some((d) => d.data()?.section === section)) return { kind: "pending-exists" };

      const { changes, previous } = diffSection(section, vendor.data, validation.values);
      const fields = Object.keys(changes);
      if (fields.length === 0) return { kind: "no-change" };

      // ---- WRITES ----
      const now = Timestamp.now();
      const vendorName =
        typeof vendor.data.businessName === "string" ? vendor.data.businessName : "";
      tx.create(ref, {
        vendorUid: uid,
        vendorDocId: vendor.ref.id,
        vendorName,
        section,
        changes,
        previous,
        ...(documentPath ? { documentPath } : {}),
        status: "PENDING",
        idempotencyKey,
        requestedByEmail: requester.email || "",
        createdAt: now,
        updatedAt: now,
      });
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: uid,
        actorEmail: requester.email || "",
        action: "vendor_business_change_requested",
        targetId: vendor.ref.id,
        details: { requestId: ref.id, section, fields },
        createdAt: now,
      });
      tx.set(db.collection("notifications").doc(`vendor_change_${ref.id}`), {
        title: "Seller business change request",
        message: `${vendorName || "A seller"} requested a ${CHANGE_SECTION_LABELS[section].toLowerCase()} change`,
        role: "admin",
        type: "vendor",
        read: false,
        createdAt: now,
      });
      return { kind: "created", fields };
    });

    switch (outcome.kind) {
      case "already":
        return Response.json({ success: true, alreadySubmitted: true, requestId: ref.id, status: outcome.status });
      case "key-conflict":
        return bad("This request key was already used.", 409);
      case "no-vendor":
        return bad("No seller account found for this login.", 403);
      case "duplicate":
        return bad("More than one seller record exists for this login. Please contact support.", 409);
      case "blocked":
        return bad("Your seller account is blocked. Please contact support.", 403);
      case "no-change":
        return bad("Nothing to change — these are already your current details.");
      case "pending-exists":
        return bad("You already have a pending request for this section. Cancel it first to submit a new one.", 409);
      default:
        return Response.json({ success: true, requestId: ref.id, status: "PENDING", fields: outcome.fields });
    }
  } catch (error) {
    console.error("seller-business change request failed:", error);
    return bad("Could not submit your request. Please try again.", 500);
  }
}
