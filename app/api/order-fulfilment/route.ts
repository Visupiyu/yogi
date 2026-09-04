import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";

// Read-only, but every call costs one order read plus a sellerOrders query, so
// an unbounded loop is Firestore read amplification. Generous by design: this
// backs ordinary page loads on the order-detail and returns screens.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Per-item fulfilment status for the CUSTOMER who owns the order.
//
// Item fulfilment lives in sellerOrders, which firestore.rules restricts to
// the owning seller and admins — deliberately, because those records also
// carry each vendor's subtotal, commission and earnings. Opening them to the
// customer to power tracking would hand over the seller's margins.
//
// So the customer never reads that collection. This route reads it with the
// Admin SDK, verifies the caller actually owns the parent order, and returns
// a projection containing ONLY what a customer needs to track their own
// purchase: the product, the quantity, and where it has got to.
//
// Never returned: vendorId, vendorSubtotal, vendorCommission, vendorEarning,
// price, sellerNotes, or anything belonging to another customer's order.
//
// Multi-seller orders come back as one flat list of products. Each line
// carries its own status, so items from different sellers are independently
// trackable without the customer being told who supplies what.
// ---------------------------------------------------------------------------

type TrackedItem = {
  /** The product this line is for — the customer already sees it. */
  productId: string | null;
  /**
   * The line's stable fulfilment key (i{vendorIndex}_{productId}). NOT
   * sensitive — no vendor id, no money — and it is what lets the customer's
   * order page join a line to its status and to any return/replace request.
   * Null on a legacy record that predates itemKey.
   */
  itemKey: string | null;
  name: string;
  qty: number;
  size: string | null;
  color: string | null;
  status: string;
  deliveredAt: string | null;
};

function asIso(value: unknown): string | null {
  if (!value) return null;

  const candidate = value as { toDate?: () => Date };
  if (typeof candidate.toDate === "function") {
    try {
      return candidate.toDate().toISOString();
    } catch {
      return null;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    // Keyed on the server-verified uid, before the Firestore reads below.
    if (
      !(await isWithinRateLimit(
        "order-fulfilment",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    let body: { orderId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const orderId =
      typeof body.orderId === "string" ? body.orderId.trim() : "";

    if (!orderId) {
      return Response.json({ error: "Missing order id." }, { status: 400 });
    }

    const db = getAdminDb();
    const orderSnap = await db.collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    const order = orderSnap.data() as Record<string, unknown>;

    // Ownership, not just authentication. Admins may look too.
    if (order.userId !== requester.uid && !requester.isAdmin) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const recordsSnap = await db
      .collection("sellerOrders")
      .where("orderId", "==", orderId)
      .get();

    const items: TrackedItem[] = [];

    for (const doc of recordsSnap.docs) {
      const record = doc.data() as {
        items?: {
          itemKey?: string;
          id?: unknown;
          name?: unknown;
          qty?: unknown;
          size?: unknown;
          color?: unknown;
        }[];
        itemFulfilment?: Record<
          string,
          { status?: unknown; deliveredAt?: unknown }
        >;
      };

      (record.items || []).forEach((item, index) => {
        const key = item.itemKey || `i${index}`;
        const entry = record.itemFulfilment?.[key];

        items.push({
          productId: typeof item.id === "string" ? item.id : null,
          itemKey: typeof item.itemKey === "string" ? item.itemKey : null,
          name: typeof item.name === "string" ? item.name : "Item",
          qty: Number(item.qty) || 1,
          size: typeof item.size === "string" && item.size ? item.size : null,
          color: typeof item.color === "string" && item.color ? item.color : null,
          status: typeof entry?.status === "string" ? entry.status : "Confirmed",
          deliveredAt: asIso(entry?.deliveredAt),
        });
      });
    }

    // No records yet means the order has not been confirmed — the customer
    // sees an empty list rather than an error, and the page falls back to the
    // order-level status.
    return Response.json({ items, confirmed: recordsSnap.size > 0 });
  } catch (error) {
    console.error("order-fulfilment failed:", error);
    return Response.json(
      { error: "Could not load fulfilment status." },
      { status: 500 }
    );
  }
}
