import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Server-authoritative admin review of a withdrawal — the NON-money
// transitions (Approve / Reject / back to Pending).
//
// These used to be a direct updateDoc() from app/admin/withdrawals, which
// meant firestore.rules had to let an admin browser write the withdrawal
// document — and with it amount, vendorId, vendorEmail, paidAt/paidBy and
// status 'Paid' itself. The rules now deny every client write (B2), so the
// review moves here. Only `status` (plus who/when) is ever written; nothing
// from the request but the withdrawal id and the target status is read.
//
// Allowed:   Pending  -> Approved | Rejected
//            Approved -> Pending  | Rejected
// Refused:   anything -> Paid     (app/api/settle-withdrawal only)
//            Paid     -> anything (a payment is final)
//            Rejected -> anything (the reservation was released; reopening it
//                                  would re-reserve an amount never re-checked
//                                  against the balance — the seller requests
//                                  again through app/api/request-withdrawal)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;

const ALLOWED: Record<string, readonly string[]> = {
  Pending: ["Approved", "Rejected"],
  Approved: ["Pending", "Rejected"],
};

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (requester.isAdmin !== true) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    if (
      !(await isWithinRateLimit("review-withdrawal", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { withdrawalId?: unknown; status?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const withdrawalId =
      typeof body?.withdrawalId === "string" ? body.withdrawalId.trim() : "";
    const target = typeof body?.status === "string" ? body.status : "";
    if (!withdrawalId || withdrawalId.includes("/")) {
      return Response.json({ error: "Missing withdrawal id." }, { status: 400 });
    }
    if (!["Pending", "Approved", "Rejected"].includes(target)) {
      return Response.json(
        { error: "Status must be Pending, Approved or Rejected." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);

    type TxResult =
      | { kind: "not-found" }
      | { kind: "unchanged" }
      | { kind: "refused"; from: string }
      | { kind: "updated"; from: string };

    const outcome = await db.runTransaction<TxResult>(async (tx) => {
      const snap = await tx.get(withdrawalRef);
      if (!snap.exists) return { kind: "not-found" };

      const w = snap.data() as { status?: unknown; vendorId?: unknown; amount?: unknown };
      const from = String(w?.status || "Pending");
      if (from === target) return { kind: "unchanged" };
      if (!(ALLOWED[from] || []).includes(target)) return { kind: "refused", from };

      const now = Timestamp.now();
      tx.update(withdrawalRef, {
        status: target,
        reviewedAt: now,
        reviewedBy: requester.uid,
      });
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: "withdrawal_review",
        targetId: withdrawalId,
        details: {
          fromStatus: from,
          toStatus: target,
          vendorId: typeof w?.vendorId === "string" ? w.vendorId : "",
          amount: Number(w?.amount || 0),
        },
        createdAt: now,
      });
      return { kind: "updated", from };
    });

    switch (outcome.kind) {
      case "not-found":
        return Response.json({ error: "Withdrawal not found." }, { status: 404 });
      case "unchanged":
        return Response.json({ success: true, status: target, unchanged: true });
      case "refused":
        return Response.json(
          { error: `A ${outcome.from} withdrawal cannot be moved to ${target}.` },
          { status: 409 }
        );
      default:
        return Response.json({ success: true, status: target });
    }
  } catch (error) {
    console.error("review-withdrawal failed:", error);
    return Response.json({ error: "Could not update this withdrawal." }, { status: 500 });
  }
}
