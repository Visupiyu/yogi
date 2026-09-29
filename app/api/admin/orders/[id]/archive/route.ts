import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";
import { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// POST /api/admin/orders/{orderId}/archive  { reason? }
//
// ADMIN-ONLY replacement for deleting an order. firestore.rules denies every
// client delete on orders, and the archive marker (archived, archivedAt,
// archivedBy, archiveReason) is writable only here, through the Admin SDK.
//
// Archiving KEEPS the order document exactly as it is and only adds the
// marker, so the seller records, coupon claims, return requests and ledger
// rows that point at it stay resolvable. The marker and an order_archived
// audit_logs entry are written in ONE transaction: an archive can never exist
// without its audit record. Archiving is one-way here and not repeatable (a
// second call is refused, so there is exactly one audit entry per archive).
//
// This route changes nothing else: no status, stock, points, coupon, refund
// or seller money. What an archived order should mean for those is a separate
// decision.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REASON_LENGTH = 500;

type Outcome =
  | { kind: "ok" }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (!requester.isAdmin) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    if (!(await isWithinRateLimit("admin-order-archive", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const { id } = await ctx.params;
    if (!isValidDocId(id)) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    // The body is optional; when present, reason must be a short string.
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    const rawReason = body?.reason;
    if (rawReason !== undefined && rawReason !== null && typeof rawReason !== "string") {
      return Response.json({ error: "reason must be text." }, { status: 400 });
    }
    const reason = typeof rawReason === "string" ? rawReason.trim() : "";
    if (reason.length > MAX_REASON_LENGTH) {
      return Response.json({ error: `reason must be at most ${MAX_REASON_LENGTH} characters.` }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(id);

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        return { kind: "error", status: 404, error: "Order not found." };
      }
      const order = snap.data() as {
        archived?: unknown;
        status?: unknown;
        paymentMethod?: unknown;
        paymentStatus?: unknown;
      };
      if (order.archived === true) {
        return { kind: "error", status: 409, error: "This order is already archived." };
      }

      const now = Timestamp.now();
      tx.update(orderRef, {
        archived: true,
        archivedAt: now,
        archivedBy: requester.uid,
        archiveReason: reason,
      });
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: "order_archived",
        targetId: id,
        details: {
          reason,
          status: typeof order.status === "string" ? order.status : null,
          paymentMethod: typeof order.paymentMethod === "string" ? order.paymentMethod : null,
          paymentStatus: typeof order.paymentStatus === "string" ? order.paymentStatus : null,
        },
        createdAt: now,
      });
      return { kind: "ok" };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }
    return Response.json({ success: true, orderId: id, archived: true });
  } catch (error) {
    console.error("admin order archive failed:", error);
    return Response.json({ error: "Could not archive the order. Please try again." }, { status: 500 });
  }
}
