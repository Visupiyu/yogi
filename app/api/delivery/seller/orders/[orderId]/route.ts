import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sellerOrderRecordId } from "@/lib/sellerOrderRecord";
import { buildSellerShipment, type SellerShipment } from "@/lib/deliveryEngine/sellerProjections";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// GET /api/delivery/seller/orders/[orderId]
//
// Authenticated SELLER delivery tracking for their OWN shipment on an order.
// The delivery job id is deterministic: `${orderId}_${vendorId}` === the
// seller's sellerOrder recordId, so the seller can only ever address their own
// job (a direct doc-get on that id) — no cross-vendor query, no cross-vendor
// access. The stored job.vendorId is additionally verified to equal the caller.
//
// Explicit allow-list projection (buildSellerShipment): never scanToken,
// deliveryOtp, raw GPS, geoAccuracy, deviceId, actor uids, companyId, jobId,
// legId, customer phone, internal event log or commerceReconciledAt. Returns
// shipment: null for a historical / no-job order (existing seller view keeps
// working through itemFulfilment).
export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-seller-order", requester.uid, 120, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

    const { orderId } = await ctx.params;
    if (!orderId) return Response.json({ error: "Missing order id." }, { status: 400 });

    // Own job only — id encodes the caller's uid as the vendorId.
    const jobId = sellerOrderRecordId(orderId, requester.uid);
    const snap = await getAdminDb().collection("deliveryJobs").doc(jobId).get();
    if (!snap.exists) {
      return Response.json({ orderId, shipment: null }); // no delivery job for this seller/order
    }
    const job = snap.data() as DeliveryJob;
    // Defence in depth: the stored vendorId must match the caller.
    if (job.vendorId !== requester.uid) {
      return Response.json({ orderId, shipment: null });
    }

    const shipment: SellerShipment = buildSellerShipment(job);
    return Response.json({ orderId, shipment });
  } catch (error) {
    console.error("delivery/seller order tracking failed:", error);
    return Response.json({ error: "Could not load delivery tracking." }, { status: 500 });
  }
}
