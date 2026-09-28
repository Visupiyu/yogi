import { Timestamp, type WriteBatch } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";

// ---------------------------------------------------------------------------
// /api/seller/stock-notifications — back-in-stock requests for the signed-in
// seller's OWN products.
//
// GET   a count of waiting customers per product (plus the product's current
//       stock). Never the customers' names or emails — the seller used to read
//       the request documents, emails included, straight from Firestore.
// POST  { productId } "Notify waiting customers": the product must be the
//       seller's and back in stock; every waiting customer gets an in-app
//       YOMICO notification, then their requests are cleared.
//
// The seller is the verified token; ownership is always the product's
// vendorId (a request's own vendorId is not trusted).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const BATCH_LIMIT = 400;

type Req = { id: string; data: Record<string, unknown> };

async function sellerOrError(request: Request, namespace: string) {
  const requester = await verifyRequestUser(request);
  if (!requester) return { error: Response.json({ error: "Please sign in." }, { status: 401 }) } as const;
  if (!(await isWithinRateLimit(namespace, requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
    return { error: Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 }) } as const;
  }
  const db = getAdminDb();
  const vendor = await findSellerVendor(db, requester.uid);
  if (vendor.kind === "none") {
    return { error: Response.json({ error: "No seller account found for this login." }, { status: 403 }) } as const;
  }
  if (vendor.kind === "duplicate") {
    return { error: Response.json({ error: "Your seller account needs attention. Please contact support." }, { status: 409 }) } as const;
  }
  return { requester, db, status: vendor.data.status } as const;
}

export async function GET(request: Request) {
  try {
    const auth = await sellerOrError(request, "seller-stock-notifications");
    if ("error" in auth) return auth.error;
    const { requester, db } = auth;

    const [productsSnap, requestsSnap] = await Promise.all([
      db.collection("products").where("vendorId", "==", requester.uid).get(),
      db.collection("stockNotifications").where("vendorId", "==", requester.uid).get(),
    ]);
    const products = new Map(productsSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
    const counts = new Map<string, number>();
    for (const d of requestsSnap.docs) {
      const productId = d.get("productId");
      if (typeof productId === "string" && products.has(productId)) {
        counts.set(productId, (counts.get(productId) || 0) + 1);
      }
    }
    const items = [...counts.entries()]
      .map(([productId, waiting]) => {
        const p = products.get(productId) || {};
        const stock = Number(p.stock);
        return {
          productId,
          productName: typeof p.title === "string" ? p.title : typeof p.name === "string" ? p.name : "",
          waiting,
          stock: Number.isFinite(stock) && stock > 0 ? Math.floor(stock) : 0,
        };
      })
      .sort((a, b) => b.waiting - a.waiting || a.productName.localeCompare(b.productName));
    return Response.json({ items });
  } catch (error) {
    console.error("seller stock notifications failed:", error);
    return Response.json({ error: "Could not load back-in-stock requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await sellerOrError(request, "seller-stock-notify");
    if ("error" in auth) return auth.error;
    const { requester, db, status } = auth;
    if (status !== "Approved") {
      return Response.json({ error: "Only approved sellers can notify customers." }, { status: 403 });
    }

    let body: { productId?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!isValidDocId(productId)) return Response.json({ error: "Product not found." }, { status: 404 });

    const productSnap = await db.collection("products").doc(productId).get();
    if (!productSnap.exists || productSnap.get("vendorId") !== requester.uid) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }
    const stock = Number(productSnap.get("stock"));
    if (!Number.isFinite(stock) || stock <= 0) {
      return Response.json({ error: "Restock this product first, then notify waiting customers." }, { status: 409 });
    }
    const title = productSnap.get("title");
    const productName = typeof title === "string" && title ? title : String(productSnap.get("name") || "This product");

    const requestsSnap = await db.collection("stockNotifications").where("productId", "==", productId).get();
    const requests: Req[] = requestsSnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));

    // Who to notify: the uid on the request, or (for requests made before
    // they carried one) the account with that email. Each customer once.
    const recipients = new Set<string>();
    for (const r of requests) {
      if (typeof r.data.userId === "string" && r.data.userId) {
        recipients.add(r.data.userId);
      } else if (typeof r.data.userEmail === "string" && r.data.userEmail) {
        const match = await db.collection("users").where("email", "==", r.data.userEmail).limit(2).get();
        if (match.size === 1) recipients.add(match.docs[0].id);
      }
    }

    const now = Timestamp.now();
    const writes: ((b: WriteBatch) => void)[] = [];
    for (const uid of recipients) {
      writes.push((b) =>
        b.set(db.collection("notifications").doc(), {
          title: "Back in stock",
          message: `${productName.slice(0, 150)} is back in stock.`,
          userId: uid,
          role: "customer",
          type: "vendor",
          read: false,
          createdAt: now,
        })
      );
    }
    for (const r of requests) {
      writes.push((b) => b.delete(db.collection("stockNotifications").doc(r.id)));
    }
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      writes.slice(i, i + BATCH_LIMIT).forEach((w) => w(batch));
      await batch.commit();
    }

    return Response.json({ success: true, notified: recipients.size, cleared: requests.length });
  } catch (error) {
    console.error("seller stock notify failed:", error);
    return Response.json({ error: "Couldn't notify customers. Please try again." }, { status: 500 });
  }
}
