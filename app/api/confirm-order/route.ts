import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import {
  ADMIN_CONFIRM_HOURS,
  MAX_DELIVERY_HOURS,
} from "@/lib/orderTiming";
import { emitSellerOrderNotifications } from "@/lib/sellerOrderNotifications";
import {
  buildSellerOrderSeeds,
  sellerOrderRecordId,
} from "@/lib/sellerOrderRecord";

// ---------------------------------------------------------------------------
// Admin confirmation of a Pending order.
//
// Confirmation sits between YOMICO's two timing clocks:
//
//   Clock A — the admin had ADMIN_CONFIRM_HOURS from the customer placing the
//     order (createdAt) to get here. Missing it does NOT block confirmation:
//     an admin may confirm at hour 30 or hour 300, and the order is never
//     auto-cancelled. The breach is simply recorded, on the order, as
//     confirmedLate plus the deadline it was measured against.
//
//   Clock B — confirming STARTS the delivery clock. deliveryDeadlineAt is
//     stamped here as confirmedAt + MAX_DELIVERY_HOURS, and the order should
//     reach Delivered by then. Passing it blocks nothing either: the order
//     stays operationally deliverable and is reported as delivery-overdue.
//
// One Timestamp.now() feeds every stamp. Deriving each from its own "now"
// would leave confirmedAt and the deadline a few milliseconds apart.
//
// Confirming is also the first moment a seller may know the order exists.
// Until now they cannot read it, cannot query it, and — since the placement
// path stopped announcing it — are not notified about it either. The seller
// notification lib/orderNotifications.ts used to send at placement is sent
// from here instead, per line item and therefore per vendor, so neither
// seller on a shared order learns about the other's items.
//
// Confirming also CREATES the per-seller fulfilment records in sellerOrders,
// one per vendor on the order, inside this same transaction. That is what
// makes "seller order management appears on confirmation" structural: a
// customer placing an order writes nothing there, and a record cannot exist
// for an unconfirmed order. Each record carries only its own vendor's items
// and only that vendor's share of the money.
//
// Idempotent twice over — the status guard above means a repeat call never
// reaches the write, and the record ids are deterministic
// (`${orderId}_${vendorId}`) so even a transaction retry addresses the same
// documents. Existing records are read first and left untouched, so a
// seller's fulfilment progress can never be reset by a re-confirmation.
//
// This route touches no stock: in this branch inventory is decremented when
// the order is placed.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`confirm-order_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    const windowStart = Number(data?.windowStart || 0);
    const count = Number(data?.count || 0);

    if (!data || now - windowStart > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 }, { merge: true });
      return true;
    }

    if (count >= RATE_LIMIT_MAX) return false;

    tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
    return true;
  });
}

function hoursAfter(from: Timestamp, hours: number): Timestamp {
  return Timestamp.fromMillis(from.toMillis() + hours * 60 * 60 * 1000);
}

type ConfirmOutcome =
  | {
      kind: "confirmed";
      orderId: string;
      confirmedLate: boolean;
      sellerRecords: number;
    }
  | { kind: "already"; status: string }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!requester.isAdmin) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    if (!(await isWithinRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { orderId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const orderId =
      typeof body.orderId === "string" ? body.orderId.trim() : "";

    if (!orderId) {
      return Response.json({ error: "Missing order id." }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);

    const outcome = await db.runTransaction<ConfirmOutcome>(async (tx) => {
      const snap = await tx.get(orderRef);

      if (!snap.exists) {
        return { kind: "error", status: 404, error: "Order not found." };
      }

      const order = snap.data() as Record<string, unknown>;
      const status = typeof order.status === "string" ? order.status : "";

      // Only a Pending order confirms. Re-confirming would restart the
      // delivery clock and hand the order a fresh 72 hours.
      if (status !== "Pending") {
        return { kind: "already", status };
      }

      // ---- ALL READS BEFORE ANY WRITE (Firestore transaction rule) ----
      const seeds = buildSellerOrderSeeds(orderId, order);

      const sellerRefs = seeds.map((seed) =>
        db
          .collection("sellerOrders")
          .doc(sellerOrderRecordId(orderId, seed.vendorId))
      );

      const existingSellerDocs = await Promise.all(
        sellerRefs.map((ref) => tx.get(ref))
      );

      // ONE instant for every stamp on this order.
      const confirmedAt = Timestamp.now();

      // Clock A is measured against the customer's placement time. An order
      // with no createdAt (legacy) simply cannot be judged — it is recorded
      // as not-late rather than assumed late.
      const createdAt =
        order.createdAt instanceof Timestamp ? order.createdAt : null;

      const adminConfirmDeadlineAt = createdAt
        ? hoursAfter(createdAt, ADMIN_CONFIRM_HOURS)
        : null;

      const confirmedLate = adminConfirmDeadlineAt
        ? confirmedAt.toMillis() > adminConfirmDeadlineAt.toMillis()
        : false;

      // One record per vendor, sharing the confirmation instant so no second
      // timing system is introduced. Any that somehow already exist are left
      // exactly as they are.
      seeds.forEach((seed, index) => {
        if (existingSellerDocs[index].exists) return;

        tx.set(sellerRefs[index], {
          ...seed,
          confirmedAt,
          deliveryDeadlineAt: hoursAfter(confirmedAt, MAX_DELIVERY_HOURS),
          createdAt: confirmedAt,
          updatedAt: confirmedAt,
        });
      });

      tx.update(orderRef, {
        status: "Confirmed",
        confirmedAt,
        confirmedBy: requester.uid,

        // Clock A, recorded for accountability. Confirmation is NEVER refused
        // because of it.
        ...(adminConfirmDeadlineAt ? { adminConfirmDeadlineAt } : {}),
        confirmedLate,

        // Clock B starts now.
        deliveryDeadlineAt: hoursAfter(confirmedAt, MAX_DELIVERY_HOURS),

        updatedAt: confirmedAt,
      });

      return {
        kind: "confirmed",
        orderId,
        confirmedLate,
        sellerRecords: seeds.length,
      };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    if (outcome.kind === "already") {
      return Response.json({
        success: true,
        alreadyConfirmed: true,
        status: outcome.status,
      });
    }

    // Best-effort and strictly after the commit: the order is confirmed and
    // its delivery clock started, so a failed notification must not undo any
    // of that. Only the "confirmed" outcome reaches here — a repeat call
    // returns from the alreadyConfirmed branch above — so each seller is
    // told exactly once.
    try {
      const confirmedSnap = await orderRef.get();
      await emitSellerOrderNotifications(db, confirmedSnap.data());
    } catch (error) {
      console.error("confirm-order: seller notification failed:", error);
    }

    return Response.json({
      success: true,
      orderId: outcome.orderId,
      confirmedLate: outcome.confirmedLate,
      sellerRecords: outcome.sellerRecords,
    });
  } catch (error) {
    console.error("confirm-order failed:", error);
    return Response.json(
      { error: "Could not confirm this order. Please try again." },
      { status: 500 }
    );
  }
}
