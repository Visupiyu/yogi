import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";
import { applyPointsMovements, pointsLedgerId } from "@/lib/points/pointsLedger";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// POST /api/admin/returns/{returnId}/status  { status }
//
// Status changes on OLD-STYLE returns (the `returns` collection), used by
// app/admin/refunds and app/admin/returns through lib/returns.ts. This used to
// run in the admin's browser with the client SDK, crediting points with a
// blind increment() and writing the ledger row afterwards. It now runs here,
// with the Admin SDK, in one transaction.
//
// Points are credited ONCE per return. The first arrival at "Refunded" credits
// refundAmount as a refund_return movement (ledger row refundreturn_{id},
// atomic with the balance — lib/points) and sets pointsCredited, which is
// never cleared. So Refunded -> Approved -> Refunded cannot pay twice.
//
// Returns from before the flag existed count as already credited when their
// status is "Refunded" (they are then flagged on their next change), or when a
// legacy "Refund" ledger row carries their returnId. A return refunded before
// ledger rows carried returnId and since moved away from "Refunded" cannot be
// recognised — the documented residual risk the reconciliation report (A5)
// will list.
//
// A first credit also requires the return's parent order to exist. A return
// whose order is missing (or was never recorded) is refused unchanged — see
// the guard below and scripts/test/reconciliation.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const STATUSES = new Set(["Pending", "Approved", "Rejected", "Refunded"]);

type Outcome =
  | { kind: "ok"; credited: number; userId: string | null }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("admin-return-status", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }
    const { id } = await params;
    if (!isValidDocId(id)) return Response.json({ error: "Return request not found." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    const status = typeof body?.status === "string" ? body.status : "";
    if (!STATUSES.has(status)) {
      return Response.json({ error: "status must be Pending, Approved, Rejected or Refunded." }, { status: 400 });
    }

    const db = getAdminDb();
    const returnRef = db.collection("returns").doc(id);

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      // ---- READS FIRST ----
      const snap = await tx.get(returnRef);
      if (!snap.exists) return { kind: "error", status: 404, error: "Return request no longer exists." };
      const data = snap.data() as {
        status?: unknown;
        pointsCredited?: unknown;
        refundAmount?: unknown;
        userId?: unknown;
        userEmail?: unknown;
        orderId?: unknown;
      };

      const userId = typeof data.userId === "string" && data.userId ? data.userId : null;
      const userEmail = typeof data.userEmail === "string" ? data.userEmail : "";
      const rawAmount = Number(data.refundAmount);
      const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;

      const flagged = data.pointsCredited === true;
      // A legacy return that is Refunded right now was credited by the old
      // browser path: it is flagged on this change, whatever the new status.
      const legacyRefunded = !flagged && data.status === "Refunded";

      let alreadyCredited = flagged || legacyRefunded;
      if (!alreadyCredited && status === "Refunded") {
        const legacyRows = await tx.get(
          db.collection("rewardTransactions").where("returnId", "==", id).limit(10)
        );
        alreadyCredited = legacyRows.docs.some((d) => d.get("type") === "Refund");
      }

      const credit = status === "Refunded" && !alreadyCredited;

      // PARENT ORDER GUARD, as in app/api/item-request/transition: a first
      // credit needs the order it refunds. A missing parent order refuses the
      // change before any write, so the status, the credit flag, the balance
      // and the ledger all stay as they were.
      if (credit) {
        const parentOrderId = typeof data.orderId === "string" ? data.orderId : "";
        const parentOrderSnap = isValidDocId(parentOrderId)
          ? await tx.get(db.collection("orders").doc(parentOrderId))
          : null;
        if (!parentOrderSnap?.exists) {
          return {
            kind: "error",
            status: 409,
            error: "The original order for this return no longer exists, so no refund can be credited. Nothing was changed.",
          };
        }
      }

      const userRef = credit && userId && amount > 0 ? db.collection("users").doc(userId) : null;
      const userSnap: DocumentSnapshot | null = userRef ? await tx.get(userRef) : null;

      // ---- WRITES ----
      const now = Timestamp.now();
      const update: Record<string, unknown> = { status };
      if (credit || legacyRefunded) {
        update.pointsCredited = true;
        update.pointsCreditedAt = now;
        if (legacyRefunded) update.pointsCreditedLegacy = true;
      }
      tx.update(returnRef, update);

      let credited = 0;
      if (userRef && userSnap && userId) {
        // "update", as before: a missing profile fails the whole change.
        applyPointsMovements(
          tx,
          db,
          { ref: userRef, snap: userSnap, uid: userId, email: userEmail, write: "update" },
          [{ kind: "refund_return", id: pointsLedgerId.refundReturn(id), requested: amount, refs: { returnId: id } }]
        );
        credited = amount;
      }

      return { kind: "ok", credited, userId };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    // Customer notification, as the browser helper sent it. Best-effort: the
    // status change has already committed.
    if (outcome.userId) {
      try {
        await db.collection("notifications").add({
          title: "Refund Status Updated",
          message: `Your refund request is now ${status}.`,
          userId: outcome.userId,
          role: "customer",
          type: "refund",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error("admin return status: notification failed:", error);
      }
    }

    return Response.json({ success: true, status, creditedPoints: outcome.credited });
  } catch (error) {
    console.error("admin return status failed:", error);
    return Response.json({ error: "Could not update the return." }, { status: 500 });
  }
}
