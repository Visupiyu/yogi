import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  buildCustomerShipments,
  type CustomerShipment,
} from "@/lib/deliveryEngine/trackingProjections";
import type { DeliveryJob } from "@/lib/deliveryEngine/types";

// GET /api/delivery/order/[orderId]/shipments
//
// Authenticated CUSTOMER delivery tracking for their OWN order. The order owner
// is verified server-side (order.userId === caller uid) BEFORE any delivery job
// is read, then the response is built from explicit allow-list projections
// (buildCustomerShipments) — deliveryJobs query results are NEVER returned
// directly and never spread. Guests use /api/track-order (order id + email)
// instead; this route is for signed-in owners.
//
// Historical / no-job orders return shipments: [] and everything else keeps
// working through the existing tracking path. No customer sees scanToken,
// deliveryOtp, raw GPS, geoAccuracy, deviceId, actor uids, companyId, jobId,
// legId, full phone, internal event data or commerceReconciledAt.
function asIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try { return (value as { toDate: () => Date }).toDate().toISOString(); } catch { return null; }
  }
  return typeof value === "string" ? value : null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("delivery-order-shipments", requester.uid, 120, 10 * 60 * 1000)))
      return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });

    const { orderId } = await ctx.params;
    if (!orderId) return Response.json({ error: "Missing order id." }, { status: 400 });

    const db = getAdminDb();

    // ---- OWNERSHIP FIRST (before reading any delivery job) ----
    const orderSnap = await db.collection("orders").doc(orderId).get();
    // Identical response for "no such order" and "not your order" so this
    // cannot be used to probe whether an order id exists.
    const notFound = Response.json({ error: "Order not found." }, { status: 404 });
    if (!orderSnap.exists) return notFound;
    const order = orderSnap.data() as Record<string, unknown>;
    if (typeof order.userId !== "string" || order.userId !== requester.uid) return notFound;

    // ---- Delivery jobs for THIS order only ----
    const jobsSnap = await db.collection("deliveryJobs").where("orderId", "==", orderId).get();
    const jobs = jobsSnap.docs.map((d) => d.data() as DeliveryJob);
    const shipments: CustomerShipment[] = buildCustomerShipments(jobs);

    return Response.json({
      orderId,
      orderNumber: typeof order.orderNumber === "string" ? order.orderNumber : null,
      // Real stored data only — never an invented ETA.
      expectedDelivery: asIso(order.expectedDelivery) ?? asIso(order.deliveryDate),
      shipments, // [] for historical/no-job orders
    });
  } catch (error) {
    console.error("delivery/order shipments failed:", error);
    return Response.json({ error: "Could not load delivery tracking." }, { status: 500 });
  }
}
