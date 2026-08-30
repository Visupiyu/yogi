import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { sellerOrderRecordId } from "@/lib/sellerOrderRecord";
import { mintSequential } from "@/lib/humanIds";
import {
  INITIAL_STATUS,
  REFUND_DESTINATION,
  itemKeyForOrderIndex,
  itemRequestEligibility,
  itemRequestId,
  itemSnapshot,
  isTerminal,
  refundableForOrderIndex,
  type ItemRequestType,
} from "@/lib/itemRequests";

// ---------------------------------------------------------------------------
// Per-item Return / Replace request creation. SERVER-AUTHORITATIVE.
//
// firestore.rules denies ALL client writes to itemRequests, so this route is
// the only way a request is created. It re-derives everything that governs a
// request rather than trusting the body:
//
//   - ownership: the order must belong to the caller
//   - item identity: the itemKey is computed from the order + the submitted
//     index (lib/itemRequests.itemKeyForOrderIndex), never taken from the body,
//     and matches the key sellerOrders already uses for that line
//   - eligibility: the LINE must be Delivered and inside the return window,
//     read from sellerOrders.itemFulfilment (per-item, not the order roll-up)
//   - refund amount: computed server-side as the item's proportional share of
//     finalTotal — the client never sends an amount
//   - dedupe: one request per (order, item); a new one is allowed only when a
//     prior one is in a terminal state (rejected/cancelled)
//
// The refund DESTINATION is reward points — the only mechanism the codebase
// has — recorded explicitly so the UI can state it truthfully.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const VALID_TYPES: ItemRequestType[] = ["return", "replace"];

type CreateOutcome =
  | {
      kind: "created";
      requestId: string;
      type: string;
      needsReview: boolean;
      vendorId: string;
      itemName: string;
    }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json(
        { error: "Please sign in to continue." },
        { status: 401 }
      );
    }

    if (
      !(await isWithinRateLimit(
        "item-request",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    let body: {
      orderId?: unknown;
      parentIndex?: unknown;
      type?: unknown;
      reason?: unknown;
      comments?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const orderId =
      typeof body.orderId === "string" ? body.orderId.trim() : "";
    const parentIndex =
      typeof body.parentIndex === "number" && Number.isInteger(body.parentIndex)
        ? body.parentIndex
        : -1;
    const type = (
      typeof body.type === "string" ? body.type.trim() : ""
    ) as ItemRequestType;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const comments =
      typeof body.comments === "string" ? body.comments.trim() : "";

    if (!orderId || orderId.length > 200) {
      return Response.json(
        { error: "A valid order is required." },
        { status: 400 }
      );
    }
    if (parentIndex < 0) {
      return Response.json(
        { error: "Please select the item." },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.includes(type)) {
      return Response.json({ error: "Invalid request type." }, { status: 400 });
    }
    if (!reason || reason.length > 200) {
      return Response.json(
        { error: "Please select a reason." },
        { status: 400 }
      );
    }
    if (comments.length > 2000) {
      return Response.json(
        { error: "Comments are too long." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);

    const outcome = await db.runTransaction<CreateOutcome>(async (tx) => {
      // ---- ALL READS FIRST ----
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        return { kind: "error", status: 404, error: "Order not found." };
      }

      const order = orderSnap.data() as Record<string, unknown>;
      if (order.userId !== requester.uid) {
        // Same wording as a missing order — no information leak.
        return { kind: "error", status: 404, error: "Order not found." };
      }

      const identity = itemKeyForOrderIndex(order, parentIndex);
      if (!identity) {
        return {
          kind: "error",
          status: 400,
          error: "That item could not be found on this order.",
        };
      }

      const { itemKey, vendorId, productId } = identity;

      // Per-item eligibility from the seller's own fulfilment record.
      const sellerRef = db
        .collection("sellerOrders")
        .doc(sellerOrderRecordId(orderId, vendorId));
      const sellerSnap = await tx.get(sellerRef);
      const sellerRecord = sellerSnap.exists
        ? (sellerSnap.data() as { itemFulfilment?: Record<string, unknown> })
        : null;

      const requestRef = db
        .collection("itemRequests")
        .doc(itemRequestId(orderId, itemKey));
      const existingSnap = await tx.get(requestRef);

      // ---- validations ----
      const eligibility = itemRequestEligibility(
        sellerRecord as never,
        itemKey
      );
      if (!eligibility.eligible) {
        const msg =
          eligibility.reason === "window-closed"
            ? "The return/replace window for this item has closed."
            : "This item isn't eligible yet — it must be delivered first.";
        return { kind: "error", status: 409, error: msg };
      }

      // One active request per item; a terminal prior one may be superseded.
      if (existingSnap.exists) {
        const prior = existingSnap.data() as { status?: string };
        if (!isTerminal(prior.status || "")) {
          return {
            kind: "error",
            status: 409,
            error:
              "There's already an active request for this item. You can track it under Profile - Refunds.",
          };
        }
      }

      const items = Array.isArray(order.items) ? order.items : [];
      const snapshot = itemSnapshot(items[parentIndex] || {});

      // Refund only applies to returns; a replacement ships a new unit.
      const refundAmount =
        type === "return" ? refundableForOrderIndex(order, parentIndex) : 0;

      const now = Timestamp.now();

      // Human-readable request number (RET… / REP… by type). Minted after all
      // reads above, before the writes below. Display only — requestRef.id
      // stays the document key.
      const requestNumber = await mintSequential(
        tx,
        db,
        type === "replace" ? "replacement" : "return"
      );

      // ---- WRITE (tx.set replaces a terminal prior request) ----
      tx.set(requestRef, {
        requestId: requestRef.id,
        requestNumber,
        type,
        orderId,
        userId: requester.uid,
        userEmail: requester.email || "",
        customerName:
          typeof order.customerName === "string" && order.customerName
            ? order.customerName
            : "Customer",

        // Item identity + snapshot.
        vendorId, // top-level: the seller read rule keys on this
        itemKey,
        productId,
        item: snapshot,

        reason,
        comments,

        status: INITIAL_STATUS,

        refund: {
          destination: REFUND_DESTINATION, // REWARD_POINTS — the only mechanism
          amount: refundAmount, // server-computed; 0 for replace
          credited: false,
        },

        ...(type === "replace"
          ? { replacement: { fulfilmentRecordId: null } }
          : {}),

        // Flagged when eligible but no delivered date was on record.
        ...(eligibility.needsReview ? { needsReview: true } : {}),

        createdAt: now,
        updatedAt: now,

        // Audit trail. Arrays aren't rule-diffable, but every write here is
        // server-only, so the history can only grow through this route and the
        // transition route.
        history: [{ status: INITIAL_STATUS, at: now, by: "customer" }],
      });

      return {
        kind: "created",
        requestId: requestRef.id,
        type,
        needsReview: eligibility.needsReview,
        vendorId,
        itemName: snapshot.name,
      };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    // Best-effort, post-commit: tell admin (and the seller) a request exists.
    try {
      await db.collection("notifications").add({
        title: outcome.type === "replace" ? "Replacement Request" : "Return Request",
        message: `A ${outcome.type} was requested for order ${orderId.slice(
          0,
          8
        )}.`,
        role: "admin",
        type: "refund",
        read: false,
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("item-request: admin notification failed:", error);
    }

    // The seller whose item this is, so they can see (read-only) that a
    // customer has raised a request against their product. vendorId comes from
    // the order item on the server, never from the client. This is the
    // request-CREATED signal; the replacement-approved signal is separate
    // (app/api/item-request/transition), so no event is notified twice.
    if (outcome.vendorId) {
      try {
        await db.collection("notifications").add({
          title:
            outcome.type === "replace"
              ? "Replacement requested"
              : "Return requested",
          message: `A customer requested a ${outcome.type} for "${outcome.itemName}".`,
          userId: outcome.vendorId,
          role: "seller",
          type: "order",
          read: false,
          createdAt: Timestamp.now(),
        });
      } catch (error) {
        console.error("item-request: seller notification failed:", error);
      }
    }

    return Response.json({
      success: true,
      requestId: outcome.requestId,
      type: outcome.type,
      needsReview: outcome.needsReview,
    });
  } catch (error) {
    console.error("item-request: unexpected failure:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
