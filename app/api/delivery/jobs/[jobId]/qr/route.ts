import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildQrPayload } from "@/lib/deliveryEngine/qr";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// GET /api/delivery/jobs/[jobId]/qr
//
// The ONLY endpoint that exposes a shipment's scanToken — for label/QR printing.
// Admin-only (ops/label generation). Ordinary job reads (GET /jobs/[jobId],
// /company/jobs, /my-jobs) deliberately never return the token, so a broad
// observation response cannot leak it. A leaked token is still insufficient
// without an authorized actor identity (see execution.applyScan).
export async function GET(
  request: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const requester = await verifyRequestUser(request);
  if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
  if (!(await isWithinRateLimit("delivery-qr", requester.uid, 60, 10 * 60 * 1000)))
    return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

  const { jobId } = await ctx.params;
  const snap = await getAdminDb().collection("deliveryJobs").doc(jobId).get();
  if (!snap.exists) return Response.json({ error: "Delivery job not found." }, { status: 404 });
  const job = snap.data() as DeliveryJob;
  if (!job.scanToken) return Response.json({ error: "This job has no QR token." }, { status: 409 });

  return Response.json({
    jobId,
    shipmentNumber: job.shipmentNumber,
    qr: buildQrPayload(job.shipmentNumber, job.scanToken),
  });
}
