import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import {
  buildItemAdvancePayload,
  deriveStageAcross,
  isLegalItemTransition,
  nextItemStage,
  type ItemFulfilmentMap,
} from "@/lib/itemFulfilment";

// ---------------------------------------------------------------------------
// Advance ONE line item, and roll the parent order's status up, in a single
// transaction.
//
// sellerOrders.itemFulfilment stays the source of truth. orders.status becomes
// a DERIVED summary of it: the least advanced item across every seller on the
// order. A seller never chooses the parent status — they advance one of their
// own products and the parent follows arithmetically.
//
// This runs server-side rather than from the browser for one reason: the
// roll-up has to read every seller's records for the order, and a seller is
// forbidden to read another seller's record. Only the Admin SDK can see the
// whole order, so only the server can compute the summary. firestore.rules
// correspondingly makes itemFulfilment server-only — a direct client write is
// refused, so the roll-up cannot be skipped.
//
// What this route does NOT touch: confirmedAt, adminConfirmDeadlineAt,
// deliveryDeadlineAt or any other timing field. The 24h confirmation and 72h
// delivery clocks are exactly as app/api/confirm-order stamped them.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 300;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`advance-item_${uid}`);
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

type Outcome =
  | {
      kind: "advanced";
      itemStatus: string;
      parentStatus: string | null;
      allDelivered: boolean;
    }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!(await isWithinRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { recordId?: unknown; itemKey?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const recordId =
      typeof body.recordId === "string" ? body.recordId.trim() : "";
    const itemKey =
      typeof body.itemKey === "string" ? body.itemKey.trim() : "";

    if (!recordId || !itemKey) {
      return Response.json(
        { error: "Missing record id or item key." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const recordRef = db.collection("sellerOrders").doc(recordId);

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      // ---- ALL READS FIRST (Firestore transaction requirement) ----
      const recordSnap = await tx.get(recordRef);

      if (!recordSnap.exists) {
        return { kind: "error", status: 404, error: "Fulfilment record not found." };
      }

      const record = recordSnap.data() as {
        vendorId?: unknown;
        orderId?: unknown;
        itemFulfilment?: ItemFulfilmentMap;
      };

      // Ownership. A seller may only ever advance their own product — this is
      // the same boundary firestore.rules draws on reads, restated here
      // because the Admin SDK bypasses rules.
      if (record.vendorId !== requester.uid && !requester.isAdmin) {
        return { kind: "error", status: 403, error: "Not authorized." };
      }

      // Only an admin-Approved seller may advance fulfilment. Admin operations
      // are intentionally unaffected (an admin has no vendor doc and is already
      // authorized above). Status is read from the vendor document by the
      // verified uid — never from the request — so a Pending/Rejected/Blocked
      // seller is refused here even on their own record. This is a read, placed
      // before any write, per the transaction's reads-first rule.
      if (!requester.isAdmin) {
        const vendorSnap = await tx.get(
          db.collection("vendors").where("uid", "==", requester.uid).limit(1)
        );
        if (
          vendorSnap.empty ||
          (vendorSnap.docs[0].data() as { status?: unknown })?.status !==
            "Approved"
        ) {
          return {
            kind: "error",
            status: 403,
            error: "Your seller account is not approved for fulfilment.",
          };
        }
      }

      const orderId = typeof record.orderId === "string" ? record.orderId : "";

      if (!orderId) {
        return { kind: "error", status: 409, error: "Record has no parent order." };
      }

      const current = record.itemFulfilment?.[itemKey]?.status;

      if (typeof current !== "string") {
        return { kind: "error", status: 404, error: "Unknown item." };
      }

      const next = nextItemStage(current);

      if (!next) {
        return {
          kind: "error",
          status: 409,
          error: "This product is already Delivered.",
        };
      }

      // Belt and braces: the same rule the UI and the client-side model use.
      if (!isLegalItemTransition(current, next)) {
        return { kind: "error", status: 409, error: "Illegal transition." };
      }

      // Every seller's records for this order — needed to roll the parent up.
      // A seller cannot read these themselves, which is exactly why the
      // roll-up lives here.
      const siblingsSnap = await tx.get(
        db.collection("sellerOrders").where("orderId", "==", orderId)
      );

      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await tx.get(orderRef);

      // ---- compute ----
      const stampedAt = Timestamp.now();

      const payload = buildItemAdvancePayload(
        record.itemFulfilment,
        itemKey,
        stampedAt
      );

      if (!payload) {
        return { kind: "error", status: 409, error: "Nothing to advance." };
      }

      const updatedMap = payload.itemFulfilment as ItemFulfilmentMap;

      // Substitute the pending change before deriving — the query above still
      // holds this record's PREVIOUS state.
      const maps = siblingsSnap.docs.map((docSnap) =>
        docSnap.id === recordId
          ? updatedMap
          : ((docSnap.data() as { itemFulfilment?: ItemFulfilmentMap })
              .itemFulfilment ?? null)
      );

      const parentStage = deriveStageAcross(maps);
      const allDelivered = parentStage === "Delivered";

      // ---- writes ----
      tx.update(recordRef, payload);

      const orderStatus = orderSnap.exists
        ? (orderSnap.data() as { status?: unknown }).status
        : undefined;

      // Cancellation is untouched: a cancelled order keeps its status, and no
      // roll-up resurrects it. That policy lives in /api/cancel-order.
      if (orderSnap.exists && orderStatus !== "Cancelled" && parentStage) {
        const orderUpdate: Record<string, unknown> = {
          status: parentStage,
          updatedAt: stampedAt,
        };

        // The 72h delivery clock is measured against the parent deliveredAt.
        // It is stamped once, when the LAST item is delivered — the same
        // meaning it has always had, just no longer chosen by a seller.
        if (
          allDelivered &&
          !(orderSnap.data() as { deliveredAt?: unknown }).deliveredAt
        ) {
          orderUpdate.deliveredAt = stampedAt;
        }

        tx.update(orderRef, orderUpdate);
      }

      return {
        kind: "advanced",
        itemStatus: next,
        parentStatus:
          orderStatus === "Cancelled" ? String(orderStatus) : parentStage,
        allDelivered,
      };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    return Response.json({
      success: true,
      itemStatus: outcome.itemStatus,
      parentStatus: outcome.parentStatus,
      allDelivered: outcome.allDelivered,
    });
  } catch (error) {
    console.error("advance-item failed:", error);
    return Response.json(
      { error: "Could not update this product. Please try again." },
      { status: 500 }
    );
  }
}
