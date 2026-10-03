import { randomUUID } from "node:crypto";
import { sendOrderStatusEmail } from "@/lib/orderStatusEmail";
import Razorpay from "razorpay";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { assertRazorpayTestKeyInPreview } from "@/lib/razorpayEnv";

// SERVER-ONLY. Never import from a "use client" component — this file reads
// RAZORPAY_KEY_SECRET.
//
// ---------------------------------------------------------------------------
// ORDER REFUND OPERATION (cancelled, captured ONLINE payments)
// ---------------------------------------------------------------------------
// app/api/cancel-order (and lib/onlineOrder's duplicate-payment record) record
// a refund OBLIGATION: refundStatus "Required" + refundAmountDue. This module
// discharges it through Razorpay's refund API instead of the admin doing it by
// hand in the Razorpay dashboard. The manual "record a refund made elsewhere"
// path in app/admin/orders stays available as the explicit fallback.
//
// What is refunded is ONLY refundAmountDue, written server-side at
// cancellation. For a reward-assisted order that is finalTotal — the money
// actually captured; the reward-funded part was already returned as points by
// the cancellation's own cancel_restore ledger movement (lib/points). So money
// and points are each returned once, by their own ledger, and nothing here
// touches points, seller records or payouts. The amount, the order and the
// payment id are never taken from the request.
//
// State on orders/{id} (refundStatus keeps its existing meaning everywhere):
//   Required    owed, nothing sent                     (cancellation)
//   Processing  Razorpay accepted the refund (pending) — or an admin marked a
//               manual refund as initiated
//   Refunded    Razorpay reports it processed (or an admin recorded a manual
//               refund with a reference)
//   Failed      the automatic attempt did not go through — money NOT returned;
//               refundLastError says why; retry allowed
// plus refundAttempt { id, state, startedAt, ... } — the in-flight lock. While
// a call to Razorpay is outstanding refundStatus is NOT changed, so a customer
// never reads "initiated" before Razorpay has accepted anything.
//
// IDEMPOTENCY / DOUBLE-REFUND DEFENCES
//   1. A transaction claims refundAttempt before Razorpay is called; a second
//      click/retry/concurrent request sees the live claim and stops.
//   2. Before creating, Razorpay's own refund list for the payment is checked
//      for a refund tagged with this order (notes.yomicoOrderId) — so an
//      attempt whose response was lost (timeout, crash after Razorpay accepted)
//      is RECOVERED, not repeated.
//   3. Any OTHER refund already on the payment (e.g. one made by hand in the
//      dashboard) stops the automatic refund for manual reconciliation.
//   4. Razorpay itself refuses to refund more than was captured.
// ---------------------------------------------------------------------------

export type RefundOutcome =
  | { kind: "refunded"; amount: number; razorpayRefundId: string }
  | { kind: "processing"; amount: number; razorpayRefundId: string }
  | { kind: "already"; refundStatus: string }
  | { kind: "in_progress" }
  | { kind: "failed"; status: number; error: string }
  | { kind: "not_configured" }
  | { kind: "error"; status: number; error: string };

type RazorpayRefundEntity = {
  id: string;
  amount: number;
  status: string;
  payment_id?: string;
  notes?: Record<string, unknown> | unknown[];
};

type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number;
  amount_refunded?: number;
  currency?: string;
};

/** The subset of the Razorpay SDK this module uses — injectable for tests. */
export type RazorpayRefundClient = {
  payments: {
    fetch(paymentId: string): Promise<RazorpayPaymentEntity>;
    refund(paymentId: string, params: Record<string, unknown>): Promise<RazorpayRefundEntity>;
    fetchMultipleRefund(paymentId: string, params?: Record<string, unknown>): Promise<{ items?: RazorpayRefundEntity[] }>;
    fetchRefund(paymentId: string, refundId: string): Promise<RazorpayRefundEntity>;
  };
};

/** True when the server holds Razorpay API credentials (values never read out). */
export function isRazorpayRefundConfigured(): boolean {
  return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
}

function defaultClient(): RazorpayRefundClient | null {
  if (!isRazorpayRefundConfigured()) return null;
  assertRazorpayTestKeyInPreview();
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  }) as unknown as RazorpayRefundClient;
}

/** A claim older than this is treated as abandoned (the request died mid-call). */
export const REFUND_LOCK_MS = 2 * 60 * 1000;

const REFUNDABLE = new Set(["Required", "Failed", "Processing"]);

function noteOrderId(refund: RazorpayRefundEntity): string | null {
  const notes = refund.notes;
  if (!notes || Array.isArray(notes)) return null;
  const v = (notes as Record<string, unknown>).yomicoOrderId;
  return typeof v === "string" ? v : null;
}

function toMillis(v: unknown): number {
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
}

// Razorpay SDK rejections look like { statusCode, error: { code, description } }.
// Only Razorpay's own short code/description is ever kept — never a stack, a
// request, or any credential. statusCode 4xx = Razorpay definitively refused.
function describeRazorpayError(err: unknown): { definitive: boolean; code: string; message: string } {
  const e = err as { statusCode?: unknown; error?: { code?: unknown; description?: unknown } } | null;
  const statusCode = Number(e?.statusCode);
  const code = typeof e?.error?.code === "string" ? e.error.code.slice(0, 60) : "UNKNOWN";
  const description =
    typeof e?.error?.description === "string" ? e.error.description.slice(0, 300) : "";
  const definitive = Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500;
  return {
    definitive,
    code,
    message: description || (definitive ? "Razorpay refused the refund." : "Razorpay did not confirm the refund."),
  };
}

type OrderRefundView = {
  refundStatus: string;
  paymentMethod: string;
  status: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  amountDue: number;
  razorpayRefundId: string;
  attempt: { id?: string; state?: string; startedAt?: unknown } | null;
};

function readOrder(data: FirebaseFirestore.DocumentData): OrderRefundView {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const attempt = data.refundAttempt && typeof data.refundAttempt === "object" ? data.refundAttempt : null;
  return {
    refundStatus: s(data.refundStatus),
    paymentMethod: s(data.paymentMethod),
    status: s(data.status),
    razorpayPaymentId: s(data.razorpayPaymentId),
    razorpayOrderId: s(data.razorpayOrderId),
    amountDue: Number(data.refundAmountDue),
    razorpayRefundId: s(data.razorpayRefundId),
    attempt,
  };
}

/**
 * Eligibility for an AUTOMATIC refund, judged on the stored order only. The
 * payment reference must be the one the finalizers key the order on (doc id
 * === razorpayPaymentId — lib/onlineOrder#onlineOrderIdFor), which is the
 * evidence that this order and this payment belong together.
 */
function checkEligible(orderId: string, o: OrderRefundView): { ok: true } | { ok: false; status: number; error: string } {
  if (o.paymentMethod !== "ONLINE") {
    return { ok: false, status: 409, error: "Only online (Razorpay) payments can be refunded automatically." };
  }
  if (o.status !== "Cancelled") {
    return { ok: false, status: 409, error: "Only cancelled orders carry a refund to process." };
  }
  if (!REFUNDABLE.has(o.refundStatus)) {
    return { ok: false, status: 409, error: "This order has no outstanding refund." };
  }
  if (!o.razorpayPaymentId.startsWith("pay_") || o.razorpayPaymentId !== orderId) {
    return {
      ok: false,
      status: 409,
      error: "This order's payment reference can't be matched for an automatic refund. Refund it manually and record it.",
    };
  }
  if (!Number.isFinite(o.amountDue) || o.amountDue <= 0) {
    return { ok: false, status: 409, error: "This order has no valid refund amount recorded." };
  }
  return { ok: true };
}

type Actor = { uid: string; email: string | null };

/**
 * Writes the outcome of a Razorpay refund onto the order, but only if THIS
 * attempt still owns it (attemptId) — or, for a status sync/webhook
 * (attemptId null), only if the order is waiting on exactly this refund id.
 */
async function applyRefundResult(params: Parameters<typeof applyRefundResultTx>[0]): Promise<RefundOutcome> {
  const outcome = await applyRefundResultTx(params);
  // Customer "refunded" email — only after Razorpay's processed refund is
  // recorded (committed above), once per order, never able to fail it.
  if (outcome.kind === "refunded") await sendOrderStatusEmail(params.orderId, "refunded");
  return outcome;
}

async function applyRefundResultTx(params: {
  orderId: string;
  attemptId: string | null;
  refund: RazorpayRefundEntity;
  actor: Actor | null;
  source: "admin" | "sync" | "webhook";
}): Promise<RefundOutcome> {
  const { orderId, attemptId, refund, actor, source } = params;
  const db = getAdminDb();
  const ref = db.collection("orders").doc(orderId);
  const amount = Math.round(Number(refund.amount)) / 100;

  return db.runTransaction<RefundOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: "error", status: 404, error: "Order not found." };
    const o = readOrder(snap.data()!);
    const now = Timestamp.now();

    if (attemptId !== null && o.attempt?.id !== attemptId) {
      // Another attempt took over (ours was judged stale). It will find this
      // same refund by its notes and record it — never write twice.
      return { kind: "in_progress" };
    }
    if (attemptId === null && o.razorpayRefundId !== refund.id) {
      return { kind: "error", status: 409, error: "This order is not waiting on that refund." };
    }
    if (o.refundStatus === "Refunded") {
      // Already recorded (e.g. by the manual path). Keep that record, but note
      // the Razorpay refund for reconciliation rather than silently drop it.
      tx.set(ref, { razorpayRefundId: refund.id, refundProviderStatus: refund.status, needsReview: true, updatedAt: now }, { merge: true });
      return { kind: "already", refundStatus: "Refunded" };
    }

    const audit = (action: string, details: Record<string, unknown>) =>
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: actor?.uid || "",
        actorEmail: actor?.email || "",
        action,
        targetId: orderId,
        details: { ...details, source, razorpayRefundId: refund.id, amount },
        createdAt: now,
      });

    if (refund.status === "processed") {
      tx.update(ref, {
        refundStatus: "Refunded",
        refundedAmount: amount,
        refundTransactionId: refund.id,
        razorpayRefundId: refund.id,
        refundProviderStatus: "processed",
        refundMethod: "razorpay_api",
        refundedAt: now,
        refundedBy: actor?.uid || source,
        refundLastError: FieldValue.delete(),
        "refundAttempt.state": "done",
        "refundAttempt.finishedAt": now,
        updatedAt: now,
      });
      audit("order_refund_completed", {});
      return { kind: "refunded", amount, razorpayRefundId: refund.id };
    }

    if (refund.status === "failed") {
      tx.update(ref, {
        refundStatus: "Failed",
        razorpayRefundId: refund.id,
        refundProviderStatus: "failed",
        refundMethod: "razorpay_api",
        refundLastError: { code: "REFUND_FAILED", message: "Razorpay reported this refund as failed.", at: now },
        refundFailedAt: now,
        "refundAttempt.state": "failed",
        "refundAttempt.finishedAt": now,
        updatedAt: now,
      });
      audit("order_refund_failed", { code: "REFUND_FAILED" });
      return { kind: "failed", status: 502, error: "Razorpay reported this refund as failed. You can retry." };
    }

    // pending — accepted by Razorpay, settles later (status sync / webhook).
    tx.update(ref, {
      refundStatus: "Processing",
      razorpayRefundId: refund.id,
      refundProviderStatus: refund.status || "pending",
      refundMethod: "razorpay_api",
      refundSubmittedAt: now,
      refundLastError: FieldValue.delete(),
      "refundAttempt.state": "submitted",
      "refundAttempt.finishedAt": now,
      updatedAt: now,
    });
    audit("order_refund_submitted", {});
    return { kind: "processing", amount, razorpayRefundId: refund.id };
  });
}

async function markAttemptFailed(params: {
  orderId: string;
  attemptId: string;
  code: string;
  message: string;
  actor: Actor;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("orders").doc(params.orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const o = readOrder(snap.data()!);
    if (o.attempt?.id !== params.attemptId) return;
    const now = Timestamp.now();
    tx.update(ref, {
      // This attempt returned no money. An order already marked Processing (a
      // refund pending at Razorpay, or one an admin initiated by hand) keeps
      // that status — only the attempt is closed and the reason recorded.
      ...(o.refundStatus === "Processing" ? {} : { refundStatus: "Failed", refundFailedAt: now }),
      refundLastError: { code: params.code, message: params.message, at: now, ...(params.details || {}) },
      "refundAttempt.state": "failed",
      "refundAttempt.finishedAt": now,
      updatedAt: now,
    });
    tx.set(db.collection("audit_logs").doc(), {
      actorUid: params.actor.uid,
      actorEmail: params.actor.email || "",
      action: "order_refund_failed",
      targetId: params.orderId,
      details: { code: params.code, ...(params.details || {}) },
      createdAt: now,
    });
  });
}

/**
 * Admin action: refund the order's outstanding refundAmountDue to the original
 * Razorpay payment, or — when Razorpay already holds a refund for this order —
 * bring the order up to date with it.
 */
export async function executeOrderRefund(params: {
  orderId: string;
  actor: Actor;
  client?: RazorpayRefundClient | null;
}): Promise<RefundOutcome> {
  const { orderId, actor } = params;
  const client = params.client === undefined ? defaultClient() : params.client;
  if (!client) return { kind: "not_configured" };

  const db = getAdminDb();
  const ref = db.collection("orders").doc(orderId);
  const attemptId = randomUUID();

  // ---- 1. CLAIM (transaction) ----
  type Claim =
    | { kind: "claimed"; o: OrderRefundView }
    | { kind: "sync"; o: OrderRefundView }
    | { kind: "done"; outcome: RefundOutcome };
  const claim = await db.runTransaction<Claim>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: "done", outcome: { kind: "error", status: 404, error: "Order not found." } };
    const o = readOrder(snap.data()!);
    if (o.refundStatus === "Refunded") {
      return { kind: "done", outcome: { kind: "already", refundStatus: "Refunded" } };
    }
    const eligible = checkEligible(orderId, o);
    if (!eligible.ok) return { kind: "done", outcome: { kind: "error", status: eligible.status, error: eligible.error } };

    const startedAt = toMillis(o.attempt?.startedAt);
    if (o.attempt?.state === "calling" && Date.now() - startedAt < REFUND_LOCK_MS) {
      return { kind: "done", outcome: { kind: "in_progress" } };
    }
    // Razorpay already accepted a refund for this order: never create another
    // — just ask Razorpay where it stands.
    if (o.refundStatus === "Processing" && o.razorpayRefundId) return { kind: "sync", o };

    const now = Timestamp.now();
    tx.update(ref, {
      refundAttempt: { id: attemptId, state: "calling", startedAt: now, byUid: actor.uid, byEmail: actor.email || "" },
      refundAttemptCount: FieldValue.increment(1),
      updatedAt: now,
    });
    return { kind: "claimed", o };
  });

  if (claim.kind === "done") return claim.outcome;
  if (claim.kind === "sync") return syncOrderRefund({ orderId, actor, client });

  const o = claim.o;
  const amountPaise = Math.round(o.amountDue * 100);

  // ---- 2. VERIFY THE PAYMENT WITH RAZORPAY ----
  let payment: RazorpayPaymentEntity;
  try {
    payment = await client.payments.fetch(o.razorpayPaymentId);
  } catch (err) {
    const e = describeRazorpayError(err);
    await markAttemptFailed({ orderId, attemptId, code: `PAYMENT_LOOKUP_${e.code}`, message: "Couldn't verify the payment with Razorpay. No refund was made.", actor });
    return { kind: "failed", status: 502, error: "Couldn't verify the payment with Razorpay. No refund was made — you can retry." };
  }

  const belongs =
    payment.id === o.razorpayPaymentId &&
    (!o.razorpayOrderId || payment.order_id === o.razorpayOrderId) &&
    (payment.status === "captured" || payment.status === "refunded") &&
    (!payment.currency || payment.currency === "INR") &&
    Number(payment.amount) >= amountPaise;
  if (!belongs) {
    await markAttemptFailed({
      orderId, attemptId, code: "PAYMENT_MISMATCH",
      message: "The Razorpay payment does not match this order (id, Razorpay order, capture state or amount). No refund was made.",
      actor,
    });
    return { kind: "failed", status: 409, error: "The Razorpay payment doesn't match this order. No refund was made — check it in the Razorpay dashboard." };
  }

  // ---- 3. RECOVER OR STOP ON EXISTING REFUNDS ----
  let existing: RazorpayRefundEntity[] = [];
  try {
    existing = (await client.payments.fetchMultipleRefund(o.razorpayPaymentId, { count: 100 }))?.items || [];
  } catch (err) {
    const e = describeRazorpayError(err);
    await markAttemptFailed({ orderId, attemptId, code: `REFUND_LOOKUP_${e.code}`, message: "Couldn't read existing refunds from Razorpay. No refund was made.", actor });
    return { kind: "failed", status: 502, error: "Couldn't check existing refunds with Razorpay. No refund was made — you can retry." };
  }
  const ours = existing.find((r) => noteOrderId(r) === orderId && r.status !== "failed");
  if (ours) {
    return applyRefundResult({ orderId, attemptId, refund: ours, actor, source: "admin" });
  }
  const foreign = existing.filter((r) => r.status !== "failed");
  if (foreign.length > 0 || Number(payment.amount_refunded || 0) > 0) {
    const refunded = Number(payment.amount_refunded || 0) / 100;
    await markAttemptFailed({
      orderId, attemptId, code: "EXISTING_REFUND",
      message: `Razorpay already shows ₹${refunded.toLocaleString("en-IN")} refunded on this payment by another route. Verify it in the Razorpay dashboard and record it manually.`,
      actor,
      details: { existingRefundIds: foreign.map((r) => r.id).slice(0, 10), amountRefundedPaise: Number(payment.amount_refunded || 0) },
    });
    return { kind: "failed", status: 409, error: "Razorpay already has a refund on this payment. Verify it in the dashboard and record it manually." };
  }

  // ---- 4. CREATE THE REFUND ----
  let refund: RazorpayRefundEntity;
  try {
    refund = await client.payments.refund(o.razorpayPaymentId, {
      amount: amountPaise,
      speed: "normal",
      receipt: `yomico_${orderId}`.slice(0, 40),
      notes: { yomicoOrderId: orderId, yomicoAttemptId: attemptId },
    });
  } catch (err) {
    const e = describeRazorpayError(err);
    if (!e.definitive) {
      // Outcome unknown (timeout / 5xx). Look once more: if Razorpay did take
      // it, record it; if not, close the attempt — a retry repeats step 3 and
      // so still cannot double-refund.
      try {
        const again = (await client.payments.fetchMultipleRefund(o.razorpayPaymentId, { count: 100 }))?.items || [];
        const found = again.find((r) => noteOrderId(r) === orderId && r.status !== "failed");
        if (found) return applyRefundResult({ orderId, attemptId, refund: found, actor, source: "admin" });
      } catch {
        /* fall through to UNCONFIRMED */
      }
      await markAttemptFailed({ orderId, attemptId, code: "UNCONFIRMED", message: "Razorpay did not confirm the refund. Retrying is safe: an existing refund is detected before a new one is made.", actor });
      return { kind: "failed", status: 502, error: "Razorpay didn't confirm the refund. Retrying is safe." };
    }
    await markAttemptFailed({ orderId, attemptId, code: e.code, message: e.message, actor });
    return { kind: "failed", status: 502, error: `Razorpay refused the refund: ${e.message}` };
  }

  // ---- 5. RECORD ----
  return applyRefundResult({ orderId, attemptId, refund, actor, source: "admin" });
}

/** Re-reads a pending Razorpay refund and records where it now stands. */
export async function syncOrderRefund(params: {
  orderId: string;
  actor: Actor | null;
  client?: RazorpayRefundClient | null;
}): Promise<RefundOutcome> {
  const client = params.client === undefined ? defaultClient() : params.client;
  if (!client) return { kind: "not_configured" };
  const snap = await getAdminDb().collection("orders").doc(params.orderId).get();
  if (!snap.exists) return { kind: "error", status: 404, error: "Order not found." };
  const o = readOrder(snap.data()!);
  if (o.refundStatus === "Refunded") return { kind: "already", refundStatus: "Refunded" };
  if (!o.razorpayRefundId || !o.razorpayPaymentId) {
    return { kind: "error", status: 409, error: "No Razorpay refund is pending on this order." };
  }
  let refund: RazorpayRefundEntity;
  try {
    refund = await client.payments.fetchRefund(o.razorpayPaymentId, o.razorpayRefundId);
  } catch {
    return { kind: "error", status: 502, error: "Couldn't reach Razorpay to check the refund. Try again shortly." };
  }
  if (refund.payment_id && refund.payment_id !== o.razorpayPaymentId) {
    return { kind: "error", status: 409, error: "That refund does not belong to this order's payment." };
  }
  if (refund.status === "pending" && o.refundStatus === "Processing") {
    return { kind: "processing", amount: Math.round(Number(refund.amount)) / 100, razorpayRefundId: refund.id };
  }
  return applyRefundResult({ orderId: params.orderId, attemptId: null, refund, actor: params.actor, source: params.actor ? "sync" : "webhook" });
}

/**
 * Razorpay webhook (refund.processed / refund.failed). The order is located
 * by the refund's own notes.yomicoOrderId and must already be waiting on this
 * exact refund id and payment — a refund YOMICO did not create changes nothing.
 */
export async function applyRefundWebhook(refund: RazorpayRefundEntity): Promise<RefundOutcome> {
  const orderId = noteOrderId(refund);
  if (!orderId || typeof refund.id !== "string") return { kind: "error", status: 200, error: "Not a YOMICO refund." };
  const snap = await getAdminDb().collection("orders").doc(orderId).get();
  if (!snap.exists) return { kind: "error", status: 200, error: "Order not found." };
  const o = readOrder(snap.data()!);
  if (o.razorpayRefundId !== refund.id || (refund.payment_id && refund.payment_id !== o.razorpayPaymentId)) {
    return { kind: "error", status: 200, error: "Order is not waiting on this refund." };
  }
  if (refund.status !== "processed" && refund.status !== "failed") return { kind: "processing", amount: 0, razorpayRefundId: refund.id };
  return applyRefundResult({ orderId, attemptId: null, refund, actor: null, source: "webhook" });
}
