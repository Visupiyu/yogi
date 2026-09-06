import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { reconcileDeliveredJob, ReconcileError } from "@/lib/deliveryEngine/reconcile";

// POST /api/delivery/jobs/[jobId]/reconcile
//
// Admin-only manual/retry trigger for Delivery -> Commerce reconciliation. The
// primary trigger runs automatically after a successful DELIVER; this is the
// safe retry entry point when that trigger failed (the job stays Delivered with
// commerceReconciledAt unset). Idempotent. The server derives order/sellerOrder
// from the job doc — the client supplies only the jobId in the path, never any
// commerce identity. No payment/inventory/earnings changes.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (!(await isWithinRateLimit("delivery-reconcile", requester.uid, 60, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    const { jobId } = await ctx.params;
    const db = getAdminDb();
    const result = await db.runTransaction((tx) => reconcileDeliveredJob(tx, db, { jobId }));
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ReconcileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("delivery reconcile failed:", error);
    return Response.json({ error: "Could not reconcile this delivery job." }, { status: 500 });
  }
}
