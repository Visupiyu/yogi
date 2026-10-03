import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";
import { executeOrderRefund, syncOrderRefund, type RefundOutcome } from "@/lib/refunds/orderRefund";

// ---------------------------------------------------------------------------
// POST /api/admin/orders/{orderId}/refund   { action?: "refund" | "sync" }
//
// Admin-only. "refund" (default) returns the order's outstanding
// refundAmountDue to the original Razorpay payment; "sync" re-checks a refund
// Razorpay accepted but has not settled yet. The order id is the ONLY input —
// amount, payment id and eligibility come from the stored order and from
// Razorpay itself (lib/refunds/orderRefund.ts). Safe to repeat: a duplicate
// or concurrent request never creates a second Razorpay refund.
//
// When the server has no Razorpay credentials this answers 503
// "not configured" and changes nothing; the manual record-a-refund path in
// /admin/orders remains available.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function respond(outcome: RefundOutcome) {
  switch (outcome.kind) {
    case "refunded":
      return Response.json({ success: true, refundStatus: "Refunded", amount: outcome.amount, razorpayRefundId: outcome.razorpayRefundId });
    case "processing":
      return Response.json({ success: true, refundStatus: "Processing", amount: outcome.amount, razorpayRefundId: outcome.razorpayRefundId });
    case "already":
      return Response.json({ success: true, alreadyRefunded: true, refundStatus: outcome.refundStatus });
    case "in_progress":
      return Response.json({ error: "A refund for this order is already being submitted. Wait a moment and refresh." }, { status: 409 });
    case "not_configured":
      return Response.json(
        {
          error: "Automatic refunds aren't configured on this server. Refund the customer in the Razorpay dashboard, then use Record Refund.",
          notConfigured: true,
        },
        { status: 503 }
      );
    case "failed":
    case "error":
      return Response.json({ error: outcome.error }, { status: outcome.status });
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("admin-order-refund", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const { id } = await ctx.params;
    if (!isValidDocId(id)) return Response.json({ error: "Order not found." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const action = body?.action === undefined ? "refund" : body.action;
    if (action !== "refund" && action !== "sync") {
      return Response.json({ error: "action must be refund or sync." }, { status: 400 });
    }

    const actor = { uid: requester.uid, email: requester.email };
    const outcome =
      action === "sync"
        ? await syncOrderRefund({ orderId: id, actor })
        : await executeOrderRefund({ orderId: id, actor });
    return respond(outcome);
  } catch (error) {
    console.error("admin/orders/refund failed:", error instanceof Error ? error.name : "unknown");
    // The failure may have happened after Razorpay accepted a refund, so this
    // must not claim nothing was sent. Retrying is safe: the next attempt
    // finds any refund Razorpay already holds for this order before creating one.
    return Response.json({ error: "Couldn't finish the refund. Refresh the order, then retry — a retry never refunds twice." }, { status: 500 });
  }
}
