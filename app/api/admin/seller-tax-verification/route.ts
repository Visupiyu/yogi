import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { isValidGstin } from "@/lib/sellerTax";

// ---------------------------------------------------------------------------
// ADMIN seller GST/Tax verification.
//   POST /api/admin/seller-tax-verification  { vendorId, action, reason? }
//   action: "VERIFY" | "REJECT"
//
// Server-authoritative, ADMIN-ONLY. Sets taxVerificationStatus (+ decision
// timestamp, deciding admin identity, and rejection reason) on the vendor
// document via the Admin SDK. This is the ONLY path to VERIFIED. A seller can
// never reach VERIFIED themselves (firestore.rules pin taxVerificationStatus and
// the verification-result fields against seller writes).
//
// Verification applies ONLY to REGISTERED / COMPOSITION sellers. UNREGISTERED
// sellers require no GST verification to list (existing policy in lib/sellerTax),
// so this route refuses to "verify" one. Turnover is never requested or stored.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    // Authorization is enforced SERVER-SIDE from the verified token — never a
    // client-supplied uid/role. isAdmin matches firestore.rules' isAdmin().
    if (!requester.isAdmin) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    if (
      !(await isWithinRateLimit(
        "admin-tax-verification",
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const vendorId = typeof body.vendorId === "string" ? body.vendorId.trim() : "";
    const action =
      typeof body.action === "string" ? body.action.trim().toUpperCase() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!vendorId) {
      return Response.json({ error: "Missing vendor id." }, { status: 400 });
    }
    if (action !== "VERIFY" && action !== "REJECT") {
      return Response.json({ error: "Invalid action." }, { status: 400 });
    }
    if (action === "REJECT" && !reason) {
      return Response.json(
        { error: "A rejection reason is required." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const vendorRef = db.collection("vendors").doc(vendorId);
    const snap = await vendorRef.get();
    if (!snap.exists) {
      return Response.json({ error: "Vendor not found." }, { status: 404 });
    }
    const vendor = snap.data() as {
      taxProfile?: { gstStatus?: string; gstin?: string };
      taxVerificationStatus?: string;
    };

    const gstStatus = vendor.taxProfile?.gstStatus;
    // Only Registered / Composition are verifiable. Unregistered (or no profile)
    // needs no GST verification to list — refuse a meaningless verification.
    if (gstStatus !== "REGISTERED" && gstStatus !== "COMPOSITION") {
      return Response.json(
        {
          error:
            "GST verification applies only to Registered or Composition sellers. Unregistered sellers do not require verification to list.",
        },
        { status: 409 }
      );
    }

    const current = vendor.taxVerificationStatus || "PENDING";

    // No meaningless duplicate transitions.
    if (action === "VERIFY" && current === "VERIFIED") {
      return Response.json(
        { error: "This seller is already verified." },
        { status: 409 }
      );
    }
    if (action === "REJECT" && current === "REJECTED") {
      return Response.json(
        { error: "This seller is already rejected." },
        { status: 409 }
      );
    }
    // Preserve the listing policy: a valid GSTIN is required before VERIFIED
    // (canSellerList requires valid GSTIN + VERIFIED for Registered/Composition).
    if (action === "VERIFY" && !isValidGstin(vendor.taxProfile?.gstin)) {
      return Response.json(
        { error: "Cannot verify: the seller's GSTIN is missing or invalid." },
        { status: 409 }
      );
    }

    const now = Timestamp.now();
    const newStatus = action === "VERIFY" ? "VERIFIED" : "REJECTED";
    await vendorRef.update({
      taxVerificationStatus: newStatus,
      taxVerifiedAt: now, // decision time (verify OR reject)
      taxVerifiedBy: requester.email || requester.uid, // deciding admin identity
      taxRejectionReason: action === "REJECT" ? reason.slice(0, 1000) : "",
      updatedAt: now,
    });

    // Append-only audit — same collection/shape as lib/auditLog.logAdminAction,
    // written server-side here. Best-effort: never fail the decision over a log.
    try {
      await db.collection("audit_logs").add({
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: action === "VERIFY" ? "seller_tax_verified" : "seller_tax_rejected",
        targetId: vendorId,
        details: {
          gstStatus,
          ...(action === "REJECT" ? { reason: reason.slice(0, 1000) } : {}),
        },
        createdAt: now,
      });
    } catch (auditError) {
      console.error("seller tax verification audit log failed:", auditError);
    }

    return Response.json({
      success: true,
      taxVerificationStatus: newStatus,
      taxVerifiedAt: now.toDate().toISOString(),
      taxVerifiedBy: requester.email || requester.uid,
      taxRejectionReason: action === "REJECT" ? reason.slice(0, 1000) : "",
    });
  } catch (error) {
    console.error("seller tax verification failed:", error);
    return Response.json(
      { error: "Could not update the seller's tax verification." },
      { status: 500 }
    );
  }
}
