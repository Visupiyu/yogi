import { verifyRequestUser, type VerifiedUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  FieldValue,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Single server-authoritative cancellation path.
//
// Replaces three separate client-side implementations that had drifted apart:
//   app/orders/page.tsx            (customer) - restored stock, reversed
//                                   reward points, released the coupon
//   app/seller/orders/page.js      (seller)   - restored stock ONLY
//   app/seller/orders/[id]/page.tsx(seller)   - restored stock ONLY
//
// So which button was pressed silently changed the financial outcome: a
// seller-cancelled order left the customer's reward points credited for an
// order that never happened AND left their coupon consumed. This route makes
// both paths identical.
//
// The client sends only an orderId. Authorization, cancellability, the items,
// the quantities and every amount are read from Firestore server-side — none
// of it is accepted from the request.
//
// NOTE: no caller is migrated yet, and no Firestore rule has changed, so the
// existing client-side cancellation paths still work. Migrating them is the
// next step; the rules tightening comes last.
// ---------------------------------------------------------------------------

// Same rateLimits collection / window-count shape as
// app/api/create-order/route.ts. That helper is module-local and not
// exported, so it is duplicated by convention (send-verification-email and
// the AI routes do the same) under its own key namespace.
const CANCEL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CANCEL_RATE_LIMIT_MAX = 20;

async function isWithinCancelRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`cancel-order_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > CANCEL_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= CANCEL_RATE_LIMIT_MAX) return false;

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

type OrderItem = { id?: unknown; qty?: unknown };

type OrderRecord = {
  userId?: unknown;
  userEmail?: unknown;
  vendorIds?: unknown;
  items?: unknown;
  status?: unknown;
  finalTotal?: unknown;
  rewardValue?: unknown;
  couponCode?: unknown;
};

// Mirrors isLegalOrderStatusTransition() in firestore.rules: Cancelled is
// only reachable from these three. Deliberately applied to admins too — an
// admin "cancelling" a Delivered order would restore stock for goods the
// customer already has.
const CANCELLABLE_STATUSES = ["Pending", "Confirmed", "Packed"];

type AuthzResult =
  | { ok: true; role: "customer" | "vendor" | "admin" }
  | { ok: false; status: number; error: string };

// Mirrors the orders update rule's own branches, server-side. The customer
// boundary stays deliberately narrower than the vendor's, exactly as today:
// a customer may only cancel while Pending.
function authorize(order: OrderRecord, requester: VerifiedUser): AuthzResult {
  const status = typeof order.status === "string" ? order.status : "";
  const vendorIds = Array.isArray(order.vendorIds) ? order.vendorIds : [];

  if (order.userId === requester.uid) {
    if (status !== "Pending") {
      return {
        ok: false,
        status: 409,
        error: "This order can no longer be cancelled.",
      };
    }
    return { ok: true, role: "customer" };
  }

  if (vendorIds.includes(requester.uid)) {
    if (!CANCELLABLE_STATUSES.includes(status)) {
      return {
        ok: false,
        status: 409,
        error: "This order can no longer be cancelled.",
      };
    }
    return { ok: true, role: "vendor" };
  }

  if (requester.isAdmin) {
    if (!CANCELLABLE_STATUSES.includes(status)) {
      return {
        ok: false,
        status: 409,
        error: "This order can no longer be cancelled.",
      };
    }
    return { ok: true, role: "admin" };
  }

  // Same shape as send-order-email: don't confirm an order exists to
  // someone who has no business seeing it.
  return { ok: false, status: 404, error: "Order not found." };
}

// Discriminated union rather than an outer mutable flag: the transaction may
// be retried by Firestore, so every attempt must produce its own complete
// result instead of mutating shared state a retry could leave stale.
type CancelOutcome =
  | { kind: "error"; status: number; error: string }
  | { kind: "already" }
  | {
      kind: "cancelled";
      restockedItems: number;
      earnedPoints: number;
      redeemedValue: number;
      orderUserId: string | null;
      orderUserEmail: string | null;
    };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!(await isWithinCancelRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { orderId } = body as { orderId?: unknown };

    if (typeof orderId !== "string" || !orderId || orderId.length > 200) {
      return Response.json({ error: "A valid orderId is required." }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);

    // Authorization is decided against the order as it exists NOW, read
    // inside the transaction rather than beforehand — which also makes the
    // double-cancel guard race-proof: two concurrent calls cannot both
    // observe a non-Cancelled status and both restore stock.
    const outcome = await db.runTransaction<CancelOutcome>(
      async (tx: Transaction) => {
        const orderSnap = await tx.get(orderRef);

        if (!orderSnap.exists) {
          return { kind: "error", status: 404, error: "Order not found." };
        }

        const order = orderSnap.data() as OrderRecord;

        // Idempotent: already cancelled means nothing to undo. Checked
        // before authorization's status test so a repeat call returns a
        // clean success rather than a confusing 409.
        if (order.status === "Cancelled") {
          return { kind: "already" };
        }

        const authz = authorize(order, requester);
        if (!authz.ok) {
          return { kind: "error", status: authz.status, error: authz.error };
        }

        // ---- ALL READS FIRST (Firestore transaction requirement) ----
        const items = Array.isArray(order.items)
          ? (order.items as OrderItem[])
          : [];

        const restorable: { ref: FirebaseFirestore.DocumentReference; qty: number }[] =
          [];

        for (const item of items) {
          const id = item?.id;
          const qty = Number(item?.qty);
          if (typeof id !== "string" || !id || !Number.isFinite(qty) || qty <= 0) {
            continue;
          }
          const ref = db.collection("products").doc(id);
          const snap = await tx.get(ref);
          // Skip products that no longer exist rather than aborting the
          // whole cancellation — matches the previous per-item best-effort
          // tolerance, while keeping everything that does exist atomic.
          if (!snap.exists) continue;
          restorable.push({ ref, qty });
        }

        const orderUserId =
          typeof order.userId === "string" ? order.userId : null;

        // Same formula the customer path used: earnedPoints isn't persisted
        // on the order, so it is recomputed with checkout's own
        // Math.floor(finalTotal / 100) against the order's stored total.
        const earnedPoints = Math.floor(Number(order.finalTotal || 0) / 100);
        const redeemedValue = Number(order.rewardValue || 0);
        const adjustsPoints =
          !!orderUserId && (earnedPoints > 0 || redeemedValue > 0);

        const userRef = orderUserId
          ? db.collection("users").doc(orderUserId)
          : null;
        const userSnap = adjustsPoints && userRef ? await tx.get(userRef) : null;

        // F010 gives redemptions a deterministic id, so the claim can be
        // read inside the transaction instead of queried (transactions
        // cannot run queries). Legacy random-id claims are swept up
        // best-effort after the transaction.
        const code =
          typeof order.couponCode === "string"
            ? order.couponCode.trim().toUpperCase()
            : "";
        const couponRef =
          code && orderUserId
            ? db.collection("couponRedemptions").doc(`${orderUserId}_${code}`)
            : null;
        const couponSnap = couponRef ? await tx.get(couponRef) : null;

        // ---- WRITES ----
        tx.update(orderRef, {
          status: "Cancelled",
          updatedAt: Timestamp.now(),
        });

        for (const { ref, qty } of restorable) {
          // stock and sales move in opposite directions by the same amount,
          // so stock + sales is conserved exactly as checkout's decrement
          // established it.
          tx.update(ref, {
            stock: FieldValue.increment(qty),
            sales: FieldValue.increment(-qty),
          });
        }

        if (adjustsPoints && userRef) {
          const currentPoints = userSnap?.exists
            ? Number(userSnap.data()?.rewardPoints || 0)
            : 0;
          const newBalance = Math.max(
            0,
            currentPoints - earnedPoints + redeemedValue
          );
          tx.set(userRef, { rewardPoints: newBalance }, { merge: true });
        }

        // Only release a claim that belongs to THIS order.
        if (couponRef && couponSnap?.exists) {
          const claimedOrderId = (couponSnap.data() as { orderId?: unknown })
            ?.orderId;
          if (claimedOrderId === orderId) {
            tx.delete(couponRef);
          }
        }

        return {
          kind: "cancelled",
          restockedItems: restorable.length,
          earnedPoints,
          redeemedValue,
          orderUserId,
          orderUserEmail:
            typeof order.userEmail === "string" ? order.userEmail : null,
        };
      }
    );

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    if (outcome.kind === "already") {
      return Response.json({
        success: true,
        alreadyCancelled: true,
        restockedItems: 0,
      });
    }

    // ---- Best-effort, outside the transaction ----
    // None of these may fail the cancellation, which has already committed.

    // Reward ledger entries, mirroring the customer path's wording.
    if (outcome.orderUserId) {
      const ledger: { type: string; points: number }[] = [];
      if (outcome.earnedPoints > 0) {
        ledger.push({
          type: "Cancelled - Points Reversed",
          points: outcome.earnedPoints,
        });
      }
      if (outcome.redeemedValue > 0) {
        ledger.push({
          type: "Cancelled - Points Restored",
          points: outcome.redeemedValue,
        });
      }
      for (const entry of ledger) {
        try {
          await db.collection("rewardTransactions").add({
            userId: outcome.orderUserId,
            userEmail: outcome.orderUserEmail,
            type: entry.type,
            points: entry.points,
            orderId,
            createdAt: Timestamp.now(),
          });
        } catch (error) {
          console.error("cancel-order: reward ledger write failed:", error);
        }
      }
    }

    // Legacy sweep: redemptions created before F010's deterministic ids
    // can only be found by query, which a transaction cannot run.
    try {
      const legacy = await db
        .collection("couponRedemptions")
        .where("orderId", "==", orderId)
        .get();
      for (const doc of legacy.docs) {
        await doc.ref.delete();
      }
    } catch (error) {
      console.error("cancel-order: legacy coupon sweep failed:", error);
    }

    return Response.json({
      success: true,
      restockedItems: outcome.restockedItems,
    });
  } catch (error) {
    console.error("cancel-order: unexpected failure:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
