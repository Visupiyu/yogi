import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { mintSequential } from "@/lib/humanIds";

// ---------------------------------------------------------------------------
// Assign a YOMICO Delivery Company + Delivery Person to a REPLACEMENT request,
// mirroring the normal-order flow (YOMICO Admin -> Delivery Company -> Delivery
// Person). SERVER-AUTHORITATIVE and ADMIN-ONLY.
//
// itemRequests is create/update/delete:false for every client (firestore.rules),
// so this Admin-SDK route is the only way these delivery fields get written — no
// client write path is opened, no rule is weakened.
//
// What it writes (replace-type itemRequests only): deliveryCompanyId,
// deliveryCompanyName, deliveryPartnerId, deliveryPartnerName, assignedAt, and a
// FRESH shipmentNumber minted from the shared `shipment` counter (TRCK……). The
// replacement is its own physical shipment, so it NEVER reuses the parent
// order's shipmentNumber; the number is minted once and preserved across any
// later re-assignment of company/person.
//
// The delivery-person app/dashboard (Phase 2) is intentionally NOT wired here.
// This only records the assignment; the state machine, stock reservation and
// refund logic all live in the transition route and are untouched.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// A replacement can be assigned any time before it is physically out for
// delivery — i.e. while it is still with the seller. Terminal/delivered
// requests are refused so an assignment can't rewrite a finished shipment.
const ASSIGNABLE_STATUSES = new Set(["APPROVED", "READY_FOR_DELIVERY"]);

type AssignOutcome =
  | { kind: "ok"; shipmentNumber: string }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    // Admin-only, matching firestore.rules' isAdmin() (admin email AND a
    // verified email). A seller can never assign delivery.
    if (requester.isAdmin !== true) {
      return Response.json(
        { error: "Only an admin can assign delivery." },
        { status: 403 }
      );
    }

    if (
      !(await isWithinRateLimit(
        "item-request-assign-delivery",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: {
      requestId?: unknown;
      deliveryCompanyId?: unknown;
      deliveryPartnerId?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const requestId =
      typeof body.requestId === "string" ? body.requestId.trim() : "";
    const deliveryCompanyId =
      typeof body.deliveryCompanyId === "string"
        ? body.deliveryCompanyId.trim()
        : "";
    const deliveryPartnerId =
      typeof body.deliveryPartnerId === "string"
        ? body.deliveryPartnerId.trim()
        : "";

    if (!requestId || !deliveryCompanyId || !deliveryPartnerId) {
      return Response.json(
        { error: "A request, a delivery company and a delivery person are all required." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const reqRef = db.collection("itemRequests").doc(requestId);
    const companyRef = db.collection("deliveryCompanies").doc(deliveryCompanyId);
    const partnerRef = db.collection("deliveryPartners").doc(deliveryPartnerId);

    const outcome = await db.runTransaction<AssignOutcome>(async (tx) => {
      // ---- READS FIRST (before any write, incl. mintSequential's) ----
      const [reqSnap, companySnap, partnerSnap] = await Promise.all([
        tx.get(reqRef),
        tx.get(companyRef),
        tx.get(partnerRef),
      ]);

      if (!reqSnap.exists) {
        return { kind: "error", status: 404, error: "Request not found." };
      }
      const req = reqSnap.data() as {
        type?: string;
        status?: string;
        shipmentNumber?: string;
      };

      if (req.type !== "replace") {
        return {
          kind: "error",
          status: 400,
          error: "Delivery assignment applies only to replacement requests.",
        };
      }

      const status = req.status || "REQUESTED";
      if (!ASSIGNABLE_STATUSES.has(status)) {
        return {
          kind: "error",
          status: 409,
          error:
            "This replacement can only be assigned a delivery company while it is approved or being prepared.",
        };
      }

      // Active-company model: only an Active delivery company may be assigned.
      if (!companySnap.exists) {
        return { kind: "error", status: 404, error: "Delivery company not found." };
      }
      const company = companySnap.data() as { name?: string; status?: string };
      if (company.status !== "Active") {
        return {
          kind: "error",
          status: 409,
          error: "That delivery company is not active.",
        };
      }

      // Active-partner model: the person must be Active AND belong to the
      // selected company (the Delivery Company manages its own people).
      if (!partnerSnap.exists) {
        return { kind: "error", status: 404, error: "Delivery person not found." };
      }
      const partner = partnerSnap.data() as {
        name?: string;
        status?: string;
        companyId?: string;
      };
      if (partner.status !== "Active") {
        return {
          kind: "error",
          status: 409,
          error: "That delivery person is not active.",
        };
      }
      if (partner.companyId !== deliveryCompanyId) {
        return {
          kind: "error",
          status: 409,
          error: "That delivery person does not belong to the selected company.",
        };
      }

      // FRESH shipment number, minted once per replacement from the shared
      // `shipment` counter (never the parent order's). Preserved on re-assign.
      const shipmentNumber =
        typeof req.shipmentNumber === "string" && req.shipmentNumber
          ? req.shipmentNumber
          : await mintSequential(tx, db, "shipment");

      const now = Timestamp.now();
      tx.update(reqRef, {
        deliveryCompanyId,
        deliveryCompanyName: typeof company.name === "string" ? company.name : "",
        deliveryPartnerId,
        deliveryPartnerName: typeof partner.name === "string" ? partner.name : "",
        assignedAt: now,
        shipmentNumber,
        updatedAt: now,
      });

      return { kind: "ok", shipmentNumber };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    return Response.json({
      success: true,
      shipmentNumber: outcome.shipmentNumber,
    });
  } catch (error) {
    console.error("item-request/assign-delivery: unexpected failure:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
