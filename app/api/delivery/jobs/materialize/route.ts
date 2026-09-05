import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  createJobAndInitialLeg,
  canMaterializeStatus,
} from "@/lib/deliveryEngine/jobFactory";
import {
  vendorsOnOrder,
  type SellerOrderItem,
} from "@/lib/sellerOrderRecord";

// ---------------------------------------------------------------------------
// POST /api/delivery/jobs/materialize   { orderId }
//
// Phase 2B-2. The ONE place a DeliveryJob comes into existence from a real
// order. Admin-triggered only (Phase 2B-2 does NOT auto-fire on confirmation).
// confirm-order is deliberately untouched: this is a separate, explicit step.
//
// For a confirmed order it creates exactly one DeliveryJob per (orderId,
// vendorId) -- with only that vendor's items -- each with its initial Pickup
// leg and a JobCreated event, minting that parcel's own shipment number and
// keeping the order-level shipment number as an audit reference. Every field is
// derived SERVER-SIDE from the stored order/sellerOrders; the client supplies
// only the orderId. Nothing about money, inventory, payment, rewards,
// commission, earnings, wallet, settlement or order status is read for a
// decision or ever written -- job creation is financially/operationally
// neutral.
//
// Idempotent: re-running skips jobs that already exist (deterministic ids) and
// burns no shipment number for them, so it is safe to call repeatedly.
//
// One Firestore transaction PER vendor: the creation helper does an existence
// read then mints (a counter read+write) then writes the job. Running two jobs
// in a single transaction would read-after-write on the second existence check
// and double-mint the shipment counter.
// ---------------------------------------------------------------------------

type JobResult =
  | { vendorId: string; created: true; jobId: string; shipmentNumber: string }
  | { vendorId: string; created: false; jobId: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (!requester.isAdmin) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }
    if (
      !(await isWithinRateLimit(
        "delivery-jobs-materialize",
        requester.uid,
        60,
        10 * 60 * 1000
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { orderId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) {
      return Response.json({ error: "Missing order id." }, { status: 400 });
    }

    const db = getAdminDb();

    // Read the order (outside any transaction; snapshot for job content).
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }
    const order = orderSnap.data() as Record<string, unknown>;

    // Whitelist gate: a job may exist only for a confirmed, in-fulfilment order
    // (Confirmed/Packed/Shipped/Out For Delivery) that is not under review.
    // Pending, Cancelled, Delivered, missing, unknown statuses are all rejected.
    // Read from the stored order, never from the request, so it cannot be
    // spoofed.
    if (!canMaterializeStatus(order.status, order.needsReview)) {
      return Response.json(
        {
          error:
            "This order is not ready for delivery jobs. It must be a confirmed, in-fulfilment order that is not under review.",
        },
        { status: 409 }
      );
    }

    // Fan-out authority: the confirmed per-vendor snapshot. Prefer the
    // sellerOrders records created at confirmation; fall back to the vendor set
    // derived from the order itself if (legacy) none were written.
    const sellerOrdersSnap = await db
      .collection("sellerOrders")
      .where("orderId", "==", orderId)
      .get();

    const vendorItems = new Map<string, SellerOrderItem[]>();
    const vendorCustomerName = new Map<string, string>();
    if (!sellerOrdersSnap.empty) {
      sellerOrdersSnap.forEach((d) => {
        const so = d.data() as {
          vendorId?: unknown;
          items?: unknown;
          customerName?: unknown;
        };
        const vId = typeof so.vendorId === "string" ? so.vendorId : "";
        if (!vId) return;
        vendorItems.set(
          vId,
          Array.isArray(so.items) ? (so.items as SellerOrderItem[]) : []
        );
        vendorCustomerName.set(
          vId,
          typeof so.customerName === "string" ? so.customerName : ""
        );
      });
    } else {
      const orderItems = Array.isArray(order.items)
        ? (order.items as SellerOrderItem[])
        : [];
      for (const vId of vendorsOnOrder(order)) {
        vendorItems.set(
          vId,
          orderItems.filter((it) => it?.vendorId === vId)
        );
      }
    }

    if (vendorItems.size === 0) {
      return Response.json(
        { error: "No vendors found on this order." },
        { status: 409 }
      );
    }

    // Seller (store) name: from the order snapshot; vendor lookup only as a
    // fallback (ruling 5). Order lines carry vendorName per item.
    const orderItemsAll = Array.isArray(order.items)
      ? (order.items as { vendorId?: unknown; vendorName?: unknown }[])
      : [];
    const nameFromSnapshot = new Map<string, string>();
    for (const it of orderItemsAll) {
      const vId = typeof it?.vendorId === "string" ? it.vendorId : "";
      const nm = typeof it?.vendorName === "string" ? it.vendorName : "";
      if (vId && nm && !nameFromSnapshot.has(vId)) nameFromSnapshot.set(vId, nm);
    }
    // Fallback: resolve any missing store name via a vendors lookup by uid.
    async function resolveVendorName(vendorId: string): Promise<string> {
      const snap = nameFromSnapshot.get(vendorId);
      if (snap) return snap;
      try {
        const vq = await db
          .collection("vendors")
          .where("uid", "==", vendorId)
          .limit(1)
          .get();
        const v = vq.docs[0]?.data() as
          | { businessName?: unknown; storeName?: unknown; name?: unknown }
          | undefined;
        return (
          (typeof v?.businessName === "string" && v.businessName) ||
          (typeof v?.storeName === "string" && v.storeName) ||
          (typeof v?.name === "string" && v.name) ||
          ""
        );
      } catch {
        return "";
      }
    }

    const orderShipmentNumber =
      typeof order.shipmentNumber === "string" ? order.shipmentNumber : "";
    const orderNumber =
      typeof order.orderNumber === "string" ? order.orderNumber : "";
    const customerNameOrder =
      typeof order.customerName === "string" ? order.customerName : "";
    const phone = typeof order.phone === "string" ? order.phone : "";
    const address = typeof order.address === "string" ? order.address : "";
    const deliverySlot =
      typeof order.deliveryDate === "string" ? order.deliveryDate : "";

    // One transaction per (orderId, vendorId).
    const results: JobResult[] = [];
    const vendorIds = [...vendorItems.keys()].sort((a, b) => a.localeCompare(b));
    for (const vendorId of vendorIds) {
      const vendorName = await resolveVendorName(vendorId);
      const items = (vendorItems.get(vendorId) || []).map((it) => ({
        name: it?.name,
        qty: it?.qty,
      }));
      const customerName = vendorCustomerName.get(vendorId) || customerNameOrder;

      const outcome = await db.runTransaction((tx) =>
        createJobAndInitialLeg(tx, db, {
          orderId,
          vendorId,
          vendorName,
          sellerName: vendorName,
          orderShipmentNumber,
          actorUid: requester.uid,
          order: {
            orderNumber,
            customerName,
            phone,
            address,
            deliverySlot,
            items,
          },
        })
      );

      if (outcome.created) {
        results.push({
          vendorId,
          created: true,
          jobId: outcome.jobId,
          shipmentNumber: outcome.shipmentNumber ?? "",
        });
      } else {
        results.push({ vendorId, created: false, jobId: outcome.jobId });
      }
    }

    const createdCount = results.filter((r) => r.created).length;
    return Response.json({
      success: true,
      orderId,
      created: createdCount,
      skipped: results.length - createdCount,
      jobs: results,
    });
  } catch (error) {
    console.error("delivery/jobs/materialize failed:", error);
    return Response.json(
      { error: "Could not create delivery jobs. Please try again." },
      { status: 500 }
    );
  }
}
