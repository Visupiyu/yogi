import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import {
  RETURN_WINDOW_DAYS,
  returnWindowBasis,
  returnWindowEndsAt,
  isWithinReturnWindow,
} from "@/lib/returnEligibility";

// ---------------------------------------------------------------------------
// Server-authoritative return requests.
//
// app/returns/page.tsx previously wrote the `returns` document straight from
// the browser with addDoc(). Every check that mattered was either absent or
// lived only in firestore.rules:
//
//   ownership        rules only (ownsReturnOrder), surfacing as a raw
//                    permission error the form reported as "Failed to submit"
//   Delivered        NOWHERE — the status check existed only as a render
//                    condition on the button, so navigating directly to
//                    /returns?orderId=... bypassed it entirely
//   return window    not implemented at all
//   duplicates       not prevented — addDoc() with a generated id meant one
//                    order could accumulate unlimited return requests, each
//                    independently refundable by lib/returns.ts
//
// All four are enforced here now. The written document keeps the EXACT schema
// the form produced, so app/admin/returns, app/admin/refunds,
// app/profile/refunds and lib/returns.ts' refund state machine all keep
// reading what they already expect. Nothing about how refunds are approved or
// paid changes — this route only creates the request.
//
// firestore.rules is deliberately NOT tightened in this change. The client
// create rule still works, so this route can ship without a rules deploy; the
// `allow create: if false` tightening follows once the form is migrated, the
// same sequencing used for orders.
// ---------------------------------------------------------------------------

const RETURN_RATE_LIMIT_MAX = 10;
const RETURN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Deterministic id: one return per customer per order.
 *
 * This is what makes duplicate submission race-safe without a query — two
 * simultaneous requests resolve to the same document, and the transaction
 * below sees the first one. Same approach already proven on the money path
 * (${uid}_${idempotencyKey} for COD, the payment id for ONLINE).
 *
 * Includes the uid as well as the order id so the id cannot be constructed for
 * someone else's order, even though ownership is separately verified below.
 */
function returnIdFor(uid: string, orderId: string): string {
  return `${uid}_${orderId}`;
}

/**
 * The refund method the customer will actually receive, derived from how they
 * paid — never asked. The form used to collect a refundMethod and nothing ever
 * read it, which let the customer believe they had chosen something.
 *
 * This is a LABEL for the existing admin workflow, not a new mechanism: the
 * money still moves exactly as it does today.
 */
function refundMethodFor(paymentMethod: unknown): string {
  return paymentMethod === "ONLINE"
    ? "Original Payment"
    : "UPI / Bank Transfer (verified by admin)";
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json(
        { error: "Please sign in to request a return." },
        { status: 401 }
      );
    }

    if (
      !(await isWithinRateLimit(
        "request-return",
        requester.uid,
        RETURN_RATE_LIMIT_MAX,
        RETURN_RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const comments =
      typeof body?.comments === "string" ? body.comments.trim() : "";

    if (!orderId || orderId.length > 200) {
      return Response.json(
        { error: "A valid order ID is required." },
        { status: 400 }
      );
    }

    if (!reason || reason.length > 200) {
      return Response.json(
        { error: "Please select a reason for the return." },
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
    const returnRef = db
      .collection("returns")
      .doc(returnIdFor(requester.uid, orderId));

    const outcome = await db.runTransaction<
      | { kind: "created"; needsReview: boolean; windowEndsAt: Date | null }
      | { kind: "error"; status: number; error: string }
    >(async (tx) => {
      // ---- ALL READS FIRST ----
      const orderSnap = await tx.get(orderRef);
      const existingSnap = await tx.get(returnRef);

      if (!orderSnap.exists) {
        // Same wording as the ownership failure below — a caller with no claim
        // on this order learns nothing about whether it exists.
        return { kind: "error", status: 404, error: "Order not found." };
      }

      const order = orderSnap.data() as Record<string, unknown>;

      if (order.userId !== requester.uid) {
        return { kind: "error", status: 404, error: "Order not found." };
      }

      if (order.status !== "Delivered") {
        return {
          kind: "error",
          status: 409,
          error:
            "Returns can only be requested for delivered orders. If your order hasn't arrived yet, please wait until it is delivered.",
        };
      }

      // Duplicate guard. Read inside the transaction so two simultaneous
      // submissions cannot both observe an empty slot.
      if (existingSnap.exists) {
        return {
          kind: "error",
          status: 409,
          error:
            "A return request already exists for this order. You can track it under Profile - Refunds.",
        };
      }

      const basis = returnWindowBasis(order);
      const windowEndsAt = returnWindowEndsAt(order);

      if (!isWithinReturnWindow(order)) {
        return {
          kind: "error",
          status: 409,
          error: `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed.`,
        };
      }

      // No delivery date could be established (seller/admin marked the order
      // Delivered without deliveredAt, and updatedAt is absent too). The
      // request is ALLOWED — rejecting a legitimate return over our own
      // missing data would be worse — but it is marked so an admin can check
      // the delivery date manually before approving.
      const needsReview = basis.source === "unknown";

      // ---- WRITE ----
      // Field-for-field the document app/returns/page.tsx produced, so
      // app/admin/returns, app/admin/refunds, app/profile/refunds and
      // lib/returns.ts all keep reading exactly what they expect. status and
      // refundAmount are pinned to the same values firestore.rules requires of
      // a client create, so the two paths stay indistinguishable downstream.
      tx.set(returnRef, {
        orderId,
        userId: requester.uid,
        customerName:
          typeof order.customerName === "string" && order.customerName
            ? order.customerName
            : "Customer",
        userEmail: requester.email || "",
        reason,
        comments,
        // Derived from how the customer actually paid, never chosen by them.
        refundMethod: refundMethodFor(order.paymentMethod),
        status: "Pending",
        pickupDate: "",
        pickupPartner: "",
        pickupPhone: "",
        refundAmount: 0,
        refundTransactionId: "",
        createdAt: Timestamp.now(),

        // Eligibility provenance, so an admin can see what the window was
        // judged against rather than having to reconstruct it.
        returnWindowBasis: basis.source,
        ...(windowEndsAt
          ? { returnWindowEndsAt: Timestamp.fromDate(windowEndsAt) }
          : {}),
        // Absent (not false) on a normal request, matching how needsReview is
        // written on orders — every consumer tests === true.
        ...(needsReview ? { needsReview: true } : {}),
      });

      return { kind: "created", needsReview, windowEndsAt };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    // Best-effort, outside the transaction — a notification failure must not
    // fail a return request that has already committed. Same admin
    // notification the form wrote before.
    try {
      await db.collection("notifications").add({
        title: "Refund Request",
        message: outcome.needsReview
          ? `A return was requested for order ${orderId.slice(
              0,
              8
            )} with no recorded delivery date — please verify eligibility.`
          : `A return was requested for order ${orderId.slice(0, 8)}.`,
        role: "admin",
        type: "refund",
        read: false,
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("request-return: admin notification failed:", error);
    }

    return Response.json({
      success: true,
      needsReview: outcome.needsReview,
    });
  } catch (error) {
    console.error("request-return: unexpected failure:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
