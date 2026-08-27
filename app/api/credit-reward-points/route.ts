import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  creditOneOrder,
  type CreditResult,
} from "@/lib/rewardCreditServer";

// ---------------------------------------------------------------------------
// Customer-facing entry point for crediting an order's reward points.
//
// Points are not granted when an order is placed. They are granted once the
// order is delivered, paid for, and past its 7-day return window with no
// return outstanding — see lib/rewardCredit.ts for the rule and
// lib/returnEligibility.ts for the window itself.
//
// The credit itself lives in lib/rewardCreditServer.ts, shared with the
// scheduled sweep at app/api/cron/credit-reward-points. This route only
// authenticates the caller and decides WHICH orders to offer up; it never
// decides whether one qualifies.
//
// The caller supplies at most an orderId. Every condition is read from
// Firestore inside the transaction, so a client claiming "this order was
// delivered" achieves nothing.
// ---------------------------------------------------------------------------

// Same rateLimits collection / window-count shape as app/api/cancel-order and
// app/api/create-order. Those helpers are module-local by convention, so this
// one lives here too under its own key namespace.
const CREDIT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CREDIT_RATE_LIMIT_MAX = 20;

// A sweep settles whatever is due for one caller. Bounded so a customer with a
// long history cannot turn one request into an unbounded transaction fan-out.
const SWEEP_LIMIT = 25;

async function isWithinCreditRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb()
    .collection("rateLimits")
    .doc(`credit-reward-points_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    const windowStart = Number(data?.windowStart || 0);
    const count = Number(data?.count || 0);

    if (!data || now - windowStart > CREDIT_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 }, { merge: true });
      return true;
    }

    if (count >= CREDIT_RATE_LIMIT_MAX) return false;

    tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
    return true;
  });
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    if (!(await isWithinCreditRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { orderId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // A body-less POST means "settle whatever is due for me".
    }

    const caller = { uid: requester.uid, isAdmin: requester.isAdmin };
    const db = getAdminDb();

    // ---- Single order ----
    if (typeof body.orderId === "string" && body.orderId.trim()) {
      const result = await creditOneOrder(body.orderId.trim(), caller);

      return Response.json({
        success: true,
        credited: result.credited ? 1 : 0,
        points: result.credited ? result.points : 0,
        results: [result],
      });
    }

    // ---- Sweep the caller's own pending orders ----
    //
    // Queried, not client-supplied: only orders this user owns that are
    // actually awaiting a credit and already marked Delivered are considered.
    // Everything else is still re-verified per order inside the transaction.
    const pending = await db
      .collection("orders")
      .where("userId", "==", requester.uid)
      .where("rewardPointsStatus", "==", "pending")
      .where("status", "==", "Delivered")
      .limit(SWEEP_LIMIT)
      .get();

    const results: CreditResult[] = [];
    for (const doc of pending.docs) {
      try {
        results.push(await creditOneOrder(doc.id, caller));
      } catch (error) {
        console.error("credit-reward-points: order failed:", doc.id, error);
      }
    }

    const credited = results.filter((r) => r.credited);

    return Response.json({
      success: true,
      credited: credited.length,
      points: credited.reduce(
        (sum, r) => sum + (r.credited ? r.points : 0),
        0
      ),
      results,
    });
  } catch (error) {
    console.error("credit-reward-points failed:", error);
    return Response.json(
      { error: "Could not update reward points. Please try again." },
      { status: 500 }
    );
  }
}
