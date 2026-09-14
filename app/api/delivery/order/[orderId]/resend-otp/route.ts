import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { regenerateDeliveryOtp, deliverOtpToCustomer } from "@/lib/deliveryEngine/otpService";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// POST /api/delivery/order/[orderId]/resend-otp
//
// CUSTOMER (order-owner) only. Regenerates the delivery OTP for this order's
// shipment(s) currently OUT FOR DELIVERY and re-notifies the owner (email +
// in-app). Ownership is verified server-side (order.userId === caller uid)
// BEFORE any delivery job is read — a delivery person or seller (whose uid is
// not the order owner) gets the same 404 as a non-existent order. The OTP is
// NEVER returned in the response; only the hash is stored, attempts reset,
// issuedAt refreshed. Rate-limited to bound resend abuse.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-otp-resend", requester.uid, 5, 10 * 60 * 1000)))
      return Response.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 },
      );

    const { orderId } = await ctx.params;
    if (!orderId) return Response.json({ error: "Missing order id." }, { status: 400 });

    const db = getAdminDb();

    // ---- OWNERSHIP FIRST (identical 404 for "no such order" and "not yours") ----
    const orderSnap = await db.collection("orders").doc(orderId).get();
    const notFound = Response.json({ error: "Order not found." }, { status: 404 });
    if (!orderSnap.exists) return notFound;
    const order = orderSnap.data() as Record<string, unknown>;
    if (typeof order.userId !== "string" || order.userId !== requester.uid) return notFound;

    // Shipments for THIS order that are out for delivery (the only state an OTP
    // is meaningful in). Filter in memory — small per-order set, no index.
    const jobsSnap = await db.collection("deliveryJobs").where("orderId", "==", orderId).get();
    const outForDelivery = jobsSnap.docs.filter(
      (d) => (d.data() as DeliveryJob).currentStage === "OutForDelivery",
    );
    if (outForDelivery.length === 0) {
      return Response.json(
        { error: "No shipment is awaiting a delivery code right now." },
        { status: 409 },
      );
    }

    // Regenerate per shipment (fresh hash, reset attempts, new expiry), then
    // notify AFTER commit. A notification failure leaves the durable OTP intact.
    let resent = 0;
    for (const d of outForDelivery) {
      const issue = await db.runTransaction((tx) => regenerateDeliveryOtp(tx, db, { jobId: d.id }));
      if (issue.issued) {
        resent += 1;
        await deliverOtpToCustomer(db, {
          userId: issue.userId,
          userEmail: issue.userEmail,
          customerName: issue.customerName,
          shipmentNumber: issue.shipmentNumber,
          code: issue.code,
        });
      }
    }

    if (resent === 0) {
      // Only reachable if the OTP secret is not configured server-side.
      return Response.json(
        { error: "Delivery codes are temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    // NEVER returns the code — the customer receives it via email + in-app only.
    return Response.json({ success: true, resent });
  } catch (error) {
    console.error("delivery/order/resend-otp failed:", error);
    return Response.json({ error: "Could not resend the delivery code. Please try again." }, { status: 500 });
  }
}
