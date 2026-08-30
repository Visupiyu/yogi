import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { mintSequential } from "@/lib/humanIds";
import {
  SELLER_REPLACE_TARGETS,
  isLegalTransition,
  statusLabel,
  type ItemRequestType,
} from "@/lib/itemRequests";

// ---------------------------------------------------------------------------
// Advance an item-level Return / Replace request. SERVER-AUTHORITATIVE.
//
// itemRequests is create/update/delete:false for every client (firestore.rules),
// so this Admin-SDK route is the only way a request changes state. It enforces:
//
//   - WHO: admin may drive any legal transition; the seller who owns the item
//     may drive ONLY the replacement FULFILMENT stages (SELLER_PREPARING ->
//     READY_FOR_DELIVERY -> HANDED_OVER_TO_COURIER -> DELIVERED) on a replace.
//   - WHAT: every move is checked against the state machine
//     (lib/itemRequests.isLegalTransition) — one step forward, or reject/cancel
//     from an early stage. No skipping, no rewinding, no leaving a terminal.
//   - MONEY: on REFUNDED (return) the stored, server-computed refund amount is
//     credited to the customer's reward points — the only refund mechanism
//     YOMICO has — exactly once (a credited flag + the one-way state machine
//     both prevent a double credit). The amount is never taken from the client.
//   - STOCK: on APPROVED (replace) one unit is taken from the product's stock
//     (stock down, sales up — the same conserved pair checkout uses); if the
//     product is out of stock the approval is refused rather than overselling.
//
// The original order's sellerOrders / orders roll-up and its 24h/72h SLA are
// never touched here: a replacement's lifecycle lives entirely on its own
// itemRequests document, so this cannot corrupt the parent order's fulfilment.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type TransitionOutcome =
  | {
      kind: "ok";
      type: ItemRequestType;
      toStatus: string;
      userId: string | null;
      vendorId: string | null;
      itemName: string;
      creditedAmount: number; // >0 only when a refund was just credited
      userEmail: string | null;
    }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "item-request-transition",
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

    let body: { requestId?: unknown; toStatus?: unknown; pickupAt?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const requestId =
      typeof body.requestId === "string" ? body.requestId.trim() : "";
    const toStatus =
      typeof body.toStatus === "string" ? body.toStatus.trim() : "";

    if (!requestId || !toStatus) {
      return Response.json(
        { error: "Missing request id or target status." },
        { status: 400 }
      );
    }

    // Scheduling a pickup REQUIRES a valid date/time from the admin. Validated
    // here (cheap 400) before the transaction; stored below as
    // itemRequests.pickup.scheduledAt. `pickupAt` is an ISO datetime string or
    // epoch millis (the client combines its date + time inputs into one).
    let pickupScheduledAt: Date | null = null;
    if (toStatus === "PICKUP_SCHEDULED") {
      const raw = body.pickupAt;
      const parsed =
        typeof raw === "string" || typeof raw === "number"
          ? new Date(raw)
          : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return Response.json(
          { error: "A valid pickup date and time is required." },
          { status: 400 }
        );
      }
      pickupScheduledAt = parsed;
    }

    const db = getAdminDb();
    const reqRef = db.collection("itemRequests").doc(requestId);

    const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
      // ---- READS FIRST ----
      const snap = await tx.get(reqRef);
      if (!snap.exists) {
        return { kind: "error", status: 404, error: "Request not found." };
      }

      const req = snap.data() as {
        type?: ItemRequestType;
        status?: string;
        vendorId?: string;
        userId?: string;
        userEmail?: string;
        productId?: string;
        item?: { qty?: number; name?: string };
        refund?: { amount?: number; credited?: boolean };
        replacement?: Record<string, unknown>;
        pickup?: Record<string, unknown>;
        history?: unknown[];
      };

      const type: ItemRequestType = req.type === "replace" ? "replace" : "return";
      const from = req.status || "REQUESTED";

      // ---- WHO ----
      const isAdmin = requester.isAdmin === true;
      const isSeller = !!req.vendorId && req.vendorId === requester.uid;
      if (!isAdmin && !isSeller) {
        return { kind: "error", status: 403, error: "Not authorized." };
      }

      // ---- WHAT (state machine) ----
      if (!isLegalTransition(type, from, toStatus)) {
        return {
          kind: "error",
          status: 409,
          error: `Cannot move a ${type} from ${from} to ${toStatus}.`,
        };
      }

      // A seller may only run replacement fulfilment stages.
      if (!isAdmin) {
        if (type !== "replace" || !SELLER_REPLACE_TARGETS.includes(toStatus)) {
          return {
            kind: "error",
            status: 403,
            error: "Sellers can only progress replacement fulfilment.",
          };
        }
      }

      const qtyNum = Number(req.item?.qty);
      const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;

      // ---- STOCK: replace approval takes a unit ----
      // Read the product BEFORE any write (transaction rule).
      let productRef: FirebaseFirestore.DocumentReference | null = null;
      if (type === "replace" && toStatus === "APPROVED" && req.productId) {
        productRef = db.collection("products").doc(req.productId);
        const productSnap = await tx.get(productRef);
        if (productSnap.exists) {
          const stock = Number(
            (productSnap.data() as { stock?: unknown }).stock ?? 0
          );
          if (stock < qty) {
            return {
              kind: "error",
              status: 409,
              error:
                "This product is out of stock, so a replacement can't be approved. Reject the request or process a return instead.",
            };
          }
        } else {
          // Unknown product — cannot reserve stock. Approve without touching
          // inventory rather than blocking a legitimate replacement.
          productRef = null;
        }
      }

      // ---- MONEY: refund credit on REFUNDED ----
      const now = Timestamp.now();
      const by = isAdmin ? "admin" : "seller";
      const history = Array.isArray(req.history) ? req.history : [];

      const update: Record<string, unknown> = {
        status: toStatus,
        updatedAt: now,
        history: [...history, { status: toStatus, at: now, by }],
      };

      let creditedAmount = 0;
      if (type === "return" && toStatus === "REFUNDED") {
        const alreadyCredited = req.refund?.credited === true;
        const amountNum = Number(req.refund?.amount);
        const amount =
          Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0;

        // Human-readable refund number, minted once on the first (and only)
        // arrival at REFUNDED. Minted before the credit write below so the
        // counter read precedes every write in this transaction.
        const refundNumber = alreadyCredited
          ? null
          : await mintSequential(tx, db, "refund");

        if (!alreadyCredited && amount > 0 && req.userId) {
          tx.update(db.collection("users").doc(req.userId), {
            rewardPoints: FieldValue.increment(amount),
          });
          creditedAmount = amount;
        }
        // Mark credited regardless, so a (state-machine-impossible) re-entry
        // can never pay twice.
        update.refund = {
          ...(req.refund || {}),
          credited: true,
          creditedAt: now,
          ...(refundNumber ? { refundNumber } : {}),
        };
      }

      // ---- PICKUP: admin-scheduled date/time on PICKUP_SCHEDULED ----
      if (toStatus === "PICKUP_SCHEDULED" && pickupScheduledAt) {
        update.pickup = {
          ...(req.pickup || {}),
          scheduledAt: Timestamp.fromDate(pickupScheduledAt),
          scheduledBy: "admin",
        };
      }

      // ---- STOCK write for replace approval ----
      if (productRef) {
        tx.update(productRef, {
          stock: FieldValue.increment(-qty),
          sales: FieldValue.increment(qty),
        });
        update.replacement = {
          ...(req.replacement || {}),
          approvedAt: now,
          stockDecremented: true,
        };
      }

      tx.update(reqRef, update);

      return {
        kind: "ok",
        type,
        toStatus,
        userId: req.userId || null,
        vendorId: req.vendorId || null,
        itemName: req.item?.name || "an item",
        creditedAmount,
        userEmail: req.userEmail || null,
      };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    // ---- post-commit, best-effort ----
    // Reward-points ledger entry, only when a credit actually happened. A
    // transaction cannot addDoc a generated id, so it is written here, mirroring
    // lib/returns.ts.
    if (outcome.creditedAmount > 0) {
      try {
        await db.collection("rewardTransactions").add({
          requestId,
          userId: outcome.userId,
          userEmail: outcome.userEmail ?? "",
          type: "Refund",
          points: outcome.creditedAmount,
          createdAt: Timestamp.now(),
        });
      } catch (error) {
        console.error("item-request transition: ledger write failed:", error);
      }
    }

    // Seller notification: a replacement just got approved, so the seller now
    // has a fulfilment task. Addressed by vendorId + role "seller", matching
    // lib/sellerOrderNotifications and the seller notifications page.
    if (
      outcome.type === "replace" &&
      outcome.toStatus === "APPROVED" &&
      outcome.vendorId
    ) {
      try {
        await db.collection("notifications").add({
          title: "Replacement to prepare",
          message: `A replacement for "${outcome.itemName}" was approved — please prepare and ship it.`,
          userId: outcome.vendorId,
          role: "seller",
          type: "order",
          read: false,
          createdAt: Timestamp.now(),
        });
      } catch (error) {
        console.error("item-request transition: seller notify failed:", error);
      }
    }

    // Customer notification.
    if (outcome.userId) {
      try {
        await db.collection("notifications").add({
          title:
            outcome.type === "replace"
              ? "Replacement Update"
              : "Return Update",
          message: `Your ${outcome.type} request is now ${statusLabel(
            outcome.type,
            outcome.toStatus
          )}.`,
          userId: outcome.userId,
          role: "customer",
          type: "refund",
          read: false,
          createdAt: Timestamp.now(),
        });
      } catch (error) {
        console.error("item-request transition: notify failed:", error);
      }
    }

    return Response.json({ success: true, status: outcome.toStatus });
  } catch (error) {
    console.error("item-request transition: unexpected failure:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
