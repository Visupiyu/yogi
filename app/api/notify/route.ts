import { verifyRequestUser, type VerifiedUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Trusted notification endpoint — Notification Stage 2.1
//
// Stage 2.0 added the infrastructure; Stage 2.1 implements the three checkout
// events (order.placed / order.stockIssue / order.couponConflict) and
// app/checkout/page.tsx now posts here instead of writing notifications
// directly. The remaining 13 client-side writers are still live and still
// create notifications directly, so client creation stays enabled in
// firestore.rules until every event is migrated — the rules flip is last.
//
// This is deliberately NOT a "write the notification the client describes"
// endpoint. The client may only name an event and a resource id. Everything
// that ends up in the notification document — title, message, role, type,
// userId, userEmail — is produced server-side from Firestore data that the
// requester has been authorized to act on. That is the whole point: the
// Admin SDK bypasses firestore.rules entirely, so a handler that trusted
// client input would be strictly worse than today's client-side writes.
// ---------------------------------------------------------------------------

// Rate limiting reuses the exact pattern (and the same `rateLimits`
// collection, window/count document shape and transaction) already used by
// app/api/create-order/route.ts's isWithinOrderRateLimit(). That helper is
// module-local and not exported, and this stage must not modify the
// order/payment route to export it, so the pattern is copied rather than
// imported. The document key is namespaced separately (`notify_` vs
// `create-order_`) so the two limits cannot consume each other's budget.
//
// Admin-SDK-only counter: no client can reach the `rateLimits` collection,
// so the default-deny rule already covers it and no rules change is needed.
const NOTIFY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
// Higher ceiling than order creation (15): one checkout fans out to a single
// event here, but sellers and admins legitimately fire many status-change
// events in a working session.
const NOTIFY_RATE_LIMIT_MAX = 60;

async function isWithinNotifyRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`notify_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > NOTIFY_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= NOTIFY_RATE_LIMIT_MAX) {
      return false;
    }

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Notification shape
//
// Exactly the 8 fields the existing readers consume and the live
// firestore.rules `create` whitelist permits, so server-written notifications
// are indistinguishable from today's client-written ones and no reader needs
// to change. `read` is pinned to the literal `false` so a handler physically
// cannot create an already-read notification.
// ---------------------------------------------------------------------------
type NotificationRole = "customer" | "seller" | "admin";

type NotificationType =
  | "order"
  | "delivery"
  | "shipping"
  | "refund"
  | "support"
  | "vendor"
  | "withdrawal";

type NotificationDoc = {
  title: string;
  message: string;
  role: NotificationRole;
  type: NotificationType;
  read: false;
  createdAt: Timestamp;
  userId?: string;
  userEmail?: string;
};

// The single write path for every event handler. Deterministic document IDs
// are mandatory: a retried or duplicated request must overwrite the same
// document instead of producing a second notification. Random addDoc() ids
// are deliberately unavailable here — this mirrors the deterministic
// `${userId}_${code}` couponRedemptions id already used to make coupon claims
// idempotent.
async function writeNotification(
  notificationId: string,
  payload: NotificationDoc
): Promise<void> {
  await getAdminDb()
    .collection("notifications")
    .doc(notificationId)
    .set(payload);
}

// Notification messages are shown in fixed-height cards and the live rules
// cap client-written messages at 1000 chars. The Admin SDK bypasses rules, so
// bound it here too rather than relying on that cap.
const MAX_MESSAGE_LENGTH = 1000;

function clampMessage(message: string): string {
  return message.length <= MAX_MESSAGE_LENGTH
    ? message
    : `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}

// ---------------------------------------------------------------------------
// Shared order helpers
// ---------------------------------------------------------------------------
type OrderRecord = {
  userId?: unknown;
  customerName?: unknown;
  finalTotal?: unknown;
  total?: unknown;
  couponCode?: unknown;
  items?: unknown;
};

type LoadedOrder =
  | { ok: true; order: OrderRecord }
  | { ok: false; status: number; error: string };

// Fetch + authorize in one place. Mirrors app/api/send-order-email/route.ts:
// an order that exists but belongs to someone else returns the SAME 404 as a
// missing one, so this endpoint can't be used to probe which order ids exist.
async function loadOwnedOrder(
  orderId: string,
  requester: VerifiedUser
): Promise<LoadedOrder> {
  const snap = await getAdminDb().collection("orders").doc(orderId).get();

  if (!snap.exists) {
    return { ok: false, status: 404, error: "Order not found." };
  }

  const order = snap.data() as OrderRecord;

  if (order?.userId !== requester.uid) {
    return { ok: false, status: 404, error: "Order not found." };
  }

  return { ok: true, order };
}

function orderCustomerName(order: OrderRecord): string {
  return typeof order.customerName === "string" && order.customerName.trim()
    ? order.customerName.trim()
    : "A customer";
}

// The trusted amount. finalTotal is what create-order verified server-side
// (Razorpay's captured amount, or the Pay-on-Delivery amount computed from
// real product/shipping data) — never the browser's grandTotal.
function orderTotal(order: OrderRecord): number {
  const final = Number(order.finalTotal);
  if (Number.isFinite(final)) return final;
  const total = Number(order.total);
  return Number.isFinite(total) ? total : 0;
}

function orderItemIds(order: OrderRecord): string[] {
  if (!Array.isArray(order.items)) return [];
  const ids: string[] = [];
  for (const item of order.items) {
    const id = (item as { id?: unknown })?.id;
    if (typeof id === "string" && id.length > 0 && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function productLabel(data: Record<string, unknown> | undefined): string {
  const title = data?.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const name = data?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return "A product";
}

// ---------------------------------------------------------------------------
// order.placed
//
// Replaces three client writes (admin + per-seller + customer) with one
// authorized request. Seller identity is the security-critical part: the
// order document's items[].vendorId and vendorIds are client-written (the
// checkout cart comes from localStorage), so they are NOT used. Each item's
// vendor is re-read from products/{id}.vendorId, the same way create-order
// re-prices from real product documents instead of trusting the browser.
// ---------------------------------------------------------------------------
const handleOrderPlaced: EventHandler = async ({ requester, resourceId }) => {
  if (!resourceId) {
    return { ok: false, status: 400, error: "This event requires a resourceId." };
  }

  const loaded = await loadOwnedOrder(resourceId, requester);
  if (!loaded.ok) return loaded;

  const order = loaded.order;
  const orderId = resourceId;
  const customerName = orderCustomerName(order);
  const total = orderTotal(order);
  const createdAt = Timestamp.now();

  let written = 0;

  // Admin
  await writeNotification(`order.placed_${orderId}_admin`, {
    title: "🛒 New Order",
    message: clampMessage(
      `${customerName} placed an order worth ₹${total}`
    ),
    type: "order",
    role: "admin",
    read: false,
    createdAt,
  });
  written++;

  // Customer — userId comes from the verified order, which loadOwnedOrder has
  // already proven equals requester.uid.
  await writeNotification(`order.placed_${orderId}_customer`, {
    userId: requester.uid,
    role: "customer",
    title: "✅ Order Placed",
    message: clampMessage(
      `Your order worth ₹${total} has been placed successfully.`
    ),
    type: "order",
    read: false,
    createdAt,
  });
  written++;

  // Sellers — vendor identity derived only from trusted product documents.
  const itemIds = orderItemIds(order);
  const productSnaps = await Promise.all(
    itemIds.map((id) => getAdminDb().collection("products").doc(id).get())
  );

  // vendorId -> product labels sold by that vendor in this order.
  const vendorItems = new Map<string, string[]>();

  productSnaps.forEach((snap, index) => {
    const itemId = itemIds[index];

    if (!snap.exists) {
      // Fail safe: no verified vendor, so no seller notification for this
      // item. Never fall back to a client-supplied vendorId.
      console.error(
        `notify order.placed: order ${orderId} item ${itemId} has no product document; seller notification skipped`
      );
      return;
    }

    const data = snap.data() as Record<string, unknown> | undefined;
    const vendorId = data?.vendorId;

    if (typeof vendorId !== "string" || vendorId.length === 0) {
      console.error(
        `notify order.placed: order ${orderId} product ${itemId} has no vendorId; seller notification skipped`
      );
      return;
    }

    const labels = vendorItems.get(vendorId) ?? [];
    labels.push(productLabel(data));
    vendorItems.set(vendorId, labels);
  });

  for (const [vendorId, labels] of vendorItems) {
    // One notification per vendor rather than per line item — the
    // deterministic id is per-vendor, so multiple items from the same vendor
    // necessarily collapse into a single document.
    await writeNotification(`order.placed_${orderId}_seller_${vendorId}`, {
      userId: vendorId,
      role: "seller",
      title: "🛒 New Order",
      message: clampMessage(`${customerName} ordered ${labels.join(", ")}`),
      type: "order",
      read: false,
      createdAt,
    });
    written++;
  }

  return { ok: true, written };
};

// ---------------------------------------------------------------------------
// order.couponConflict
//
// The client does not get to assert that a conflict happened, and does not
// send the coupon code. The server re-derives both from trusted data: the
// order's own stored couponCode, and F010's deterministic
// couponRedemptions/${uid}_${CODE} claim document. A conflict is precisely
// "a claim for this customer+code exists, but it belongs to a different
// order" — i.e. this order's coupon claim lost the race.
// ---------------------------------------------------------------------------
const handleOrderCouponConflict: EventHandler = async ({
  requester,
  resourceId,
}) => {
  if (!resourceId) {
    return { ok: false, status: 400, error: "This event requires a resourceId." };
  }

  const loaded = await loadOwnedOrder(resourceId, requester);
  if (!loaded.ok) return loaded;

  const order = loaded.order;
  const orderId = resourceId;

  const code =
    typeof order.couponCode === "string"
      ? order.couponCode.trim().toUpperCase()
      : "";

  // No coupon on this order — nothing could have conflicted.
  if (!code) {
    return { ok: true, written: 0 };
  }

  const claimSnap = await getAdminDb()
    .collection("couponRedemptions")
    .doc(`${requester.uid}_${code}`)
    .get();

  // No claim at all, or the claim belongs to THIS order: no conflict.
  if (!claimSnap.exists) {
    return { ok: true, written: 0 };
  }

  const claimedOrderId = (claimSnap.data() as { orderId?: unknown } | undefined)
    ?.orderId;

  if (claimedOrderId === orderId) {
    return { ok: true, written: 0 };
  }

  await writeNotification(`order.couponConflict_${orderId}_${code}`, {
    title: "⚠ Coupon possibly redeemed twice",
    message: clampMessage(
      `Order ${orderId.slice(0, 8)}: coupon "${code}" was already redeemed by this customer on another order — payment was captured, this order was not rejected. Needs manual review.`
    ),
    type: "order",
    role: "admin",
    read: false,
    createdAt: Timestamp.now(),
  });

  return { ok: true, written: 1 };
};

// ---------------------------------------------------------------------------
// order.stockIssue
//
// The one event that needs a narrow client input. Which items failed to
// decrement is produced by reserveStockBestEffort()'s transaction failures at
// runtime and is persisted nowhere, so the server cannot re-derive it. The
// client may therefore identify WHICH of its own order's items failed — and
// nothing else. Every id must belong to the verified order, product names
// come from trusted product documents, and the recipient/role/type/title/
// message/timestamp/document id are all server-controlled.
// ---------------------------------------------------------------------------
const handleOrderStockIssue: EventHandler = async ({
  requester,
  resourceId,
  failedItemIds,
}) => {
  if (!resourceId) {
    return { ok: false, status: 400, error: "This event requires a resourceId." };
  }

  if (failedItemIds === null) {
    return { ok: false, status: 400, error: "failedItemIds is required." };
  }

  // Nothing failed — the client should not have called, but this is not an
  // error and must not fabricate a warning.
  if (failedItemIds.length === 0) {
    return { ok: true, written: 0 };
  }

  const loaded = await loadOwnedOrder(resourceId, requester);
  if (!loaded.ok) return loaded;

  const order = loaded.order;
  const orderId = resourceId;
  const allowedIds = orderItemIds(order);

  // An id outside this order would let a customer name arbitrary products in
  // an admin-facing warning. Reject the whole request rather than filtering.
  const foreign = failedItemIds.filter((id) => !allowedIds.includes(id));
  if (foreign.length > 0) {
    return {
      ok: false,
      status: 400,
      error: "failedItemIds must reference items in this order.",
    };
  }

  const uniqueIds = [...new Set(failedItemIds)];
  const productSnaps = await Promise.all(
    uniqueIds.map((id) => getAdminDb().collection("products").doc(id).get())
  );

  const labels = productSnaps.map((snap, index) => {
    if (!snap.exists) {
      console.error(
        `notify order.stockIssue: order ${orderId} item ${uniqueIds[index]} has no product document`
      );
      return "A product";
    }
    return productLabel(snap.data() as Record<string, unknown> | undefined);
  });

  await writeNotification(`order.stockIssue_${orderId}`, {
    title: "⚠ Stock oversold after payment",
    message: clampMessage(
      `Order ${orderId.slice(0, 8)}: ${labels.join(
        ", "
      )} sold out during checkout — payment was captured, stock was not decremented. Needs manual review.`
    ),
    type: "order",
    role: "admin",
    read: false,
    createdAt: Timestamp.now(),
  });

  return { ok: true, written: 1 };
};

// ---------------------------------------------------------------------------
// Event registry
//
// Each handler owns its own authorization. There is no shared "is this user
// allowed" shortcut on purpose: the check differs per event (order owner vs
// assigned vendor vs admin vs delivery partner), and a generic check would
// inevitably be too permissive for at least one of them. The canonical shape
// to follow is app/api/send-order-email/route.ts — fetch the resource with the
// Admin SDK, confirm it belongs to the verified requester, then derive the
// output from the stored document rather than from anything the client sent.
// ---------------------------------------------------------------------------
type EventResult =
  | { ok: true; written: number }
  | { ok: false; status: number; error: string };

type EventContext = {
  requester: VerifiedUser;
  resourceId: string | null;
  // Only order.stockIssue reads this; null when the client sent none.
  failedItemIds: string[] | null;
};

type EventHandler = (ctx: EventContext) => Promise<EventResult>;

type EventDefinition = {
  // Whether the event is meaningless without a resource to derive data from.
  requiresResourceId: boolean;
  // null = recognised event whose migration has not started yet (501).
  handler: EventHandler | null;
};

const EVENT_REGISTRY: Record<string, EventDefinition> = {
  // Stage 2.1 — app/checkout/page.tsx (implemented)
  "order.placed": { requiresResourceId: true, handler: handleOrderPlaced },
  "order.stockIssue": {
    requiresResourceId: true,
    handler: handleOrderStockIssue,
  },
  "order.couponConflict": {
    requiresResourceId: true,
    handler: handleOrderCouponConflict,
  },
  // Stage 2.2 — admin/orders, seller/orders, seller/orders/[id]
  "order.statusChanged": { requiresResourceId: true, handler: null },
  // Stage 2.3 — support + returns/refunds
  "support.created": { requiresResourceId: true, handler: null },
  "support.updated": { requiresResourceId: true, handler: null },
  "refund.requested": { requiresResourceId: true, handler: null },
  "refund.statusChanged": { requiresResourceId: true, handler: null },
  // Stage 2.4 — delivery, withdrawal, vendor registration
  "delivery.assigned": { requiresResourceId: true, handler: null },
  "delivery.statusChanged": { requiresResourceId: true, handler: null },
  "withdrawal.requested": { requiresResourceId: false, handler: null },
  "vendor.registered": { requiresResourceId: false, handler: null },
};

const MAX_RESOURCE_ID_LENGTH = 200;
const MAX_FAILED_ITEM_IDS = 50;

export async function POST(request: Request) {
  try {
    // 1. Identity. Never trust a uid, role or email from the request body.
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json(
        { error: "Please sign in." },
        { status: 401 }
      );
    }

    // 2. Rate limit, in the same position create-order applies it: after
    //    identity, before any request-driven work.
    if (!(await isWithinNotifyRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    // 3. Body.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    if (typeof body !== "object" || body === null) {
      return Response.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const { event, resourceId, failedItemIds } = body as {
      event?: unknown;
      resourceId?: unknown;
      failedItemIds?: unknown;
    };

    if (typeof event !== "string" || event.length === 0) {
      return Response.json(
        { error: "An event name is required." },
        { status: 400 }
      );
    }

    // Object.prototype keys ("constructor", "__proto__", …) must not resolve
    // to an inherited property and be treated as a registered event.
    if (!Object.prototype.hasOwnProperty.call(EVENT_REGISTRY, event)) {
      return Response.json(
        { error: "Unknown event." },
        { status: 400 }
      );
    }

    const definition = EVENT_REGISTRY[event];

    if (
      resourceId !== undefined &&
      (typeof resourceId !== "string" ||
        resourceId.length === 0 ||
        resourceId.length > MAX_RESOURCE_ID_LENGTH)
    ) {
      return Response.json(
        { error: "Invalid resourceId." },
        { status: 400 }
      );
    }

    const normalizedResourceId =
      typeof resourceId === "string" ? resourceId : null;

    if (definition.requiresResourceId && normalizedResourceId === null) {
      return Response.json(
        { error: "This event requires a resourceId." },
        { status: 400 }
      );
    }

    // The only client-supplied detail beyond the event + resource: which of
    // the order's OWN items hit a stock failure. Ids only — never text, never
    // a recipient. The handler re-checks membership against the order itself.
    let normalizedFailedItemIds: string[] | null = null;

    if (failedItemIds !== undefined) {
      if (
        !Array.isArray(failedItemIds) ||
        failedItemIds.length > MAX_FAILED_ITEM_IDS ||
        !failedItemIds.every(
          (id) =>
            typeof id === "string" &&
            id.length > 0 &&
            id.length <= MAX_RESOURCE_ID_LENGTH
        )
      ) {
        return Response.json(
          { error: "Invalid failedItemIds." },
          { status: 400 }
        );
      }

      normalizedFailedItemIds = failedItemIds as string[];
    }

    // 4. Dispatch. A recognised event with no handler is not an error in the
    //    client's request — its migration simply has not happened yet, and
    //    the existing client-side write is still the live path for it.
    if (definition.handler === null) {
      return Response.json(
        { error: "This event is not implemented yet.", event },
        { status: 501 }
      );
    }

    const result = await definition.handler({
      requester,
      resourceId: normalizedResourceId,
      failedItemIds: normalizedFailedItemIds,
    });

    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return Response.json({ success: true, written: result.written });
  } catch (error) {
    // Log the real cause server-side; never return it. Failures here can
    // involve the service account or Firestore internals.
    console.error("notify: unexpected failure:", error);
    return Response.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
