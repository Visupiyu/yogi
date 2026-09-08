import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDeliveryActor } from "@/lib/deliveryEngine/serverAuth";
import { parseQrPayload } from "@/lib/deliveryEngine/qr";
import { applyScan, ExecutionError, type ScanArgs } from "@/lib/deliveryEngine/execution";
import { reconcileDeliveredJob } from "@/lib/deliveryEngine/reconcile";
import { ensureDeliveryOtp, deliverOtpToCustomer } from "@/lib/deliveryEngine/otpService";
import type { ExecutionAction } from "@/lib/deliveryEngine/types";

// POST /api/delivery/scan
//
// The single physical-execution endpoint. PERSON-ONLY: only a delivery person
// scans a shipment. Admin and company owners can never scan on a person's
// behalf. The QR resolves the job; the transaction independently authorizes the
// actor, leg state and transition (a QR is never authorization by itself).
//
// Body: { qr? | (shipmentNumber, scanToken), action, clientEventId,
//         capturedAt?, geo?, geoAccuracy?, deviceId?, handoverToPersonId?,
//         otp?, exceptionCode?, notes? }
const ACTIONS: ReadonlySet<string> = new Set([
  "PICKUP", "DEPART", "ARRIVE", "OUT_FOR_DELIVERY",
  "HANDOVER_INITIATE", "HANDOVER_CONFIRM", "DELIVER", "ATTEMPT_FAILED", "EXCEPTION",
]);

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-scan", requester.uid, 120, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

    // Only a delivery person may scan.
    const actor = await resolveDeliveryActor(requester.uid, requester.email);
    if (actor.role !== "person")
      return Response.json({ error: "Only a delivery person can scan a shipment." }, { status: 403 });

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

    // Resolve the QR payload (opaque shipment identity + token).
    const parsed = body.qr
      ? parseQrPayload(body.qr)
      : (typeof body.shipmentNumber === "string" && typeof body.scanToken === "string"
          ? parseQrPayload(`${body.shipmentNumber}.${body.scanToken}`)
          : null);
    if (!parsed) return Response.json({ error: "Invalid shipment QR." }, { status: 400 });

    const action = typeof body.action === "string" ? body.action : "";
    if (!ACTIONS.has(action)) return Response.json({ error: "Invalid action." }, { status: 400 });
    const clientEventId = typeof body.clientEventId === "string" ? body.clientEventId : "";
    if (!clientEventId) return Response.json({ error: "Missing clientEventId." }, { status: 400 });

    const db = getAdminDb();

    // Resolve the job by its (unique) shipment number. Token is verified inside
    // the transaction against the authoritative job doc.
    const jobQ = await db.collection("deliveryJobs").where("shipmentNumber", "==", parsed.shipmentNumber).limit(1).get();
    if (jobQ.empty) return Response.json({ error: "Shipment not found." }, { status: 404 });
    const jobId = jobQ.docs[0].id;

    const scanArgs: ScanArgs = {
      jobId,
      scanToken: parsed.scanToken,
      action: action as ExecutionAction,
      actor: {
        uid: requester.uid,
        personId: actor.personId,
        providerType: actor.providerType,
        companyId: actor.companyId,
      },
      evidence: {
        clientEventId,
        capturedAt: body.capturedAt ?? null,
        geo: (body.geo as { lat: number; lng: number } | null) ?? null,
        geoAccuracy: typeof body.geoAccuracy === "number" ? body.geoAccuracy : null,
        deviceId: typeof body.deviceId === "string" ? body.deviceId : null,
      },
      handoverToPersonId: typeof body.handoverToPersonId === "string" ? body.handoverToPersonId : null,
      otp: typeof body.otp === "string" ? body.otp : null,
      exceptionCode: (typeof body.exceptionCode === "string" ? body.exceptionCode : null) as ScanArgs["exceptionCode"],
      notes: typeof body.notes === "string" ? body.notes : null,
    };

    const result = await db.runTransaction((tx) => applyScan(tx, db, scanArgs));

    // DELIVER with a bad/missing/expired/locked customer OTP: the shipment was
    // NOT delivered (still OutForDelivery). Return a GENERIC 403 that reveals
    // nothing about which case occurred and never echoes the OTP.
    if (result.otpFailed) {
      return Response.json({ error: "Customer OTP verification failed." }, { status: 403 });
    }

    // Post-OUT_FOR_DELIVERY: issue the customer delivery OTP (separate
    // transaction; stores the HASH only) then notify the order owner AFTER the
    // commit (never inside a transaction). Idempotent — a re-entry with an
    // active OTP is a no-op. The plaintext never enters this route's response.
    if (result.action === "OUT_FOR_DELIVERY" && result.applied) {
      try {
        const issue = await db.runTransaction((tx) => ensureDeliveryOtp(tx, db, { jobId }));
        if (issue.issued) {
          // Best-effort notification: a failure leaves the durable OTP intact
          // (the customer can Resend); it must not fail the scan.
          await deliverOtpToCustomer(db, {
            userId: issue.userId,
            userEmail: issue.userEmail,
            customerName: issue.customerName,
            shipmentNumber: issue.shipmentNumber,
            code: issue.code,
          });
        }
      } catch (otpError) {
        console.error("delivery OTP issue/notify deferred (retryable via resend):", otpError);
      }
    }

    // Post-DELIVER commerce reconciliation (separate transaction, never the
    // same cross-engine transaction). The DELIVER above is already durably
    // committed (job.status="Delivered" + immutable event); this reflects it
    // into the sellerOrder/order. It is idempotent, so if it fails here the
    // job simply stays Delivered with commerceReconciledAt unset and the admin
    // reconcile endpoint (or a later re-invocation) safely completes it — this
    // is NOT best-effort-and-forget, the durable state guarantees retry.
    if (result.action === "DELIVER" && result.jobStatus === "Delivered") {
      try {
        await db.runTransaction((tx) => reconcileDeliveredJob(tx, db, { jobId }));
      } catch (reconcileError) {
        console.error("post-DELIVER reconciliation deferred (retryable):", reconcileError);
      }
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ExecutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("delivery/scan failed:", error);
    return Response.json({ error: "Could not process this scan." }, { status: 500 });
  }
}
